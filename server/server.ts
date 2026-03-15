import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import dockerRoutes from "./routes/dockerRoutes/dockerRoutes";
import authenticationRoutes from "./routes/mongo/authentcationRoutes";
import sessionRoutes from "./routes/mongo/sessionRoutes";
import taskRoutes from "./routes/mongo/taskRoutes";
import templateRoutes from "./routes/mongo/templateRoutes";
import teacherRoutes from "./routes/mongo/teacherRoutes";
import * as http from "http";
import { Server } from "socket.io";
import Docker from "dockerode";
import connectDB from "./config/database";
import axios from "axios";
import { Session } from "./models";
import { Logger } from "./utils/logger";
import { startPeriodicCleanup } from "./utils/sessionCleanup";
import { setSocketIO } from "./utils/socketService";

// Load environment variables
dotenv.config();

// Connect to MongoDB
connectDB();

// Start periodic session cleanup
startPeriodicCleanup();

const docker = new Docker();

// Map to store student container IDs
const studentContainers = new Map<string, string>();

const app = express();
const port = process.env.PORT || 8000;
const server = http.createServer(app);
const io = new Server(server, {
	cors: {
		origin: "http://localhost:3000",
	},
});

// Set socket IO instance for use in routes
setSocketIO(io);
app.set("io", io); // Make io available to Express routes

// Track connected students
const connectedStudents = new Set<string>();

app.use(cors());
app.use(bodyParser.json());

io.on("connection", (socket) => {
	Logger.info("User connected", { socketId: socket.id });

	// Send current student list to newly connected teachers immediately
	socket.emit("studentListUpdate", {
		students: Array.from(connectedStudents),
	});

	// Handle joining a session room (for targeted socket communication)
	socket.on("joinSession", (data: { sessionCode: string; userId: string }) => {
		socket.join(data.sessionCode);
		Logger.info("User joined session room", {
			socketId: socket.id,
			sessionCode: data.sessionCode,
			userId: data.userId,
		});
	});

	// Handle leaving a session room
	socket.on("leaveSession", (data: { sessionCode: string; userId: string }) => {
		socket.leave(data.sessionCode);
		Logger.info("User left session room", {
			socketId: socket.id,
			sessionCode: data.sessionCode,
			userId: data.userId,
		});
	});

	socket.on(
		"sendMessage",
		async (data: { studentId: string; sessionId?: string }) => {
			if (data.studentId) {
				connectedStudents.add(data.studentId);

				// Persist to MongoDB if sessionId is provided
				if (data.sessionId) {
					try {
						await axios.post(
							`http://localhost:${port}/api/session/${data.sessionId}/join`,
							{
								studentId: data.studentId,
							}
						);
					} catch (error) {
						console.error("Error persisting student join:", error);
					}
				}
			}
			io.emit("receiveMessage", data);
			io.emit("studentListUpdate", {
				students: Array.from(connectedStudents),
			});
		}
	);

	socket.on("studentHelp", (data: { studentId: string }) => {
		io.emit("teacherHelp", data);
	});

	socket.on("teacherViewingStudent", (data: { studentId: string }) => {
		io.emit("teacherViewingStudent", data);
	});

	socket.on("teacherLeftStudent", (data: { studentId: string }) => {
		io.emit("teacherLeftStudent", data);
	});

	// Handle student list refresh requests
	socket.on("requestStudentList", async (data?: { sessionId?: string }) => {
		let studentsList = Array.from(connectedStudents);

		// If sessionId provided, load from MongoDB as the source of truth
		if (data?.sessionId) {
			try {
				const response = await axios.get(
					`http://localhost:${port}/api/session/${data.sessionId}`
				);
				if (response.data.session?.students) {
					// Use MongoDB as source of truth - replace the in-memory set
					connectedStudents.clear();
					response.data.session.students.forEach(
						(studentId: string) => {
							connectedStudents.add(studentId);
						}
					);
					studentsList = response.data.session.students; // Use MongoDB list directly
					Logger.debug("Synced student list from MongoDB", { 
						sessionId: data.sessionId, 
						count: studentsList.length 
					});
				}
			} catch (error) {
				Logger.error("Error loading students from MongoDB", error);
			}
		}

		io.emit("studentListUpdate", { students: studentsList });
	});

	socket.on("studentDoneMessage", (data: { studentId: string }) => {
		io.emit("studentDone", data);
	});

	socket.on(
		"containerCreated",
		(data: { studentId: string; containerId: string }) => {
			studentContainers.set(data.studentId, data.containerId);
		}
	);

	socket.on(
		"studentLogout",
		async (data: { studentId: string; sessionId?: string }) => {
			if (data.studentId) {
				connectedStudents.delete(data.studentId);

				// Persist to MongoDB if sessionId is provided
				if (data.sessionId) {
					try {
						await axios.post(
							`http://localhost:${port}/api/session/${data.sessionId}/leave`,
							{
								studentId: data.studentId,
							}
						);
					} catch (error) {
						console.error("Error persisting student leave:", error);
					}
				}

				// Cleanup students container
				const containerId = studentContainers.get(data.studentId);
				if (containerId) {
					try {
						const container = docker.getContainer(containerId);
						try {
							await container.stop();
						} catch (err) {
							// Container might already be stopped
						}
						await container.remove();
						Logger.info("Container cleaned up", {
							containerId,
							studentId: data.studentId,
						});
					} catch (err) {
						Logger.error("Error cleaning up container", {
							studentId: data.studentId,
							error: err,
						});
					}
					studentContainers.delete(data.studentId);
				}
			}
			io.emit("removeStudent", data);
			// Send updated student list
			io.emit("studentListUpdate", {
				students: Array.from(connectedStudents),
			});
		}
	);

	socket.on(
		"terminalOutput",
		(data: { studentId: string; output: string; isError?: boolean }) => {
			// Broadcast to both the teacher view and the terminal viewer
			io.emit("studentTerminalUpdate", data);
			io.emit("terminalOutput", data);
		}
	);

	socket.on("clearTerminal", (data: { studentId: string }) => {
		// Broadcast terminal clear to everyone viewing this student
		io.emit("clearTerminal", data);
	});

	socket.on(
		"codeChange",
		(data: { studentId: string; code: string; isTeacher: boolean }) => {
			// Broadcast to others only (don't echo back to sender)
			socket.broadcast.emit("codeUpdate", data);
		}
	);

	socket.on("requestInitialCode", (data: { studentId: string }) => {
		io.emit("requestCodeState", data);
	});

	socket.on(
		"sendCodeState",
		(data: { studentId: string; code: string; isTeacher: boolean }) => {
			// When sending initial state, broadcast to everyone
			io.emit("codeUpdate", data);
		}
	);

	socket.on("requestTerminalState", (data: { studentId: string }) => {
		// Relay request to the specific student
		io.emit("requestTerminalState", data);
	});

	socket.on(
		"sendTerminalState",
		(data: { studentId: string; terminalHistory: any[] }) => {
			// Broadcast terminal state to teachers viewing this student
			io.emit("terminalStateUpdate", data);
		}
	);

	socket.on(
		"runForStudent",
		(data: { studentId: string; input?: string; code?: string }) => {
			io.emit("runForStudent", data);
		}
	);

	socket.on(
		"endSession",
		async (data: { teacherId: string; sessionId: string }) => {
			try {
				await Session.findOneAndUpdate(
					{ code: data.sessionId },
					{
						sessionState: "ended",
						isActive: false,
						endedAt: new Date(),
					}
				);
			} catch (error) {
				Logger.error("Error updating session status during endSession", {
					sessionId: data.sessionId,
					error,
				});
			}

			// Fetch leaderboard data before ending session
			let leaderboardData = null;
			try {
				const response = await axios.get(
					`http://localhost:${port}/api/session/${data.sessionId}/leaderboard`
				);
				leaderboardData = response.data;
			} catch (error) {
				Logger.error("Error fetching leaderboard for session end", error);
			}

			// Clean up all containers for this session
			for (const [
				studentId,
				containerId,
			] of studentContainers.entries()) {
				try {
					const container = docker.getContainer(containerId);
					try {
						await container.stop();
					} catch (err) {
						// Container might already be stopped
					}
					await container.remove();
					studentContainers.delete(studentId);
				} catch (err) {
					console.error(
						`Error cleaning up container during session end:`,
						err
					);
				}
			}

			// Clear all connected students to prevent ghost students in new sessions
			connectedStudents.clear();
			Logger.info("Cleared connected students for session", { sessionId: data.sessionId });

			io.emit("sessionEnded", {
				teacherId: data.teacherId,
				sessionId: data.sessionId,
				message:
					"Session has ended. You will be redirected to the login page.",
				leaderboard: leaderboardData?.leaderboard || null,
				sessionInfo: leaderboardData?.sessionInfo || null,
				taskAnalytics: leaderboardData?.taskAnalytics || null,
			});

			io.emit("studentListUpdate", {
				students: [],
			});
		}
	);

	socket.on("disconnect", () => {
		Logger.debug("Client disconnected");
	});
});

app.use(cors());
app.use(bodyParser.json());

app.use(authenticationRoutes);
app.use(dockerRoutes);
app.use(sessionRoutes);
app.use(taskRoutes);
app.use(templateRoutes);
app.use(teacherRoutes);
server.listen(port, () => console.log("Server listening on port " + port));
