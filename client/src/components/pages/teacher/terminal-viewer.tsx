import React, { useEffect, useState, useRef } from "react";
import { Card } from "primereact/card";
import { Button } from "primereact/button";
import "./terminal-viewer.css";
import { useSocket } from "../../socketContext";
import { Dialog } from "primereact/dialog";
import { CodeEditor } from "../../code-editor/code-editor";
import axios from "axios";

interface TerminalOutput {
	output: string;
	timestamp: number;
}

interface StudentTerminal {
	[studentId: string]: TerminalOutput[];
}

interface StudentCode {
	[studentId: string]: string;
}

interface StudentProgress {
	studentId: string;
	currentTaskIndex: number;
	completedTasks: number;
	totalPoints: number;
}

interface TaskSummary {
	id: string;
	title: string;
}

export const TerminalViewer = () => {
	const { socket } = useSocket();
	const [highlightedUser, setHighlightedUser] = useState("");
	const [doneUser, setDoneUser] = useState("");
	const [studentList, setStudentList] = useState<string[]>([]);
	const [selectedStudent, setSelectedStudent] = useState<string | null>(null);
	const [showTerminal, setShowTerminal] = useState(false);
	const [studentTerminals, setStudentTerminals] = useState<StudentTerminal>(
		{}
	);
	const [studentCode, setStudentCode] = useState<StudentCode>({});
	const [isLoadingCode, setIsLoadingCode] = useState(false);
	const [sessionMode, setSessionMode] = useState<string>("empty");
	const [studentProgress, setStudentProgress] = useState<StudentProgress[]>([]);
	const [taskList, setTaskList] = useState<TaskSummary[]>([]);
	const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

	useEffect(() => {
		const teacherHelpListener = (data: { studentId: string }) => {
			setHighlightedUser(data.studentId);
		};

		const studentDoneListener = (data: { studentId: string }) => {
			setDoneUser(data.studentId);
		};

		const removeStudentListener = (data: { studentId: string }) => {
			setStudentList((currentStudents) =>
				currentStudents.filter((item) => item !== data.studentId)
			);
			setStudentTerminals((current) => {
				const updated = { ...current };
				delete updated[data.studentId];
				return updated;
			});
		};

		const terminalUpdateListener = (data: {
			studentId: string;
			output: string;
		}) => {
			setStudentTerminals((current) => {
				const studentHistory = current[data.studentId] || [];
				return {
					...current,
					[data.studentId]: [
						...studentHistory,
						{ output: data.output, timestamp: Date.now() },
					],
				};
			});
		};

		const studentListUpdateListener = (data: { students: string[] }) => {
			setStudentList(data.students);
			fetchSessionInfo(); // Refresh session info when student list updates
		};

		const codeUpdateListener = (data: {
			studentId: string;
			code: string;
			isTeacher: boolean;
		}) => {
			// Only store code updates from students
			// Dont cache teacher edits
			if (!data.isTeacher) {
				setStudentCode((current) => ({
					...current,
					[data.studentId]: data.code,
				}));
			}

			// Stop loading for this student no matter who sent it
			if (data.studentId === selectedStudent) {
				setIsLoadingCode(false);
				if (loadingTimeoutRef.current) {
					clearTimeout(loadingTimeoutRef.current);
					loadingTimeoutRef.current = null;
				}
			}
		};

		const progressUpdateListener = (data: {
			studentId: string;
			currentTaskIndex: number;
			completedTasks: number;
			totalPoints: number;
		}) => {
			setStudentProgress((current) =>
				current.map((sp) =>
					sp.studentId === data.studentId
						? { ...sp, currentTaskIndex: data.currentTaskIndex, completedTasks: data.completedTasks, totalPoints: data.totalPoints }
						: sp
				)
			);
		};

		socket?.on("receiveMessage", messageListener);
		socket?.on("teacherHelp", teacherHelpListener);
		socket?.on("studentDone", studentDoneListener);
		socket?.on("removeStudent", removeStudentListener);
		socket?.on("studentTerminalUpdate", terminalUpdateListener);
		socket?.on("studentListUpdate", studentListUpdateListener);
		socket?.on("codeUpdate", codeUpdateListener);
		socket?.on("studentProgressUpdate", progressUpdateListener);

		// Request the current student list when component mounts
		if (socket) {
			const sessionId = localStorage
				.getItem("sessionId")
				?.replace(/^"(.*)"$/, "$1");
			socket.emit("requestStudentList", { sessionId });
			fetchSessionInfo(); // Fetch session info on mount
		}

		return () => {
			socket?.off("receiveMessage", messageListener);
			socket?.off("teacherHelp", teacherHelpListener);
			socket?.off("studentDone", studentDoneListener);
			socket?.off("removeStudent", removeStudentListener);
			socket?.off("studentTerminalUpdate", terminalUpdateListener);
			socket?.off("studentListUpdate", studentListUpdateListener);
			socket?.off("codeUpdate", codeUpdateListener);
			socket?.off("studentProgressUpdate", progressUpdateListener);
		};
	}, [socket]);

	const messageListener = (data: { studentId: string }) => {
		setStudentList((prevStudents) => {
			if (!prevStudents.includes(data.studentId)) {
				return [...prevStudents, data.studentId];
			}
			return prevStudents;
		});
	};

	const clearHighlights = () => {
		setHighlightedUser("");
		setDoneUser("");
	};

	const fetchSessionInfo = async () => {
		const sessionId = sessionStorage.getItem("sessionId");
		if (!sessionId) return;

		try {
			const response = await axios.get(
				`http://localhost:8000/api/session/${sessionId}`
			);
			const session = response.data.session;
			
			setSessionMode(session.mode || "empty");
			if (session.studentProgress) {
				setStudentProgress(session.studentProgress);
			}
			if (session.taskList) {
				setTaskList(session.taskList);
			}
		} catch (error) {
			console.error("Error fetching session info:", error);
		}
	};

	const refreshStudentList = () => {
		socket?.emit("requestStudentList");
		fetchSessionInfo();
	};

	const openTerminal = (studentId: string) => {
		setSelectedStudent(studentId);
		setIsLoadingCode(true);

		// Clear any existing timeout
		if (loadingTimeoutRef.current) {
			clearTimeout(loadingTimeoutRef.current);
		}

		// Clear the help highlight since teacher is now responding
		if (highlightedUser === studentId) {
			setHighlightedUser("");
		}

		// Notify the student that the teacher is viewing their code
		socket?.emit("teacherViewingStudent", { studentId });

		// If we already have cached code use it immediately and dont wait
		if (studentCode[studentId] !== undefined) {
			setIsLoadingCode(false);
			setShowTerminal(true);
			return;
		}

		// Request fresh code and terminal state
		socket?.emit("requestInitialCode", { studentId });
		socket?.emit("requestTerminalState", { studentId });

		setShowTerminal(true);

		loadingTimeoutRef.current = setTimeout(() => {
			setIsLoadingCode(false);
			loadingTimeoutRef.current = null;
		}, 1000);
	};

	const closeTerminal = () => {
		if (selectedStudent) {
			socket?.emit("teacherLeftStudent", { studentId: selectedStudent });
		}
		setShowTerminal(false);
	};

	const formatTimestamp = (timestamp: number) => {
		return new Date(timestamp).toLocaleTimeString();
	};

	return (
		<div className="terminal-viewer-container">
			<div className="terminal-viewer-header">
				<h2 className="terminal-viewer-title">Student Terminals</h2>
				<Button
					icon="pi pi-refresh"
					className="p-button-rounded p-button-text"
					onClick={refreshStudentList}
					tooltip="Refresh student list"
				/>
			</div>
			<div className="students-container">
				{studentList.map((studentId) => {
					const progress = studentProgress.find(sp => sp.studentId === studentId);
					const currentTask = progress && taskList[progress.currentTaskIndex];
					
					return (
					<div
						key={studentId}
						className="student-card-container"
						style={{
							background:
								highlightedUser === studentId
									? "red"
									: doneUser === studentId
									? "green"
									: "white",
						}}
					>
						<Button
							className="card-button"
							style={{
								background:
									highlightedUser === studentId
										? "red"
										: doneUser === studentId
										? "green"
										: "transparent",
							}}
							onClick={() => openTerminal(studentId)}
						>
							<Card unstyled={true}>
								<h3 className="student-user">{studentId}</h3>
								{sessionMode !== "empty" && progress && (
									<div className="student-task-info">
										<p className="task-progress-text">
											Task {progress.currentTaskIndex + 1} of {taskList.length}
										</p>
										{currentTask && (
											<p className="current-task-name">{currentTask.title}</p>
										)}
										<p className="tasks-completed">
											✓ {progress.completedTasks} completed
										</p>
									</div>
								)}
								<div className="card-actions">
									<i
										className="pi pi-terminal"
										title="View Terminal"
									/>
								</div>
							</Card>
						</Button>
					</div>
					);
				})}
			</div>

			<Dialog
				header={`${selectedStudent}'s Workspace`}
				visible={showTerminal}
				style={{ width: "90vw", height: "90vh" }}
				modal
				onHide={closeTerminal}
			>
				{selectedStudent && (
					<div className="student-workspace-view">
						<div className="code-section">
							<h3>Student's Code</h3>
							{!isLoadingCode &&
							studentCode[selectedStudent] !== undefined ? (
								<CodeEditor
									key={selectedStudent}
									code={studentCode[selectedStudent] || ""}
									language="python"
									studentId={selectedStudent}
								/>
							) : (
								<div
									style={{
										padding: "20px",
										textAlign: "center",
									}}
								>
									<i
										className="pi pi-spin pi-spinner"
										style={{ fontSize: "2rem" }}
									></i>
									<p>Loading student's code...</p>
								</div>
							)}
						</div>
					</div>
				)}
			</Dialog>
		</div>
	);
};
