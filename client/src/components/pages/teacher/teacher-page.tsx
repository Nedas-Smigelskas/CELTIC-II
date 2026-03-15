import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import "./teacher-page.css";
import { InputText } from "primereact/inputtext";
import { Button } from "primereact/button";
import { useNavigate } from "react-router-dom";
import { Toast } from "primereact/toast";
import { Dialog } from "primereact/dialog";
import { Dropdown } from "primereact/dropdown";
import { TaskBuilder } from "./task-builder";
import { TaskTemplateManager } from "./task-template-manager";
import { jwtDecode } from "jwt-decode";

export const TeacherPage = () => {
	const [sessionId, setSessionId] = useState("");
	const [task, setTask] = useState("");
	const [showTaskBuilder, setShowTaskBuilder] = useState(false);
	const [showTaskManager, setShowTaskManager] = useState(false);
	const [showSessionDialog, setShowSessionDialog] = useState(false);
	const [sessionMode, setSessionMode] = useState<"empty" | "template">("empty");
	const [templates, setTemplates] = useState<any[]>([]);
	const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
	const [teacherId, setTeacherId] = useState<string>("");
	const navigate = useNavigate();
	const toast = useRef<Toast>(null);

	const teacherName = sessionStorage
		.getItem("username")
		?.replace(/^"(.*)"$/, "$1")
		.toUpperCase();

	useEffect(() => {
		if (sessionStorage.getItem("permission") !== "teacher") {
			navigate("/");
		}
		
		// Get teacher ID from JWT token
		const token = sessionStorage.getItem("token");
		let currentTeacherId = "";
		if (token) {
			try {
				const decoded: any = jwtDecode(token);
				currentTeacherId = decoded.id;
				setTeacherId(decoded.id);
			} catch (error) {
				console.error("Error decoding token:", error);
			}
		}

		// Check for active session
		if (currentTeacherId) {
			checkForActiveSession(currentTeacherId);
		}
	}, [navigate]);

	const checkForActiveSession = async (teacherId: string) => {
		try {
			const response = await axios.get(
				`http://localhost:8000/api/teacher/${teacherId}/active-session`
			);
			
			if (response.data.hasActiveSession) {
				// Restore session to localStorage
				const sessionData = response.data;
				sessionStorage.setItem("sessionId", sessionData.sessionId);
				sessionStorage.setItem("task", sessionData.task || "");
				setSessionId(sessionData.sessionId);
			} else {
				// No active session, clear any stale localStorage data
				sessionStorage.removeItem("sessionId");
				sessionStorage.removeItem("task");
				sessionStorage.removeItem("students");
				setSessionId("");
			}
		} catch (error) {
			console.error("Error checking for active session:", error);
			// On error clear localStorage
			sessionStorage.removeItem("sessionId");
			sessionStorage.removeItem("task");
			sessionStorage.removeItem("students");
			setSessionId("");
		}
	};

	const validateSession = async (sessionId: string, teacherId: string) => {
		try {
			const response = await axios.get(
				`http://localhost:8000/api/session/${sessionId}`
			);
			
			if (response.data.session) {
				const sessionTeacherId = response.data.session.teacherId;
				
				// Check if session belongs to current teacher
				if (sessionTeacherId && sessionTeacherId.toString() === teacherId) {
					setSessionId(sessionId);
				} else {
					// Session doesn't belong to this teacher, clear it
					sessionStorage.removeItem("sessionId");
					sessionStorage.removeItem("task");
					sessionStorage.removeItem("students");
					setSessionId("");
				}
			}
		} catch (error) {
			console.error("Error validating session:", error);
			// If session not found or error, clear it
			sessionStorage.removeItem("sessionId");
			sessionStorage.removeItem("task");
			sessionStorage.removeItem("students");
			setSessionId("");
		}
	};

	const showToast = (
		severity: "success" | "info" | "warn" | "error" | undefined,
		summary: string,
		detail: string
	) => {
		toast.current?.show({ severity, summary, detail });
	};

	const currentSession = () => {
		if (sessionStorage.getItem("sessionId")) {
			navigate("/session");
		} else {
			showToast(
				"info",
				"No current session",
				"Create a session to get started"
			);
		}
	};

	const clearCurrentSession = async () => {
		const currentSessionId = sessionStorage.getItem("sessionId");
		if (!currentSessionId) {
			showToast(
				"info",
				"No current session",
				"Create a session to get started"
			);
		} else {
			try {
				await axios.delete(
					`http://localhost:8000/api/session/${currentSessionId}`
				);
				
				// Clear localStorage
				sessionStorage.removeItem("sessionId");
				sessionStorage.removeItem("task");
				sessionStorage.removeItem("students");
				setSessionId("");
				
				showToast(
					"success",
					"Session cleared",
					"You can now create a new session"
				);
			} catch (error) {
				console.error("Error clearing session:", error);
				// Clear localStorage even if API call fails
				sessionStorage.removeItem("sessionId");
				sessionStorage.removeItem("task");
				sessionStorage.removeItem("students");
				setSessionId("");
				
				showToast(
					"warn",
					"Session cleared locally",
					"There was an issue clearing the session from the server"
				);
			}
		}
	};

	const logout = () => {
		sessionStorage.removeItem("username");
		sessionStorage.removeItem("permission");
		sessionStorage.removeItem("sessionId");
		sessionStorage.removeItem("token");
		window.location.reload();
	};

	const loadTemplates = async () => {
		if (!teacherId) return;
		try {
			const response = await axios.get(
				`http://localhost:8000/api/templates/teacher/${teacherId}`
			);
			setTemplates(response.data.templates);
		} catch (error) {
			console.error("Error loading templates:", error);
		}
	};

	const openSessionDialog = () => {
		setSessionMode("empty");
		setSelectedTemplate(null);
		loadTemplates();
		setShowSessionDialog(true);
	};

	const createSession = async () => {
		const storedTeacherName = sessionStorage
			.getItem("username")
			?.replace(/^"(.*)"$/, "$1");

		try {
			let sessionData: any = {
				teacherName: storedTeacherName,
				task: task.trim() || "Complete the assigned tasks",
				mode: "empty",
			};
			if (teacherId) {
				sessionData.teacherId = teacherId;
			}
			if (sessionMode === "template" && selectedTemplate) {
				const template = templates.find((t: any) => t._id === selectedTemplate);
				if (template) {
					sessionData.mode = template.mode;
					sessionData.templateId = template._id;
					sessionData.taskList = template.tasks.map((t: any) => t._id);
					sessionData.task = `${template.name} (${template.tasks.length} tasks)`;
				}
			}

			const response = await axios.post(
				"http://localhost:8000/api/create-session",
				sessionData
			);
			
			setSessionId(response.data.sessionId);
			sessionStorage.setItem("sessionId", response.data.sessionId);
			sessionStorage.setItem("task", sessionData.task);
			
			showToast(
				"success",
				"Session created",
				"Session ID: " + response.data.sessionId
			);
			
			setShowSessionDialog(false);
			navigate("/session");
		} catch (error: any) {
			console.error("Error creating session:", error);
			showToast(
				"error",
				"Error",
				error.response?.data?.details || error.response?.data?.error || "Failed to create session"
			);
		}
	};

	return (
		<div className="side-bar-container">
			<Toast ref={toast} />
			<div className="teacher-header">
				<div className="label-container">
					Welcome {teacherName}
				</div>
				<div className="header-controls">
					{sessionId && (
						<>
							<Button
								label="Rejoin Session"
								icon="pi pi-arrow-right"
								className="p-button-success"
								onClick={() => currentSession()}
							/>
							<Button
								label="Clear Session"
								icon="pi pi-times"
								className="p-button-warning"
								onClick={() => clearCurrentSession()}
							/>
						</>
					)}
					<Button
						label="Settings"
						icon="pi pi-cog"
						className="p-button-info"
						onClick={() => navigate("/teacher/settings")}
					/>
					<Button
						label="Logout"
						icon="pi pi-sign-out"
						className="p-button-danger"
						onClick={() => logout()}
					/>
				</div>
			</div>
			<div className="teacher-component-container">
				<div className="teacher-dashboard">
					<h2>Teacher Dashboard</h2>
					<p className="dashboard-subtitle">
						Create programming tasks and manage gamified learning sessions
					</p>

					<div className="dashboard-grid">
						<div className="dashboard-card">
							<div className="card-icon">
								<i className="pi pi-file-edit" style={{ fontSize: "2rem" }}></i>
							</div>
							<h3>Create Task</h3>
							<p>Build a new programming challenge with test cases</p>
							<Button
								label="New Task"
								icon="pi pi-plus"
								onClick={() => setShowTaskBuilder(true)}
								className="p-button-raised"
							/>
						</div>

						<div className="dashboard-card">
							<div className="card-icon">
								<i className="pi pi-folder-open" style={{ fontSize: "2rem" }}></i>
							</div>
							<h3>Manage Tasks</h3>
							<p>View, edit, and create session templates</p>
							<Button
								label="Manage"
								icon="pi pi-cog"
								onClick={() => setShowTaskManager(true)}
								className="p-button-raised p-button-secondary"
							/>
						</div>

						<div className="dashboard-card">
							<div className="card-icon">
								<i className="pi pi-play" style={{ fontSize: "2rem" }}></i>
							</div>
							<h3>Start Session</h3>
							<p>Create an empty or template-based session</p>
							<Button
								label="Create Session"
								icon="pi pi-arrow-right"
								onClick={openSessionDialog}
								className="p-button-raised p-button-success"
							/>
						</div>
					</div>
				</div>
			</div>

			{/* Task Builder Dialog */}
			<TaskBuilder
				visible={showTaskBuilder}
				onHide={() => setShowTaskBuilder(false)}
				onTaskSaved={() => {}}
				teacherId={teacherId}
			/>

			{/* Task & Template Manager Dialog */}
			<TaskTemplateManager
				visible={showTaskManager}
				onHide={() => setShowTaskManager(false)}
				teacherId={teacherId}
				onTasksUpdated={() => {
					loadTemplates();
				}}
			/>

			{/* Session Creation Dialog */}
			<Dialog
				header="Create New Session"
				visible={showSessionDialog}
				style={{ width: "600px" }}
				onHide={() => setShowSessionDialog(false)}
				modal
			>
				<div className="session-dialog-content">
					<div className="field">
						<label>Session Type</label>
						<div className="session-type-options">
							<div
								className={`session-type-card ${
									sessionMode === "empty" ? "selected" : ""
								}`}
								onClick={() => setSessionMode("empty")}
							>
								<i className="pi pi-file" style={{ fontSize: "1.5rem" }}></i>
								<h4>Empty Session</h4>
								<p>Simple session with custom task description</p>
							</div>
							<div
								className={`session-type-card ${
									sessionMode === "template" ? "selected" : ""
								}`}
								onClick={() => setSessionMode("template")}
							>
								<i className="pi pi-list" style={{ fontSize: "1.5rem" }}></i>
								<h4>Template Session</h4>
								<p>Use a pre-made task sequence</p>
							</div>
						</div>
					</div>

					{sessionMode === "empty" && (
						<div className="field">
							<label htmlFor="emptyTask">Task Description</label>
							<InputText
								id="emptyTask"
								value={task}
								onChange={(e) => setTask(e.target.value)}
								placeholder="Enter what students should do..."
								className="w-full"
							/>
						</div>
					)}

					{sessionMode === "template" && (
						<div className="field">
							<label htmlFor="template">Select Template</label>
							{templates.length === 0 ? (
								<p className="no-templates-message">
									No templates available. Create tasks and templates first.
								</p>
							) : (
								<Dropdown
									id="template"
									value={selectedTemplate}
									options={templates.map((t) => ({
										label: `${t.name} - ${t.mode === "game" ? "Game" : "Teaching"} (${t.tasks.length} tasks)`,
										value: t._id,
									}))}
									onChange={(e) => setSelectedTemplate(e.value)}
									placeholder="Choose a template..."
									className="w-full"
								/>
							)}
						</div>
					)}

					<div className="dialog-actions">
						<Button
							label="Cancel"
							icon="pi pi-times"
							onClick={() => setShowSessionDialog(false)}
							className="p-button-text"
						/>
						<Button
							label="Create Session"
							icon="pi pi-check"
							onClick={createSession}
							disabled={
								sessionMode === "template" &&
								(!selectedTemplate || templates.length === 0)
							}
						/>
					</div>
				</div>
			</Dialog>
		</div>
	);
};
