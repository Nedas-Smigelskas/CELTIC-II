import axios from "axios";
import React, { useEffect, useRef, useState } from "react";
import { CodeEditor } from "../../code-editor/code-editor";
import "./student-page.css";
import "./leaderboard.css";
import { InputText } from "primereact/inputtext";
import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import { useSocket } from "../../socketContext";
import { useNavigate } from "react-router-dom";
import { Toast } from "primereact/toast";

interface TestResult {
	input: string;
	expectedOutput: string;
	description: string;
}

interface VerificationResult {
	passed: boolean;
	totalTests: number;
	passedTests: number;
	failedTests: TestResult[];
	error?: string;
}

interface Session {
	code: string;
	teacherName: string;
	task: string;
	mode?: string;
	sessionState?: "lobby" | "active" | "ended";
	students?: string[];
	currentTask?: {
		id: string;
		title: string;
		description: string;
		starterCode?: string;
		difficulty: string;
		points: number;
		timeLimit?: number;
	};
	progress?: {
		currentTaskIndex: number;
		totalTasks: number;
		completedTasks: number;
		totalPoints?: number;
		completedTaskIds?: string[];
	};
	taskStartedAt?: string;
}

export const StudentPage = () => {
	const [sessionInfo, setSessionInfo] = useState<Session | null>(null);
	const [code, setCode] = useState<string>("");
	const codeRef = useRef<string>(""); // Track latest code value to avoid stale state
	const [isLoadingTask, setIsLoadingTask] = useState(false);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [showResultDialog, setShowResultDialog] = useState(false);
	const [showQuitDialog, setShowQuitDialog] = useState(false);
	const [showLeaderboard, setShowLeaderboard] = useState(false);
	const [leaderboardData, setLeaderboardData] = useState<any>(null);
	const [inLobby, setInLobby] = useState(false);
	const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
	const [pointsEarned, setPointsEarned] = useState(0);
	const [totalPoints, setTotalPoints] = useState(0);
	const [remainingTime, setRemainingTime] = useState<number | null>(null);
	const [timeExpired, setTimeExpired] = useState(false);
	const [currentTaskCompleted, setCurrentTaskCompleted] = useState(false);
	const [completedTaskId, setCompletedTaskId] = useState<string | null>(null);
	const { socket } = useSocket();
	const [helpRequested, setHelpRequested] = useState(false);
	const [teacherViewing, setTeacherViewing] = useState(false);
	const navigate = useNavigate();
	const toast = useRef<Toast>(null);
	const hasAutoSubmittedRef = useRef(false);
	const hasJoinedSession = useRef(false);
	const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));
	
	// Keep codeRef in sync with code state
	useEffect(() => {
		codeRef.current = code;
	}, [code]);
	
	const showToast = (
		severity: "success" | "info" | "warn" | "error" | undefined,
		summary: string,
		detail: string
	) => {
		toast.current?.show({ severity, summary, detail });
	};

	const createContainer = async () => {
		try {
			const response = await axios.post(
				"http://localhost:8000/api/containers"
			);
			const containerId = response.data.containerId;
			sessionStorage.setItem("containerId", containerId);

			// Notify server about container creation
			const studentId = sessionStorage
				.getItem("username")
				?.replace(/^"(.*)"$/, "$1");
			socket?.emit("containerCreated", { studentId, containerId });
			return true;
		} catch (error) {
			console.error("Error creating container:", error);
			showToast(
				"error",
				"Container Error",
				"Failed to create coding environment. Make sure Docker is running."
			);
			return false;
		}
	};

	const deleteContainer = async () => {
		const containerId = sessionStorage
			.getItem("containerId")
			?.replace(/^"(.*)"$/, "$1");
		if (containerId !== null) {
			try {
				axios
					.delete(
						`http://localhost:8000/api/containers/${containerId}`
					)
					.then(() => {
						sessionStorage.removeItem("containerId");
					})
					.catch((error) => {
						console.error("Error deleting container:", error);
					});
			} catch (error) {
				console.error("Error deleting container:", error);
			}
		} else {
			console.error("Error deleting container: No container ID");
		}
	};

	const clearCurrentSession = async () => {
		if (!sessionStorage.getItem("student-sessionInfo")) {
			showToast(
				"info",
				"No current session",
				"Join a session to get started"
			);
		} else {
			const sessionInfo = JSON.parse(
				sessionStorage.getItem("student-sessionInfo") || "{}"
			);
			const studentId = sessionStorage.getItem("username")?.replace(/^"(.*)"$/, "$1");
			
			sessionStorage.removeItem("student-sessionInfo");
			sessionStorage.removeItem("sessionId");
			hasJoinedSession.current = false;
			
			socket?.emit("studentLogout", {
				studentId,
				sessionId: sessionInfo.code,
			});
			
			// Emit for leaving session
			socket?.emit("leaveSession", {
				sessionCode: sessionInfo.code,
				userId: studentId,
			});
			
			showToast(
				"success",
				"Session cleared",
				"You can now join a new session"
			);
			await deleteContainer();
			navigate("/", { replace: true });
		}
	};

	const handleQuitSession = async () => {
		hasJoinedSession.current = false;
		setShowQuitDialog(false);
		await clearCurrentSession();
	};

	const verifyOrCreateContainer = async () => {
		const existingContainerId = sessionStorage.getItem("containerId");

		if (existingContainerId) {
			// Verify if container still exists
			// Fix for an edge case bug that the container fails to start/crashes
			try {
				await axios.get(
					`http://localhost:8000/api/containers/${existingContainerId}`
				);
				return existingContainerId;
			} catch (error) {
				sessionStorage.removeItem("containerId");
			}
		}

		// Create new container
		return await createContainer();
	};

	const fetchCurrentTask = async (sessionCode: string, studentId: string) => {
		setIsLoadingTask(true);
		try {
			const response = await axios.get(
				`http://localhost:8000/api/session/${sessionCode}/student/${studentId}/current-task`
			);
			const taskData = response.data;

			// Check if session is in lobby state
			if (taskData.sessionState === "lobby") {
				setInLobby(true);
				setSessionInfo((prev) => ({
					...prev!,
					teacherName: taskData.teacherName,
					code: taskData.sessionCode,
					mode: taskData.mode,
					sessionState: "lobby",
					students: taskData.students || [],
				}));
				setIsLoadingTask(false);
				return;
			}

			setInLobby(false);

			// Update session info with task details
			setSessionInfo((prev) => ({
				...prev!,
				teacherName: taskData.teacherName,
				code: taskData.sessionCode,
				task: taskData.mode === "empty" ? taskData.task : taskData.task?.title || prev!.task,
				mode: taskData.mode,
				sessionState: taskData.sessionState,
				currentTask: taskData.mode === "empty" ? undefined : taskData.task,
				progress: taskData.progress,
				taskStartedAt: taskData.taskStartedAt,
			}));

			// Load starting code
			if (taskData.task?.starterCode) {
				setCode(taskData.task.starterCode);
				codeRef.current = taskData.task.starterCode;
			}

			// Reset task completion status
			setCurrentTaskCompleted(false);
			setCompletedTaskId(null);
			setTimeExpired(false);
			hasAutoSubmittedRef.current = false;

			// Create container after session is in progress
			await verifyOrCreateContainer();
		} catch (error) {
			console.error("Error fetching current task:", error);
			showToast("error", "Error", "Failed to load task information");
		} finally {
			setIsLoadingTask(false);
		}
	};

	const navigateToTask = async (taskIndex: number) => {
		if (!sessionInfo || sessionInfo.mode !== "teaching") {
			showToast("warn", "Cannot Navigate", "Task navigation is only available in teaching mode");
			return;
		}

		if (taskIndex < 0 || taskIndex >= (sessionInfo.progress?.totalTasks || 0)) {
			showToast("warn", "Invalid Task", "Task index out of range");
			return;
		}

		const studentId = sessionStorage.getItem("username")?.replace(/^"(.*)"$/, "$1");
		if (!studentId || !sessionInfo.code) return;

		setIsLoadingTask(true);
		try {
			const response = await axios.get(
				`http://localhost:8000/api/session/${sessionInfo.code}/student/${studentId}/task/${taskIndex}`
			);

			const taskData = response.data;

			setSessionInfo(prev => ({
				...prev!,
				task: taskData.task.title,
				currentTask: taskData.task,
				progress: {
					...prev!.progress!,
					currentTaskIndex: taskIndex,
				}
			}));

			const newCode = taskData.task.starterCode || "# Write your code here\n";
			setCode(newCode);
			codeRef.current = newCode;

			// Notify teacher of the new code so their view updates immediately
			socket?.emit("codeChange", {
				studentId,
				code: newCode,
				isTeacher: false,
			});

			setShowResultDialog(false);
			setVerificationResult(null);
		setCurrentTaskCompleted(false);
		setCompletedTaskId(null);
		showToast("info", "Task Loaded", `Switched to: ${taskData.task.title}`);
		} catch (error: any) {
			console.error("Error loading task:", error);
			showToast("error", "Error", error.response?.data?.error || "Failed to load task");
		} finally {
			setIsLoadingTask(false);
		}
	};

	const submitTask = async (forceSubmit: boolean = false) => {
		// Get ref code state to prevent stale code states
		const currentCode = codeRef.current || code;
		
		if (!sessionInfo || (!currentCode.trim() && !forceSubmit)) {
			showToast("warn", "No Code", "Please write some code before submitting");
			return;
		}

		const containerId = sessionStorage.getItem("containerId");
		const studentId = sessionStorage.getItem("username")?.replace(/^"(.*)"$/, "$1");

		if (!containerId) {
			showToast("error", "Error", "No coding environment found");
			return;
		}

		setIsSubmitting(true);

		try {
			const response = await axios.post(
				`http://localhost:8000/api/session/${sessionInfo.code}/student/${studentId}/submit`,
				{
					code: currentCode,
					containerId,
				}
			);

			const result = response.data;

			if (result.mode === "empty") {
				showToast("success", "Submitted", "Code submitted successfully");
				return;
			}

			if (result.progress) {
				setSessionInfo((prev) =>
					prev
						? {
								...prev,
								progress: result.progress,
						  }
						: null
				);
			}

			setVerificationResult(result.verificationResult);

			if (result.passed) {
				setPointsEarned(result.pointsEarned);
				setTotalPoints(result.totalPoints);
				setShowResultDialog(true);

				// In teaching mode students start on the same task and can navigate to other tasks
				// In game mode wait for all students to finish task / time to run out
				if (sessionInfo.mode === "teaching") {
					// Succeed - Prompt with success message and allow them to proceed
					showToast("success", "Great Job!", "All tests passed! Navigate to another task when ready.");
				} else if (result.nextTask && sessionInfo.mode === "game") {
					// Game mode - Succeeded mark as student completed
					setCompletedTaskId(sessionInfo.currentTask?.id || null);
					setCurrentTaskCompleted(true);
					showToast("info", "Task Completed!", "Waiting for other students to complete...");
					// taskAdvance emitted if all students completed the task
				} else if (result.allTasksCompleted) {
					showToast("success", "Congratulations!", `All tasks completed! Total points: ${result.totalPoints}`);
				}
			} else {
				if (sessionInfo.mode === "game" && result.timedOut && result.finalizedInGame) {
					setCompletedTaskId(sessionInfo.currentTask?.id || null);
					setCurrentTaskCompleted(true);
					setTotalPoints(result.totalPoints || totalPoints);
					setShowResultDialog(false);
					showToast("warn", "Time Expired", "No points awarded. Waiting for other students...");
					return;
				}

				// If failed prompt with dialog box containing test cases failed
				setShowResultDialog(true);
				showToast("error", "Tests Failed", "Review the test results and try again!");
			}
		} catch (error: any) {
			console.error("Error submitting task:", error);
			showToast("error", "Submission Error", error.response?.data?.error || "Failed to submit task");
		} finally {
			setIsSubmitting(false);
		}
	};

	// runs once to load session and fetch tasks
	useEffect(() => {
		if (sessionStorage.getItem("permission") !== "student") {
			navigate("/");
			return;
		}

		// Check if already in a session
		const storedSessionInfo = sessionStorage.getItem("student-sessionInfo");
		if (storedSessionInfo && socket) {
			const parsedSession = JSON.parse(storedSessionInfo);
			setSessionInfo(parsedSession);

			const studentId = sessionStorage
				.getItem("username")
				?.replace(/^"(.*)"$/, "$1");

			if (studentId && !hasJoinedSession.current) {
				hasJoinedSession.current = true;
				
				// Get current task FIRST to check session state
				fetchCurrentTask(parsedSession.code, studentId).then(() => {
					// After getting task check if we need a container
				});

				// Notify server we have joined the session
				socket.emit("sendMessage", {
					studentId: studentId,
					sessionId: parsedSession.code,
				});
				
				// Join the session room for targeted socket events
				socket.emit("joinSession", {
					sessionCode: parsedSession.code,
					userId: studentId,
				});
			}
		} else if (storedSessionInfo && !socket) {
			console.warn("Session info exists but socket not connected yet");
		} else {
			navigate("/", { replace: true });
		}
	}, [socket, navigate]); // Only run on mount or when socket or navigation changes

	// Listener for session state changes
	useEffect(() => {
		if (!socket) return;

		// Listen for session end
		const handleSessionEnded = async (data: {
			teacherId: string;
			sessionId: string;
			message: string;
			leaderboard?: any[];
			sessionInfo?: any;
		}) => {
			// Leave the session room
			if (sessionInfo?.code) {
				const studentId = sessionStorage.getItem("username")?.replace(/^"(.*)"$/, "$1");
				hasJoinedSession.current = false;
				socket?.emit("leaveSession", {
					sessionCode: sessionInfo.code,
					userId: studentId,
				});
			}
			
			// Check if leaderbaord info exists and show
			if (data.leaderboard && data.leaderboard.length > 0) {
				setLeaderboardData({
					leaderboard: data.leaderboard,
					sessionInfo: data.sessionInfo,
				});
				setShowLeaderboard(true);
				showToast("info", "Session Ended", "Check out the final leaderboard!");
			} else {
				// No info present just end session
				showToast("info", "Session Ended", data.message);

				// Clean up local storage
				sessionStorage.removeItem("student-sessionInfo");
				sessionStorage.removeItem("sessionId");

				// Wait before redirecting
				await delay(3000);

				// Clean up containers and redirect user
				await deleteContainer();
				navigate("/", { replace: true });
			}
		};

		// Listen for session moving from lobby to start
		const handleSessionStarted = (data: { sessionId: string }) => {
			if (sessionInfo?.code && data.sessionId === sessionInfo.code) {
				setInLobby(false);
				const studentId = sessionStorage.getItem("username")?.replace(/^"(.*)"$/, "$1");
				if (studentId && sessionInfo.code) {
					fetchCurrentTask(sessionInfo.code, studentId);
				}
			}
		};

		// Listen for students joining the session
		const handleLobbyUpdate = (data: { sessionId: string; students: string[] }) => {
			if (sessionInfo?.code && data.sessionId === sessionInfo.code && inLobby) {
				setSessionInfo(prev => ({
					...prev!,
					students: data.students,
				}));
			}
		};

		// GAME MODE ONLY
		// Listen for task advancement
		const handleTaskAdvanced = (data: {
			sessionId: string;
			nextTask: any;
			taskStartedAt: string;
			progress: any;
		}) => {
			
			if (sessionInfo?.code && data.sessionId === sessionInfo.code && sessionInfo.mode === "game") {
				showToast("info", "Next Task", `Everyone completed! Moving to: ${data.nextTask.title}`);
				
				// Reset states for new task
				setCurrentTaskCompleted(false);
				setCompletedTaskId(null);
				setTimeExpired(false);
				hasAutoSubmittedRef.current = false;
				setShowResultDialog(false);
				setVerificationResult(null);
				
				// Update session info with new task
				setSessionInfo(prev => ({
					...prev!,
					task: data.nextTask.title,
					currentTask: data.nextTask,
					progress: data.progress,
					taskStartedAt: data.taskStartedAt,
				}));
				
				// Set new starter code
				setCode(data.nextTask.starterCode || "# Write your code here\n");
				codeRef.current = data.nextTask.starterCode || "# Write your code here\n";
			} else {
			}
		};

		const myId = sessionStorage.getItem("username")?.replace(/^"(.*)"$/, "$1");

		const handleTeacherViewing = (data: { studentId: string }) => {
			if (data.studentId === myId) {
				setTeacherViewing(true);
				setHelpRequested(false);
			}
		};

		const handleTeacherLeft = (data: { studentId: string }) => {
			if (data.studentId === myId) {
				setTeacherViewing(false);
			}
		};

		socket.on("sessionEnded", handleSessionEnded);
		socket.on("sessionStarted", handleSessionStarted);
		socket.on("lobbyUpdate", handleLobbyUpdate);
		socket.on("taskAdvanced", handleTaskAdvanced);
		socket.on("teacherViewingStudent", handleTeacherViewing);
		socket.on("teacherLeftStudent", handleTeacherLeft);

		return () => {
			socket.off("sessionEnded", handleSessionEnded);
			socket.off("sessionStarted", handleSessionStarted);
			socket.off("lobbyUpdate", handleLobbyUpdate);
			socket.off("taskAdvanced", handleTaskAdvanced);
			socket.off("teacherViewingStudent", handleTeacherViewing);
			socket.off("teacherLeftStudent", handleTeacherLeft);
		};
	}, [socket, sessionInfo, inLobby, navigate]);

	// Calculate and update remaining time
	useEffect(() => {
		// Ensure timer only runs in gamemode
		if (!sessionInfo || inLobby || sessionInfo.mode === "empty" || sessionInfo.mode === "teaching" || !sessionInfo.currentTask?.timeLimit || !sessionInfo.taskStartedAt) {
			setRemainingTime(null);
			setTimeExpired(false);
			hasAutoSubmittedRef.current = false;
			return;
		}

		const calculateRemainingTime = () => {
			const startTime = new Date(sessionInfo.taskStartedAt!).getTime();
			const timeLimit = sessionInfo.currentTask!.timeLimit! * 1000; // Convert to milliseconds
			const now = Date.now();
			const elapsed = now - startTime;
			const remaining = Math.max(0, timeLimit - elapsed);
			
			return Math.ceil(remaining / 1000); // Return time in seconds
		};

		// Calculate initial remaining time
		const initialRemaining = calculateRemainingTime();
		setRemainingTime(initialRemaining);
		setTimeExpired(initialRemaining === 0);
		hasAutoSubmittedRef.current = initialRemaining === 0;

		// Update every second
		const interval = setInterval(() => {
			const remaining = calculateRemainingTime();
			setRemainingTime(remaining);

			// Time expired - auto submit (only if task not already completed)
			if (remaining === 0 && !timeExpired && !hasAutoSubmittedRef.current && !currentTaskCompleted) {
				setTimeExpired(true);
				hasAutoSubmittedRef.current = true;
				showToast("warn", "Time's Up!", "Your code is being submitted automatically...");
				
				// Wait a moment for the toast to show, then submit
				setTimeout(() => {
					if (!isSubmitting) {
						submitTask(true);
					}
				}, 500);
			}
		}, 1000);

		return () => clearInterval(interval);
	}, [sessionInfo, inLobby, timeExpired, isSubmitting, currentTaskCompleted]);

	// Helper functions for formatting

	// Helper to format time as MM:SS
	const formatTime = (seconds: number): string => {
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${mins}:${secs.toString().padStart(2, '0')}`;
	};

	// Helper to get timer color class
	const getTimerClass = (): string => {
		if (remainingTime === null) return '';
		if (remainingTime === 0) return 'timer-expired';
		if (remainingTime <= 30) return 'timer-warning';
		if (remainingTime <= 60) return 'timer-caution';
		return 'timer-normal';
	};

	// Helper to format time in seconds to readable format
	const formatLeaderboardTime = (seconds: number): string => {
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		if (mins === 0) return `${secs}s`;
		return `${mins}m ${secs}s`;
	};

	// Helper function to get medal for rank
	const getRankMedal = (rank: number): string => {
		if (rank === 1) return '🥇';
		if (rank === 2) return '🥈';
		if (rank === 3) return '🥉';
		return `#${rank}`;
	};

	// Handle closing leaderboard and redirecting
	const handleLeaderboardClose = async () => {
		setShowLeaderboard(false);
		hasJoinedSession.current = false;
		
		// Clean up local storage
		sessionStorage.removeItem("student-sessionInfo");
		sessionStorage.removeItem("sessionId");

		// Clean up and redirect
		await deleteContainer();
		navigate("/", { replace: true });
	};

const lobbyStudents = (() => {
	if (!sessionInfo || !inLobby) return [];
	const currentStudent = sessionStorage.getItem("username")?.replace(/^"(.*)"$/, "$1");
	const students = sessionInfo.students || [];
	if (currentStudent && !students.includes(currentStudent)) {
		return [...students, currentStudent];
	}
	return students;
})();

return (
	<div className="main-container-student">
			<Toast ref={toast} />
			<div className="student-component-container">
				<div className="student-header">
					<h2 className="header-title">
						{sessionStorage
							.getItem("username")
							?.replace(/^"(.*)"$/, "$1")
							.toUpperCase()}'s Workspace
					</h2>
				<div className="header-actions">
					{remainingTime !== null && !inLobby && sessionInfo?.mode === "game" && (
						<div className={`timer-badge ${getTimerClass()}`}>
							<i className="pi pi-clock"></i> {formatTime(remainingTime)}
						</div>
					)}
					{sessionInfo && sessionInfo.mode !== "empty" && !inLobby && (
						<div className="points-badge">
							<i className="pi pi-star-fill"></i> {totalPoints} Points
						</div>
					)}
					{sessionInfo && (
						<Button
							label="Quit Session"
							icon="pi pi-sign-out"
							onClick={() => setShowQuitDialog(true)}
							className="p-button-danger p-button-outlined"
						/>
					)}
				</div>
			</div>

			{sessionInfo?.mode === "teaching" && teacherViewing && (
				<div className="teacher-viewing-indicator">
					<i className="pi pi-eye"></i>
					<span>Teacher is viewing your code</span>
				</div>
			)}
			
			{/* Lobby View for Game Mode */}
			{inLobby && sessionInfo && (
				<div className="lobby-container">
					<div className="lobby-card">
						<div className="lobby-header">
							<div className="lobby-icon">
								<i className="pi pi-users"></i>
							</div>
							<h2>Waiting for Session to Start</h2>
							<p className="lobby-subtitle">Teacher: {sessionInfo.teacherName}</p>
							<p className="lobby-code">Session Code: <strong>{sessionInfo.code}</strong></p>
						</div>
						
						<div className="lobby-waiting">
							<i className="pi pi-spin pi-spinner"></i>
							<p>Waiting for teacher to start the session...</p>
						</div>

						<div className="lobby-students">
							<h3>
								<i className="pi pi-users"></i> 
								Players in Lobby ({lobbyStudents.length})
							</h3>
							<div className="student-list">
								{lobbyStudents.length > 0 ? (
									lobbyStudents.map((student, index) => (
										<div key={index} className="student-item">
											<i className="pi pi-user"></i>
											<span>{student}</span>
										</div>
									))
								) : (
									<p className="no-students">No other students yet...</p>
								)}
							</div>
						</div>
					</div>
				</div>
			)}
			
			{sessionInfo && !inLobby && (
				<div className="workspace-container">
					<div className="task-panel">
						<div className="session-info-card">
							<div className="info-row">
								<i className="pi pi-user"></i>
								<span>Teacher: {sessionInfo.teacherName}</span>
							</div>
							<div className="info-row">
								<i className="pi pi-key"></i>
								<span>Session: {sessionInfo.code}</span>
							</div>
						</div>
						
						{isLoadingTask ? (
								<div className="loading-task">
									<i className="pi pi-spin pi-spinner"></i>
									<p>Loading task...</p>
								</div>
							) : (
								<div className="task-content">
									{sessionInfo.mode !== "empty" && sessionInfo.progress && (
										<div className="progress-indicator">
											<div className="progress-bar">
												<div 
													className="progress-fill" 
													style={{ 
														width: `${(sessionInfo.progress.completedTasks / sessionInfo.progress.totalTasks) * 100}%` 
													}}
												></div>
											</div>
											<p className="progress-text">
												Task {sessionInfo.progress.currentTaskIndex + 1} of {sessionInfo.progress.totalTasks}
												{" • "}{sessionInfo.progress.completedTasks} completed
											</p>
										</div>
									)}
									
									{/* Task navigation - Teaching mode */}
									{sessionInfo.mode === "teaching" && sessionInfo.progress && (
										<div className="task-navigation">
											<Button
												label="Previous Task"
												icon="pi pi-chevron-left"
												onClick={() => navigateToTask((sessionInfo.progress?.currentTaskIndex || 0) - 1)}
												disabled={isLoadingTask || (sessionInfo.progress?.currentTaskIndex || 0) === 0}
												className="p-button-outlined p-button-sm"
											/>
											<span className="nav-info">
												Navigate freely between tasks
											</span>
											<Button
												label="Next Task"
												icon="pi pi-chevron-right"
												iconPos="right"
												onClick={() => navigateToTask((sessionInfo.progress?.currentTaskIndex || 0) + 1)}
												disabled={isLoadingTask || (sessionInfo.progress?.currentTaskIndex || 0) >= (sessionInfo.progress?.totalTasks || 0) - 1}
												className="p-button-outlined p-button-sm"
											/>
										</div>
									)}
									
									{sessionInfo.currentTask ? (
										<div className="task-details">
											<div className="task-header">
												<h3>
													{sessionInfo.mode === "teaching" && 
													 sessionInfo.progress?.completedTaskIds?.includes(sessionInfo.currentTask.id) && (
														<i className="pi pi-check-circle" style={{ color: "#22c55e", marginRight: "8px" }}></i>
													)}
													{sessionInfo.currentTask.title}
												</h3>
												<div className="task-meta">
													<span className={`badge badge-${sessionInfo.currentTask.difficulty}`}>
														{sessionInfo.currentTask.difficulty}
													</span>
													<span className="badge badge-points">
														<i className="pi pi-star"></i> {sessionInfo.currentTask.points} pts
													</span>
												</div>
											</div>
											<p className="task-desc">{sessionInfo.currentTask.description}</p>
										</div>
									) : (
										<div className="task-details">
											<h3>Task</h3>
											<p className="task-desc">{sessionInfo.task}</p>
										</div>
									)}
								</div>
							)}
						</div>
						
						<div className="code-panel">
						{/* Show waiting screen if task completed in game mode */}
						{(() => {
							const isStillOnCompletedTask = completedTaskId === sessionInfo.currentTask?.id;
						const shouldShowWaiting = sessionInfo.mode === "game" && currentTaskCompleted && isStillOnCompletedTask;
							return shouldShowWaiting;
						})() ? (
							<div className="waiting-container">
								<div className="waiting-content">
									<div className="waiting-icon">
										<i className="pi pi-check-circle"></i>
									</div>
									<h2 className="waiting-title">Task Completed!</h2>
									<p className="waiting-subtitle">
										Great job! You earned <span className="points-highlight">{pointsEarned}</span> points
									</p>
									<div className="waiting-progress">
										<i className="pi pi-spin pi-spinner"></i>
										<p>Waiting for other students to complete this task...</p>
									</div>
									<div className="waiting-stats">
										<div className="stat-item">
											<i className="pi pi-star"></i>
											<span>Total Points: {totalPoints}</span>
										</div>
										<div className="stat-item">
											<i className="pi pi-list"></i>
											<span>Tasks Completed: {sessionInfo.progress?.completedTasks || 0} / {sessionInfo.progress?.totalTasks || 0}</span>
										</div>
									</div>
								</div>
							</div>
						) : (
							<>
								<div className="code-editor-wrapper">
									<CodeEditor
										code={code}
										language="python"
										studentId={sessionStorage
											.getItem("username")
										?.replace(/^"(.*)"$/, "$1")}
										onChange={(newCode) => {
											if (!timeExpired) {
												setCode(newCode);
											}
										}}
										readOnly={timeExpired}
									/>
								</div>
								<div className="code-actions">
									{timeExpired && (
										<p className="time-expired-message">
											<i className="pi pi-exclamation-triangle"></i>
											Time expired - Code has been auto-submitted
										</p>
									)}
									{sessionInfo.mode === "teaching" && (
										<Button
											label={helpRequested ? "Help Requested" : "Call for Help"}
											icon={helpRequested ? "pi pi-check" : "pi pi-question-circle"}
											onClick={() => {
												const studentId = sessionStorage
													.getItem("username")
													?.replace(/^"(.*)"$/, "$1");
												if (!studentId) return;
												socket?.emit("studentHelp", { studentId });
												setHelpRequested(true);
												showToast("info", "Help Requested", "Your teacher has been notified");
											}}
											disabled={helpRequested || isLoadingTask}
											className={`p-button-sm help-button ${helpRequested ? "p-button-secondary" : "p-button-warning"}`}
										/>
									)}
									<Button
										label={
											isSubmitting 
												? "Submitting..." 
												: timeExpired 
												? "Time Expired" 
												: "Submit Solution"
										}
										icon={
											isSubmitting 
												? "pi pi-spin pi-spinner" 
												: timeExpired 
												? "pi pi-clock" 
									: "pi pi-check"
						}
						onClick={() => submitTask()}
						disabled={isSubmitting || isLoadingTask || timeExpired}
						className={`p-button-lg submit-button ${timeExpired ? 'p-button-secondary' : 'p-button-success'}`}
					/>
				</div>
			</>
		)}
	</div>
</div>
)}
</div>

{/* Result Dialog */}
<Dialog
header={verificationResult?.passed ? "Success!" : "Not Quite"}
visible={showResultDialog}
style={{ width: "600px" }}
onHide={() => setShowResultDialog(false)}
modal
>
{verificationResult && (
	<div className="result-content">
		{verificationResult.passed ? (
			<div className="success-result">
				<div className="result-icon success-icon">
					<i className="pi pi-check-circle"></i>
				</div>
				<h3>All tests passed!</h3>
				{sessionInfo?.mode === "game" ? (
					<>
						<div className="points-earned">
							<i className="pi pi-star-fill"></i>
							<span className="points-amount">+{pointsEarned}</span>
							<span className="points-label">points</span>
						</div>
						<p className="total-points">Total: {totalPoints} points</p>
						<p className="next-task-msg">Loading next task...</p>
					</>
				) : (
					<p className="success-message">Congratulations on passing this task! You can continue to the next task when ready.</p>
				)}
			</div>
		) : (
							<div className="failed-result">
								<div className="result-icon failed-icon">
									<i className="pi pi-times-circle"></i>
								</div>
								<h3>Some tests failed</h3>
								<div className="test-results">
									<p className="test-summary">
										{verificationResult.passedTests} / {verificationResult.totalTests} tests passed
									</p>
									{verificationResult.failedTests.length > 0 && (
										<div className="failed-tests">
											<h4>Failed Tests:</h4>
											{verificationResult.failedTests.map((test, idx) => (
												<div key={idx} className="test-case">
													<p className="test-desc">{test.description}</p>
													<p className="test-details">{test.input}</p>
												</div>
											))}
										</div>
									)}
								</div>
								<Button
									label="Try Again"
									icon="pi pi-refresh"
									onClick={() => setShowResultDialog(false)}
									className="p-button-primary"
								/>
							</div>
						)}
					</div>
				)}
			</Dialog>

			{/* Quit Session Confirmation Dialog */}
			<Dialog
				header="Quit Session?"
				visible={showQuitDialog}
				style={{ width: "450px" }}
				onHide={() => setShowQuitDialog(false)}
				modal
				footer={
					<div className="quit-dialog-footer">
						<Button
							label="Cancel"
							icon="pi pi-times"
							onClick={() => setShowQuitDialog(false)}
							className="p-button-text"
						/>
						<Button
							label="Quit Session"
							icon="pi pi-sign-out"
							onClick={handleQuitSession}
							className="p-button-danger"
							autoFocus
						/>
					</div>
				}
			>
				<div className="quit-dialog-content">
					<i className="pi pi-exclamation-triangle" style={{ fontSize: '3rem', color: '#f59e0b' }}></i>
					<p>
						Are you sure you want to quit this session? Your progress will be saved, but you'll
						need to rejoin to continue working.
					</p>
				</div>
			</Dialog>

			{/* Leaderboard Dialog */}
			<Dialog
				header="🏆 Session Results"
				visible={showLeaderboard}
				style={{ width: "800px", maxHeight: "90vh" }}
				onHide={handleLeaderboardClose}
				modal
				closable={true}
			>
				{leaderboardData && (
					<div className="leaderboard-container">
						<div className="leaderboard-header">
							<div className="session-summary">
								<h3>{leaderboardData.sessionInfo?.teacherName}'s Session</h3>
								<p>Session Code: <strong>{leaderboardData.sessionInfo?.code}</strong></p>
								<div className="summary-stats">
									<span>
										<i className="pi pi-users"></i> {leaderboardData.sessionInfo?.totalStudents} Students
									</span>
									<span>
										<i className="pi pi-list"></i> {leaderboardData.sessionInfo?.totalTasks} Tasks
									</span>
								</div>
							</div>
						</div>

						<div className="leaderboard-list">
							{leaderboardData.leaderboard.map((entry: any, index: number) => {
							const currentStudent = sessionStorage.getItem("username")?.replace(/^"(.*)"$/, "$1");
							const isCurrentStudent = entry.studentId === currentStudent;
								return (
									<div 
										key={entry.studentId} 
										className={`leaderboard-item ${isCurrentStudent ? 'current-student' : ''} rank-${entry.rank}`}
									>
										<div className="rank-badge">
											{getRankMedal(entry.rank)}
										</div>
										<div className="student-info">
											<div className="student-name">
												{entry.studentId}
												{isCurrentStudent && <span className="you-badge">You</span>}
											</div>
											<div className="student-stats">
												<span className="stat">
													<i className="pi pi-star-fill"></i> {entry.totalPoints} pts
												</span>
												<span className="stat">
													<i className="pi pi-check-circle"></i> {entry.completedTasks}/{entry.totalTasks} tasks
												</span>
												<span className="stat">
													<i className="pi pi-clock"></i> {formatLeaderboardTime(entry.totalTime)}
												</span>
											</div>
										</div>
										<div className="completion-bar">
											<div 
												className="completion-progress" 
												style={{ width: `${entry.completionPercentage}%` }}
											></div>
											<span className="completion-text">{entry.completionPercentage}%</span>
										</div>
									</div>
								);
							})}
						</div>

						<div className="leaderboard-footer">
							<Button
								label="Return to Home"
								icon="pi pi-home"
								onClick={handleLeaderboardClose}
								className="p-button-primary p-button-lg"
							/>
						</div>
					</div>
				)}
			</Dialog>
		</div>
	);
};
