import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import "./teacher-page.css";
import { Sidebar } from "primereact/sidebar";
import { InputText } from "primereact/inputtext";
import { Button } from "primereact/button";
import { useNavigate } from "react-router-dom";
import { Toast } from "primereact/toast";

export const TeacherPage = () => {
	const [sessionId, setSessionId] = useState("");
	const [task, setTask] = useState("");
	const [visible, setVisible] = useState(false);
	const navigate = useNavigate();
	const toast = useRef<Toast>(null);

	let teacherName = localStorage
		.getItem("username")
		?.replace(/^"(.*)"$/, "$1")
		.toUpperCase();

	useEffect(() => {
		if (localStorage.getItem("permission") !== "teacher") {
			navigate("/");
		}
		const teacherName = localStorage
			.getItem("username")
			?.replace(/^"(.*)"$/, "$1")
			.toUpperCase();

		const sessionId = localStorage.getItem("sessionId");
		if (sessionId) {
			setSessionId(sessionId);
		}
	}, []);

	const showToast = (
		severity: "success" | "info" | "warn" | "error" | undefined,
		summary: string,
		detail: string
	) => {
		toast.current?.show({ severity, summary, detail });
	};

	const currentSession = () => {
		if (localStorage.getItem("sessionId")) {
			navigate("/session");
		} else {
			showToast(
				"info",
				"No current session",
				"Create a session to get started"
			);
		}
	};

	const clearCurrentSession = () => {
		if (!localStorage.getItem("sessionId")) {
			showToast(
				"info",
				"No current session",
				"Create a session to get started"
			);
		} else {
			localStorage.removeItem("sessionId");
			localStorage.removeItem("task");
			localStorage.removeItem("students");
			showToast(
				"success",
				"Session cleared",
				"You can now create a new session"
			);
		}
	};

	const logout = () => {
		localStorage.removeItem("username");
		localStorage.removeItem("permission");
		localStorage.removeItem("sessionId");
		localStorage.removeItem("token");
		window.location.reload();
	};

	const createSession = async () => {
		try {
			const response = await axios.post(
				"http://localhost:8000/api/create-session",
				{ teacherName, task }
			);
			setSessionId(response.data.sessionId);
			localStorage.setItem("sessionId", response.data.sessionId);
			localStorage.setItem("task", task);
			showToast(
				"success",
				"Session created",
				"Session ID: " + response.data.sessionId
			);
			navigate("/session");
		} catch (error) {
			console.error("Error creating session:", error);
		}

		if (sessionId) {
		}
	};

	return (
		<div className="side-bar-container">
			<Toast ref={toast} />
			<Sidebar visible={visible} onHide={() => setVisible(false)}>
				<h2>Teacher Workspace</h2>
				<div className="sidebar-buttons">
					<Button
						className="current-session-button"
						onClick={() => currentSession()}
					>
						Current Session
					</Button>
					<Button
						className="clear-current-session-button"
						onClick={() => clearCurrentSession()}
					>
						Clear Current Session
					</Button>
					<Button className="logout-button" onClick={() => logout()}>
						Logout
					</Button>
				</div>
			</Sidebar>
			<Button
				icon="pi pi-arrow-right"
				className="sidebar-button-teacher"
				onClick={() => setVisible(true)}
			/>
			<div className="label-container">
				Welcome{" "}
				{localStorage
					.getItem("username")
					?.replace(/^"(.*)"$/, "$1")
					.toUpperCase()}
			</div>
			<div className="teacher-component-container">
				<div className="session-container">
					<div className="task">
						<label>
							<InputText
								className="task-input"
								type="text"
								value={task}
								placeholder="Create a session by setting a task to be completed by your students"
								onChange={(e) => setTask(e.target.value)}
							/>
						</label>
					</div>
					<div>
						<div className="create-session">
							<Button onClick={createSession}>
								Create Session
							</Button>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
};
