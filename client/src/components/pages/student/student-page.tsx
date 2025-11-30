import axios from "axios";
import React, { useEffect, useRef, useState } from "react";
import { CodeEditor } from "../../code-editor/code-editor";
import "./student-page.css";
import { InputText } from "primereact/inputtext";
import { Button } from "primereact/button";
import { Sidebar } from "primereact/sidebar";
import { useSocket } from "../../socketContext";
import { useNavigate } from "react-router-dom";
import { Toast } from "primereact/toast";
interface Session {
	code: string;
	teacherName: string;
	task: string;
}

export const StudentPage = () => {
	const [sessionInfo, setSessionInfo] = useState<Session | null>(null);
	const [code, setCode] = useState<string>("");
	const [visible, setVisible] = useState(false);
	const { socket } = useSocket();
	const navigate = useNavigate();
	const toast = useRef<Toast>(null);
	const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));
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
			localStorage.setItem("containerId", containerId);

			// Notify server about container creation
			const studentId = localStorage
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
		const containerId = localStorage
			.getItem("containerId")
			?.replace(/^"(.*)"$/, "$1");
		if (containerId !== null) {
			try {
				axios
					.delete(
						`http://localhost:8000/api/containers/${containerId}`
					)
					.then(() => {
						localStorage.removeItem("containerId");
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
		if (!localStorage.getItem("student-sessionInfo")) {
			showToast(
				"info",
				"No current session",
				"Join a session to get started"
			);
		} else {
			const sessionInfo = JSON.parse(
				localStorage.getItem("student-sessionInfo") || "{}"
			);
			localStorage.removeItem("student-sessionInfo");
			socket?.emit("studentLogout", {
				studentId: localStorage
					.getItem("username")
					?.replace(/^"(.*)"$/, "$1"),
				sessionId: sessionInfo.code,
			});
			showToast(
				"success",
				"Session cleared",
				"You can now join a new session"
			);
			await deleteContainer();
			await delay(1500);
			window.location.reload();
		}
	};

	const logout = async () => {
		const sessionInfo = JSON.parse(
			localStorage.getItem("student-sessionInfo") || "{}"
		);
		await deleteContainer();
		socket?.emit("studentLogout", {
			studentId: localStorage
				.getItem("username")
				?.replace(/^"(.*)"$/, "$1"),
			sessionId: sessionInfo.code,
		});
		localStorage.removeItem("username");
		localStorage.removeItem("permission");
		localStorage.removeItem("student-sessionInfo");
		localStorage.removeItem("token");
		window.location.reload();
	};

	const askForHelp = () => {
		socket?.emit("studentHelp", {
			studentId: localStorage
				.getItem("username")
				?.replace(/^"(.*)"$/, "$1"),
		});
		showToast(
			"info",
			"Help request has been sent",
			"A Help request has been sent to your teacher."
		);
	};

	const setDone = () => {
		socket?.emit("studentDoneMessage", {
			studentId: localStorage
				.getItem("username")
				?.replace(/^"(.*)"$/, "$1"),
		});
		showToast("success", "Task Completed", "You have completed the task.");
	};

	const verifyOrCreateContainer = async () => {
		const existingContainerId = localStorage.getItem("containerId");

		if (existingContainerId) {
			// Verify if container still exists
			try {
				await axios.get(
					`http://localhost:8000/api/containers/${existingContainerId}`
				);
				console.log("Container verified:", existingContainerId);
				return existingContainerId;
			} catch (error) {
				// Container doesnt exist anymore remove from storage
				console.log("Old container no longer exists, creating new one");
				localStorage.removeItem("containerId");
			}
		}

		// Create new container
		return await createContainer();
	};

	useEffect(() => {
		if (localStorage.getItem("permission") !== "student") {
			navigate("/");
			return;
		}

		// Check if already in a session
		const sessionInfo = localStorage.getItem("student-sessionInfo");
		if (sessionInfo && socket) {
			const parsedSession = JSON.parse(sessionInfo);
			setSessionInfo(parsedSession);

			const containerId = localStorage.getItem("containerId");
			const studentId = localStorage
				.getItem("username")
				?.replace(/^"(.*)"$/, "$1");

			console.log("Student page loaded:", {
				studentId,
				containerId,
				sessionCode: parsedSession.code,
			});

			// Verify container exists or create a new one
			verifyOrCreateContainer()
				.then((created) => {
					console.log("Container ready:", created);
					if (created && socket && studentId) {
						// Notify server we have joined the session
						socket.emit("sendMessage", {
							studentId: studentId,
							sessionId: parsedSession.code,
						});
						console.log(
							"Student joined session:",
							studentId,
							parsedSession.code
						);
					} else if (!created) {
						console.error("Failed to create or verify container");
					}
				})
				.catch((error) => {
					console.error("Container setup error:", error);
				});
		} else if (sessionInfo && !socket) {
			console.warn("Session info exists but socket not connected yet");
		}

		// Listen for session end
		socket?.on(
			"sessionEnded",
			async (data: {
				teacherId: string;
				sessionId: string;
				message: string;
			}) => {
				showToast("info", "Session Ended", data.message);

				// Clean up local storage
				localStorage.removeItem("student-sessionInfo");

				// Wait 3 seconds before redirecting
				await delay(3000);

				// Clean up and redirect
				await logout();
			}
		);

		return () => {
			socket?.off("sessionEnded");
		};
	}, [socket]);

	return (
		<div className="main-container-student">
			<Toast ref={toast} />
			<Sidebar visible={visible} onHide={() => setVisible(false)}>
				<h2>Student Workspace</h2>
				<div className="sidebar-buttons">
					{/*<Button className="current-session-button" onClick={() => currentSession()}>Current Session</Button>*/}
					<Button
						className="clear-current-session-button"
						onClick={() => clearCurrentSession()}
					>
						Clear Current Session
					</Button>
					<Button
						className="ask-for-help-button"
						onClick={() => askForHelp()}
					>
						I need help!
					</Button>
					<Button
						className="set-done-button"
						onClick={() => setDone()}
					>
						Task Completed!
					</Button>
					<Button className="logout-button" onClick={() => logout()}>
						Logout
					</Button>
				</div>
			</Sidebar>
			<Button
				icon="pi pi-arrow-right"
				className="sidebar-button"
				onClick={() => setVisible(true)}
			/>
			<div className="student-component-container">
				<h2 className="header">
					Hello{" "}
					{localStorage
						.getItem("username")
						?.replace(/^"(.*)"$/, "$1")
						.toUpperCase()}
				</h2>
				{sessionInfo && (
					<div className="workspace-container">
						<div className="session-info">
							<p>Teacher Name: {sessionInfo.teacherName}</p>
							<p>Session Code: {sessionInfo.code}</p>
							<p>Task: {sessionInfo?.task}</p>
						</div>
						<div className="code-editor">
							<CodeEditor
								code={code}
								language="python"
								studentId={localStorage
									.getItem("username")
									?.replace(/^"(.*)"$/, "$1")}
							/>
						</div>
					</div>
				)}
			</div>
		</div>
	);
};
