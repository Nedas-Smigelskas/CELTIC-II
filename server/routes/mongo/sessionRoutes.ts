import { Router } from "express";
import shortid from "shortid";
import bodyParser from "body-parser";
import axios from "axios";
import { Logger } from "../../utils/logger";
import { Session, Task } from "../../models";
import { verifyCode } from "../../utils/codeVerifier";
import { getSocketIO } from "../../utils/socketService";

const router = Router();

router.use(bodyParser.json());

router.post("/api/create-session", async (req, res) => {
	try {
		const sessionId = shortid.generate();
		const { teacherName, teacherId, task, mode, templateId, taskList } = req.body;

		Logger.debug("Creating session", { sessionId, teacherName, teacherId, task, mode, templateId });
		const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
		const oldSessionsDeleted = await Session.deleteMany({
			createdAt: { $lt: twentyFourHoursAgo }
		});
		
		if (oldSessionsDeleted.deletedCount > 0) {
			Logger.info(`Cleaned up ${oldSessionsDeleted.deletedCount} old sessions`);
		}
		if (teacherId) {
			const teacherSessionsDeleted = await Session.deleteMany({
				teacherId: teacherId
			});
			
			if (teacherSessionsDeleted.deletedCount > 0) {
				Logger.info(`Cleaned up ${teacherSessionsDeleted.deletedCount} existing sessions for teacher ${teacherName}`);
			}
		}

		const sessionData: any = {
			code: sessionId,
			teacherName,
			teacherId,
			task,
			students: [],
			mode: mode || "empty",
			sessionState: mode === "game" ? "lobby" : "active", // Game mode starts in lobby
		};
		if (mode && mode !== "empty" && templateId && taskList) {
			sessionData.templateId = templateId;
			sessionData.taskList = taskList;
			sessionData.studentProgress = [];
		}

		const newSession = new Session(sessionData);

		await newSession.save();
		Logger.info("Session created successfully", { sessionId, mode: sessionData.mode });
		res.json({ sessionId, teacherName, task });
	} catch (error: any) {
		Logger.error("Error creating session", error);
		res.status(500).json({
			error: "Failed to create session",
			details: error.message,
		});
	}
});

router.get("/api/session/:sessionId", async (req, res) => {
	try {
		const session = await Session.findOne({
			code: req.params.sessionId,
		}).populate("taskList");
		
		if (session) {
			const responseData: any = {
				session: {
					code: session.code,
					teacherName: session.teacherName,
					teacherId: session.teacherId,
					task: session.task,
					students: session.students || [],
					mode: session.mode,
					sessionState: session.sessionState,
				},
			};
			if (session.mode !== "empty" && session.studentProgress) {
				responseData.session.studentProgress = session.studentProgress.map((sp: any) => ({
					studentId: sp.studentId,
					currentTaskIndex: sp.currentTaskIndex,
					completedTasks: sp.completedTasks.length,
					totalPoints: sp.totalPoints,
				}));
				
				// Include task list summary
				if (session.taskList) {
					responseData.session.taskList = (session.taskList as any[]).map((task: any) => ({
						id: task._id,
						title: task.title,
					}));
				}
			}

			res.json(responseData);
		} else {
			res.status(404).json({ error: "Session not found" });
		}
	} catch (error) {
		Logger.error("Error fetching session", error);
		res.status(500).json({ error: "Failed to fetch session" });
	}
});

router.get("/api/teacher/:teacherId/active-session", async (req, res) => {
	try {
		const { teacherId } = req.params;
		
		// Find the most recent active session for this teacher
		const session = await Session.findOne({
			teacherId: teacherId,
			isActive: true,
			sessionState: { $ne: "ended" },
		}).sort({ createdAt: -1 }); // Get most recent first
		
		if (session) {
			res.json({
				hasActiveSession: true,
				sessionId: session.code,
				teacherName: session.teacherName,
				task: session.task,
				mode: session.mode,
				createdAt: session.createdAt
			});
		} else {
			res.json({
				hasActiveSession: false
			});
		}
	} catch (error) {
		Logger.error("Error fetching teacher's active session", error);
		res.status(500).json({ error: "Failed to fetch active session" });
	}
});

router.post("/api/session/:sessionId/join", async (req, res) => {
	try {
		const { studentId } = req.body;
		const session = await Session.findOne({
			code: req.params.sessionId,
		});

		if (!session) {
			return res.status(404).json({ error: "Session not found" });
		}

		if (!session.students.includes(studentId)) {
			session.students.push(studentId);
			await session.save();
			if (session.mode === "game" && session.sessionState === "lobby") {
				const io = getSocketIO();
				if (io) {
					io.emit("lobbyUpdate", {
						sessionId: session.code,
						students: session.students,
					});
					Logger.info("Lobby update emitted", { sessionId: session.code, studentCount: session.students.length });
				}
			}
		}

		res.json({ success: true, students: session.students });
	} catch (error) {
		Logger.error("Error joining session", error);
		res.status(500).json({ error: "Failed to join session" });
	}
});

// Start session (transition from lobby to active for game mode)
router.post("/api/session/:sessionId/start", async (req, res) => {
	try {
		const session = await Session.findOne({
			code: req.params.sessionId,
		});

		if (!session) {
			return res.status(404).json({ error: "Session not found" });
		}

		if (session.sessionState !== "lobby") {
			return res.status(400).json({ error: "Session already started" });
		}

		session.sessionState = "active";
		session.startedAt = new Date();
		session.taskStartedAt = new Date(); // Start timer for first task
		await session.save();

		// Emit session started event to all students
		const io = getSocketIO();
		if (io) {
			io.emit("sessionStarted", { sessionId: session.code });
			Logger.info("Session started event emitted", { sessionId: session.code });
		}

		Logger.info("Session started", { sessionId: req.params.sessionId, studentCount: session.students.length });
		res.json({ success: true, sessionState: "active" });
	} catch (error) {
		Logger.error("Error starting session", error);
		res.status(500).json({ error: "Failed to start session" });
	}
});

router.post("/api/session/:sessionId/leave", async (req, res) => {
	try {
		const { studentId } = req.body;
		const session = await Session.findOne({
			code: req.params.sessionId,
		});

		if (!session) {
			return res.status(404).json({ error: "Session not found" });
		}

		session.students = session.students.filter(
			(id: string) => id !== studentId
		);
		await session.save();

		res.json({ success: true, students: session.students });
	} catch (error) {
		Logger.error("Error leaving session", error);
		res.status(500).json({ error: "Failed to leave session" });
	}
});

// Get current task for a student in a session
router.get("/api/session/:sessionId/student/:studentId/current-task", async (req, res) => {
	try {
		const { sessionId, studentId } = req.params;
		const session = await Session.findOne({ code: sessionId }).populate("taskList");

		if (!session) {
			return res.status(404).json({ error: "Session not found" });
		}

		// If session has ended, return ended state
		if (session.sessionState === "ended") {
			return res.json({
				mode: session.mode,
				sessionState: "ended",
				teacherName: session.teacherName,
				sessionCode: session.code,
				message: "This session has ended",
			});
		}

		// If game mode and still in lobby, return lobby state
		if (session.mode === "game" && session.sessionState === "lobby") {
			return res.json({
				mode: "game",
				sessionState: "lobby",
				teacherName: session.teacherName,
				sessionCode: session.code,
				students: session.students,
			});
		}

		// If it's an empty session, return basic task info
		if (session.mode === "empty" || !session.taskList || session.taskList.length === 0) {
			return res.json({
				mode: "empty",
				task: session.task,
				teacherName: session.teacherName,
				sessionCode: session.code,
			});
		}

		// Find student's progress
		let studentProgress = session.studentProgress?.find((sp: any) => sp.studentId === studentId);
		
		// Initialize progress if student is new
		if (!studentProgress) {
			studentProgress = {
				studentId,
				currentTaskIndex: 0,
				completedTasks: [],
				totalPoints: 0,
				joinedAt: new Date(),
			};
			session.studentProgress = session.studentProgress || [];
			session.studentProgress.push(studentProgress);
			await session.save();
		}

		const currentTaskIndex = studentProgress.currentTaskIndex || 0;
		const currentTask = session.taskList[currentTaskIndex] as any;

		if (!currentTask) {
			return res.json({
				mode: session.mode,
				allTasksCompleted: true,
				totalTasks: session.taskList.length,
				completedTasks: studentProgress.completedTasks.length,
			});
		}

		res.json({
			mode: session.mode,
			sessionState: session.sessionState,
			task: {
				id: currentTask._id,
				title: currentTask.title,
				description: currentTask.description,
				starterCode: currentTask.starterCode,
				difficulty: currentTask.difficulty,
				points: currentTask.points,
				timeLimit: currentTask.timeLimit,
			},
			progress: {
				currentTaskIndex,
				totalTasks: session.taskList.length,
				completedTasks: studentProgress.completedTasks.length,
				totalPoints: studentProgress.totalPoints,
				completedTaskIds: studentProgress.completedTasks.map((ct: any) => ct.taskId.toString()),
			},
			teacherName: session.teacherName,
			sessionCode: session.code,
			taskStartedAt: session.taskStartedAt,
		});
	} catch (error) {
		Logger.error("Error fetching current task", error);
		res.status(500).json({ error: "Failed to fetch current task" });
	}
});

// Get specific task by index (for teaching mode navigation)
router.get("/api/session/:sessionId/student/:studentId/task/:taskIndex", async (req, res) => {
	try {
		const { sessionId, studentId, taskIndex } = req.params;
		const session = await Session.findOne({ code: sessionId }).populate("taskList");

		if (!session) {
			return res.status(404).json({ error: "Session not found" });
		}

		if (session.mode !== "teaching") {
			return res.status(400).json({ error: "Task navigation is only available in teaching mode" });
		}

		const index = parseInt(taskIndex);
		if (isNaN(index) || index < 0 || index >= session.taskList.length) {
			return res.status(400).json({ error: "Invalid task index" });
		}

		
		// Update student's currentTaskIndex in database
		let studentProgress = session.studentProgress?.find((sp: any) => sp.studentId === studentId);
		if (studentProgress) {
			studentProgress.currentTaskIndex = index;
			await session.save();
			Logger.info(`Updated currentTaskIndex for student ${studentId} to ${index}`);

			// Notify teacher in real time
			const io = getSocketIO();
			if (io) {
				io.emit("studentProgressUpdate", {
					studentId,
					currentTaskIndex: index,
					completedTasks: studentProgress.completedTasks.length,
					totalPoints: studentProgress.totalPoints,
				});
			}
		}

		const task = session.taskList[index] as any;

		res.json({
			task: {
				id: task._id,
				title: task.title,
				description: task.description,
				starterCode: task.starterCode,
				difficulty: task.difficulty,
				points: task.points,
				timeLimit: task.timeLimit,
			},
			taskIndex: index,
			totalTasks: session.taskList.length,
			progress: {
				currentTaskIndex: index,
				totalTasks: session.taskList.length,
				completedTasks: studentProgress.completedTasks.length,
				totalPoints: studentProgress.totalPoints,
				completedTaskIds: studentProgress.completedTasks.map((ct: any) => ct.taskId.toString()),
			},
		});
	} catch (error) {
		Logger.error("Error fetching task by index", error);
		res.status(500).json({ error: "Failed to fetch task" });
	}
});

// Submit task for verification
router.post("/api/session/:sessionId/student/:studentId/submit", async (req, res) => {
	try {
		const { sessionId, studentId } = req.params;
		const { code, containerId } = req.body;

		if ((code === undefined || code === null) || !containerId) {
			return res.status(400).json({ error: "Code and containerId are required" });
		}

		const session = await Session.findOne({ code: sessionId }).populate("taskList");

		if (!session) {
			return res.status(404).json({ error: "Session not found" });
		}

		// For empty sessions, just acknowledge (no verification)
		if (session.mode === "empty") {
			return res.json({
				success: true,
				message: "Code submitted successfully",
				mode: "empty",
			});
		}

		// Find student's progress
		let studentProgress = session.studentProgress?.find((sp: any) => sp.studentId === studentId);
		
		if (!studentProgress) {
			return res.status(404).json({ error: "Student progress not found" });
		}

		const currentTaskIndex = studentProgress.currentTaskIndex || 0;
		const currentTask = session.taskList[currentTaskIndex] as any;

		if (!currentTask) {
			return res.json({
				success: true,
				allTasksCompleted: true,
				message: "All tasks completed!",
			});
		}

		const taskId = currentTask._id.toString();
		const participantIds = Array.from(
			new Set(
				[
					...(session.students || []),
					...(session.studentProgress || []).map((sp: any) => sp.studentId),
				].filter(Boolean)
			)
		) as string[];
		if (!participantIds.includes(studentId)) {
			participantIds.push(studentId);
		}

		const hasTaskRecord = (sp: any, lookupTaskId: string) =>
			sp.completedTasks?.some((ct: any) => ct.taskId.toString() === lookupTaskId);

		const alreadyFinalizedForCurrentTask = hasTaskRecord(studentProgress, taskId);
		const alreadyCompletedForCurrentTask = studentProgress.completedTasks.some(
			(ct: any) => ct.taskId.toString() === taskId && ct.passed
		);

		// In game mode, once a task is finalized (pass or timeout fail), block duplicates
		if (session.mode === "game" && alreadyFinalizedForCurrentTask) {
			return res.status(400).json({
				error: "Task already finalized",
				message: "This task has already been finalized for you.",
			});
		}

		// In teaching mode, only successful completion locks the task
		if (session.mode !== "game" && alreadyCompletedForCurrentTask) {
			return res.status(400).json({
				error: "Task already completed",
				message: "You have already completed this task. Please move to the next task.",
			});
		}

		const taskStartedAtMs = session.taskStartedAt
			? new Date(session.taskStartedAt).getTime()
			: studentProgress.joinedAt.getTime();
		const taskTimeLimitMs = (currentTask.timeLimit || 0) * 1000;
		const isTimedOutSubmission =
			session.mode === "game" &&
			taskTimeLimitMs > 0 &&
			Date.now() >= taskStartedAtMs + taskTimeLimitMs;

		const nextTask = session.taskList[currentTaskIndex + 1] as any;
		let pointsEarned = 0;
		let passed = false;
		let finalizedInGame = false;
		let timedOut = false;
		let verificationResult: any = null;

		const completedAt = new Date();
		const timeToComplete = Math.max(0, completedAt.getTime() - taskStartedAtMs);
		const attemptCountForTask =
			(studentProgress.completedTasks.filter(
				(ct: any) => ct.taskId.toString() === taskId
			).length || 0) + 1;

		if (isTimedOutSubmission) {
			// Time expired in game mode: finalize as failed with zero points, but still count progression
			verificationResult = {
				passed: false,
				totalTests: Array.isArray(currentTask.testCases) ? currentTask.testCases.length : 0,
				passedTests: 0,
				failedTests: [],
				error: "Time limit exceeded",
			};

			studentProgress.completedTasks.push({
				taskId: currentTask._id,
				completedAt,
				timeToComplete,
				points: 0,
				attempts: attemptCountForTask,
				passed: false,
			});
			studentProgress.currentTaskIndex = currentTaskIndex + 1;
			finalizedInGame = true;
			timedOut = true;

			await session.save();
			Logger.info("Task failed due to timeout", {
				sessionId: session.code,
				studentId,
				taskId,
			});
		} else {
			// Verify code against test cases when still within time
			Logger.info("Verifying code for student", { studentId, taskId: currentTask._id });
			verificationResult = await verifyCode(code, currentTask.testCases, containerId);

			if (!verificationResult.passed) {
				// Regular failed attempt before timeout: do not finalize game task yet
				return res.json({
					success: true,
					passed: false,
					verificationResult,
					timedOut: false,
					finalizedInGame: false,
				});
			}

			passed = true;

			// Calculate points based on completion order with scaling from 100% to 50%
			const completionOrder = session.studentProgress!.filter((sp: any) =>
				hasTaskRecord(sp, taskId)
			).length;
			const totalStudents = participantIds.length;

			let pointsMultiplier = 1.0;
			if (totalStudents > 1 && completionOrder > 0) {
				const decayFactor = (completionOrder / (totalStudents - 1)) * 0.5;
				pointsMultiplier = 1.0 - decayFactor;
			}
			pointsMultiplier = Math.max(0.5, pointsMultiplier);
			pointsEarned = Math.round(currentTask.points * pointsMultiplier);

			studentProgress.completedTasks.push({
				taskId: currentTask._id,
				completedAt,
				timeToComplete,
				points: pointsEarned,
				attempts: attemptCountForTask,
				passed: true,
			});

			if (session.mode === "game") {
				studentProgress.totalPoints += pointsEarned;
				studentProgress.currentTaskIndex = currentTaskIndex + 1;
				finalizedInGame = true;
			}

			await session.save();

			Logger.info("Task completed successfully", {
				studentId,
				taskId: currentTask._id,
				pointsEarned,
				newTotal: studentProgress.totalPoints,
			});
		}

		let allStudentsCompletedCurrentTask = false;
		if (session.mode === "game") {
			allStudentsCompletedCurrentTask = participantIds.every((participantId) => {
				const sp = session.studentProgress?.find(
					(progress: any) => progress.studentId === participantId
				);
				return !!sp && hasTaskRecord(sp, taskId);
			});

			if (nextTask && allStudentsCompletedCurrentTask) {
				Logger.info("All students finalized current task, advancing to next", {
					sessionId: session.code,
					currentTaskIndex,
					nextTaskIndex: currentTaskIndex + 1,
				});

				// Start next-task timer only after everyone has finalized current task
				session.taskStartedAt = new Date();
				await session.save();

				const io = req.app.get("io");
				if (io) {
					io.to(session.code).emit("taskAdvanced", {
						sessionId: session.code,
						nextTask: {
							id: nextTask._id,
							title: nextTask.title,
							description: nextTask.description,
							starterCode: nextTask.starterCode,
							difficulty: nextTask.difficulty,
							points: nextTask.points,
							timeLimit: nextTask.timeLimit,
						},
						taskStartedAt: session.taskStartedAt,
						progress: {
							currentTaskIndex: currentTaskIndex + 1,
							totalTasks: session.taskList.length,
						},
					});
				}
			}

			if (!nextTask) {
				const allStudentsFinished = participantIds.every((participantId) => {
					const sp = session.studentProgress?.find(
						(progress: any) => progress.studentId === participantId
					);
					return !!sp && sp.currentTaskIndex >= session.taskList.length;
				});

				if (allStudentsFinished) {
					Logger.info("All students completed all tasks, auto-ending session", {
						sessionId: session.code,
					});

					session.sessionState = "ended";
					session.isActive = false;
					session.endedAt = new Date();
					await session.save();

					const io = req.app.get("io");
					if (io) {
						try {
							const port = process.env.PORT || 8000;
							const leaderboardResponse = await axios.get(
								`http://localhost:${port}/api/session/${session.code}/leaderboard`
							);
							const leaderboardData = leaderboardResponse.data;

							io.to(session.code).emit("sessionEnded", {
								teacherId: session.teacherId,
								sessionId: session.code,
								message: "All tasks completed! Session has ended.",
								leaderboard: leaderboardData?.leaderboard || null,
								sessionInfo: leaderboardData?.sessionInfo || null,
								taskAnalytics: leaderboardData?.taskAnalytics || null,
							});
						} catch (error) {
							Logger.error("Error fetching leaderboard for auto-end", error);
						}
					}
				}
			}
		}

		return res.json({
			success: true,
			passed,
			verificationResult,
			pointsEarned,
			totalPoints: studentProgress.totalPoints,
			nextTask: nextTask
				? {
						id: nextTask._id,
						title: nextTask.title,
						description: nextTask.description,
						starterCode: nextTask.starterCode,
						difficulty: nextTask.difficulty,
						points: nextTask.points,
						timeLimit: nextTask.timeLimit,
				  }
				: null,
			allTasksCompleted: !nextTask,
			taskStartedAt:
				session.mode === "game" && nextTask && allStudentsCompletedCurrentTask
					? session.taskStartedAt
					: null,
			timedOut,
			finalizedInGame,
			progress: {
				currentTaskIndex: studentProgress.currentTaskIndex,
				totalTasks: session.taskList.length,
				completedTasks: studentProgress.completedTasks.length,
				completedTaskIds: studentProgress.completedTasks.map((ct: any) =>
					ct.taskId.toString()
				),
			},
		});
} catch (error: any) {
	Logger.error("Error submitting task", error);
	res.status(500).json({ 
		error: "Failed to submit task",
		details: error.message,
	});
}
});

router.delete("/api/session/:sessionId", async (req, res) => {
	try {
		await Session.deleteOne({ code: req.params.sessionId });
		res.json({ success: true });
	} catch (error) {
		Logger.error("Error deleting session", error);
		res.status(500).json({ error: "Failed to delete session" });
	}
});

router.get("/api/session/:sessionId/leaderboard", async (req, res) => {
	try {
		const session = await Session.findOne({
			code: req.params.sessionId,
		}).populate("taskList");

		if (!session) {
			return res.status(404).json({ error: "Session not found" });
		}

		// Only return leaderboard for game mode sessions
		if (session.mode === "empty" || !session.studentProgress || session.studentProgress.length === 0) {
			return res.json({ 
				leaderboard: [],
				taskAnalytics: [],
				sessionInfo: {
					code: session.code,
					teacherName: session.teacherName,
					mode: session.mode,
					totalTasks: session.taskList?.length || 0,
					totalStudents: session.students?.length || 0,
				}
			});
		}

		const participantIds = Array.from(
			new Set(
				[
					...(session.students || []),
					...(session.studentProgress || []).map((sp: any) => sp.studentId),
				].filter(Boolean)
			)
		) as string[];
		const totalParticipants = participantIds.length;

		const taskAnalytics = (session.taskList as any[]).map((task: any, index: number) => {
			const taskId = task._id.toString();
			let successfulCount = 0;
			let failedCount = 0;

			participantIds.forEach((participantId) => {
				const sp = session.studentProgress?.find((progress: any) => progress.studentId === participantId);
				const taskRecords = (sp?.completedTasks || []).filter(
					(record: any) => record.taskId.toString() === taskId
				);

				if (taskRecords.some((record: any) => record.passed === true)) {
					successfulCount += 1;
				} else if (taskRecords.some((record: any) => record.passed === false)) {
					failedCount += 1;
				}
			});

			const notCompletedCount = Math.max(
				0,
				totalParticipants - successfulCount - failedCount
			);

			return {
				taskId,
				taskIndex: index + 1,
				title: task.title,
				totalStudents: totalParticipants,
				successfulCount,
				failedCount,
				notCompletedCount,
				unsuccessfulCount: totalParticipants - successfulCount,
				completionRate:
					totalParticipants > 0
						? Math.round((successfulCount / totalParticipants) * 100)
						: 0,
			};
		});

		// Build leaderboard from student progress
		const leaderboard = session.studentProgress
			.filter((sp: any) => sp && sp.studentId) // Filter out invalid entries
			.map((sp: any) => {
				// Safely access completedTasks array
				const completedTasksArray = Array.isArray(sp.completedTasks) ? sp.completedTasks : [];
				const successfulTasksArray = completedTasksArray.filter(
					(task: any) => task?.passed === true
				);
				const failedTasksArray = completedTasksArray.filter(
					(task: any) => task?.passed === false
				);
				
				// Calculate total time spent
				const totalTime = successfulTasksArray.reduce((sum: number, task: any) => {
					const timeToComplete = task?.timeToComplete || 0;
					return sum + timeToComplete;
				}, 0);
				
				// Get completion percentage
				const totalTasks = session.taskList?.length || 0;
				const completionPercentage = totalTasks > 0 ? 
					Math.round((successfulTasksArray.length / totalTasks) * 100) : 0;

				return {
					studentId: sp.studentId || 'Unknown',
					totalPoints: sp.totalPoints || 0,
					completedTasks: successfulTasksArray.length,
					failedTasks: failedTasksArray.length,
					totalTasks: totalTasks,
					completionPercentage,
					totalTime: Math.round(totalTime / 1000), // Convert to seconds
					averageTimePerTask: successfulTasksArray.length > 0 ? 
						Math.round(totalTime / successfulTasksArray.length / 1000) : 0,
				};
			})
			.sort((a: any, b: any) => {
				// Sort by points (descending), then by completed tasks, then by time (ascending)
				if (b.totalPoints !== a.totalPoints) {
					return b.totalPoints - a.totalPoints;
				}
				if (b.completedTasks !== a.completedTasks) {
					return b.completedTasks - a.completedTasks;
				}
				return a.totalTime - b.totalTime;
			});

		// Add rank
		leaderboard.forEach((entry: any, index: number) => {
			entry.rank = index + 1;
		});

		res.json({
			leaderboard,
			taskAnalytics,
			sessionInfo: {
				code: session.code,
				teacherName: session.teacherName,
				mode: session.mode,
				totalTasks: session.taskList?.length || 0,
				totalStudents: totalParticipants,
			},
		});
	} catch (error) {
		Logger.error("Error fetching leaderboard", { 
			error, 
			sessionId: req.params.sessionId,
			message: error instanceof Error ? error.message : String(error),
			stack: error instanceof Error ? error.stack : undefined
		});
		res.status(500).json({ 
			error: "Failed to fetch leaderboard",
			message: error instanceof Error ? error.message : "Unknown error"
		});
	}
});

router.get("/api/create-task/:sessionId", async (req, res) => {
	try {
		const session = await Session.findOne({
			code: req.params.sessionId,
		});
		if (session) {
			res.json({
				session: {
					code: session.code,
					teacherName: session.teacherName,
					task: session.task,
					students: session.students || [],
				},
			});
		} else {
			res.status(404).json({ error: "Session not found" });
		}
	} catch (error) {
		Logger.error("Error fetching task", error);
		res.status(500).json({ error: "Failed to fetch task" });
	}
});

export default router;



