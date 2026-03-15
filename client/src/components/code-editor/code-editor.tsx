import Editor from "@monaco-editor/react";
import "./code-editor.css";
import axios from "axios";
import React, { useState, useEffect, useRef } from "react";
import { Button } from "primereact/button";
import { useSocket } from "../socketContext";

interface CodeEditorProps {
	code: string;
	language: string;
	onChange?: (newCode: string) => void;
	readOnly?: boolean;
	studentId?: string;
}

export const CodeEditor = ({
	code,
	language,
	readOnly,
	studentId,
	onChange,
}: CodeEditorProps) => {
	const [inputValue, setInputValue] = useState(code || "");
	const [terminalOutput, setTerminalOutput] = useState<
		Array<{ timestamp: number; text: string; isError?: boolean }>
	>([]);
	const [stdinValue, setStdinValue] = useState("");
	const [showStdinInput, setShowStdinInput] = useState(false);
	const [teacherEdit, setTeacherEdit] = useState(false);
	const { socket } = useSocket();
	const terminalRef = useRef<HTMLDivElement>(null);

	const currentUser = sessionStorage
		.getItem("username")
		?.replace(/^"(.*)"$/, "$1");
	const isTeacher = sessionStorage.getItem("permission") === "teacher";
	const isViewingOtherStudent =
		isTeacher && studentId && studentId !== currentUser;

	const effectiveStudentId = studentId || currentUser;

	const isInitialized = useRef(false);
	const isSyncingFromSocket = useRef(false);
	const lastAppliedCode = useRef<string>("");
	const editorRef = useRef<any>(null);

	useEffect(() => {
		let secondFrame = 0;
		const firstFrame = window.requestAnimationFrame(() => {
			secondFrame = window.requestAnimationFrame(() => {
				editorRef.current?.layout();
			});
		});

		return () => {
			window.cancelAnimationFrame(firstFrame);
			if (secondFrame) {
				window.cancelAnimationFrame(secondFrame);
			}
		};
	}, [showStdinInput]);

	useEffect(() => {
		const handleWindowResize = () => {
			window.requestAnimationFrame(() => {
				editorRef.current?.layout();
			});
		};

		window.addEventListener("resize", handleWindowResize);
		return () => {
			window.removeEventListener("resize", handleWindowResize);
		};
	}, []);

	useEffect(() => {
		if (code) {
			isSyncingFromSocket.current = true;
			setInputValue(code);
			lastAppliedCode.current = code;
			setTimeout(() => {
				isSyncingFromSocket.current = false;
				isInitialized.current = true;
			}, 100);
		} else {
			isInitialized.current = true;
		}
	}, []);
	useEffect(() => {
		if (isInitialized.current && code !== undefined && code !== lastAppliedCode.current) {
			const lengthDiff = Math.abs(code.length - inputValue.length);
			
			// Syncing logic for the coding editor
			// To prevent resyncing for every single input only larger changes trigger resyncs
			// Catches 3 length differences
			// Catches code emptying
			// Catches input emptying

			if (lengthDiff > 3 || (code === "" && inputValue !== "") || (code !== "" && inputValue === "")) {
				isSyncingFromSocket.current = true;
				setInputValue(code);
				lastAppliedCode.current = code;
				setTimeout(() => {
					isSyncingFromSocket.current = false;
				}, 50);
			} else if (code === inputValue) {
				// Sync lastAppliedCode when code catches up to inputValue
				lastAppliedCode.current = code;
			}
		}
	}, [code, inputValue]);

	useEffect(() => {
		if (!socket) return;

		const handleCodeUpdate = (data: {
			studentId: string;
			code: string;
			isTeacher: boolean;
		}) => {
			// Update student we are editiing
			if (data.studentId === effectiveStudentId) {
				isSyncingFromSocket.current = true;
				setInputValue(data.code);
				setTeacherEdit(data.isTeacher);
				setTimeout(() => {
					setTeacherEdit(false);
					isSyncingFromSocket.current = false;
				}, 50);
			}
		};

		// Respond to requests for current code state
		const handleRequestCodeState = (data: { studentId: string }) => {
			if (currentUser === data.studentId && !isViewingOtherStudent) {
				socket.emit("sendCodeState", {
					studentId: currentUser,
					code: inputValue,
					isTeacher: false,
				});
			}
		};

		// Terminal output for student
		const handleTerminalOutput = (data: {
			studentId: string;
			output: string;
			isError?: boolean;
		}) => {
			if (data.studentId === effectiveStudentId) {
				setTerminalOutput((prev) => [
					...prev,
					{
						timestamp: Date.now(),
						text: data.output,
						isError: data.isError,
					},
				]);
				setTimeout(() => {
					if (terminalRef.current) {
						terminalRef.current.scrollTop =
							terminalRef.current.scrollHeight;
					}
				}, 0);
			}
		};

		// Teacher runs student code
		const handleRunForStudent = (data: {
			studentId: string;
			input?: string;
			code?: string;
		}) => {
			if (currentUser === data.studentId && !isViewingOtherStudent) {
				if (data.code) {
					isSyncingFromSocket.current = true;
					setInputValue(data.code);
					setTimeout(() => (isSyncingFromSocket.current = false), 50);
				}
				// Pass data.code directly to avoid stale closure on inputValue
				runCommand(data.input, data.code);
			}
		};

		// Clear terminal for this student
		const handleClearTerminal = (data: { studentId: string }) => {
			if (data.studentId === effectiveStudentId) {
				setTerminalOutput([]);
			}
		};

		// Request terminal state
		const handleRequestTerminalState = (data: { studentId: string }) => {
			if (currentUser === data.studentId && !isViewingOtherStudent) {
				socket.emit("sendTerminalState", {
					studentId: currentUser,
					terminalHistory: terminalOutput,
				});
			}
		};

		// Receive terminal state
		const handleTerminalStateUpdate = (data: {
			studentId: string;
			terminalHistory: Array<{
				text: string;
				isError?: boolean;
				timestamp?: number;
			}>;
		}) => {
			if (
				isViewingOtherStudent &&
				data.studentId === effectiveStudentId
			) {
				const historyWithTimestamps = data.terminalHistory.map(
					(entry) => ({
						...entry,
						timestamp: entry.timestamp || Date.now(),
					})
				);
				setTerminalOutput(historyWithTimestamps);
			}
		};

		socket.on("codeUpdate", handleCodeUpdate);
		socket.on("requestCodeState", handleRequestCodeState);
		socket.on("terminalOutput", handleTerminalOutput);
		socket.on("runForStudent", handleRunForStudent);
		socket.on("clearTerminal", handleClearTerminal);
		socket.on("requestTerminalState", handleRequestTerminalState);
		socket.on("terminalStateUpdate", handleTerminalStateUpdate);

		return () => {
			socket.off("codeUpdate", handleCodeUpdate);
			socket.off("requestCodeState", handleRequestCodeState);
			socket.off("terminalOutput", handleTerminalOutput);
			socket.off("runForStudent", handleRunForStudent);
			socket.off("clearTerminal", handleClearTerminal);
			socket.off("requestTerminalState", handleRequestTerminalState);
			socket.off("terminalStateUpdate", handleTerminalStateUpdate);
		};
	}, [
		socket,
		effectiveStudentId,
		inputValue,
		terminalOutput,
		isViewingOtherStudent,
	]);

	const handleInputChange = (newCode: string) => {
		setInputValue(newCode);

		// Dont emit until initialized
		if (!isInitialized.current || isSyncingFromSocket.current) {
			return;
		}
		if (onChange) {
			onChange(newCode);
		}
		socket?.emit("codeChange", {
			studentId: effectiveStudentId,
			code: newCode,
			isTeacher,
		});
	};

	const handleEditorMount = (editor: any, monaco: any) => {
		editorRef.current = editor;

		monaco.editor.defineTheme("vscode-dark-python", {
			base: "vs-dark",
			inherit: true,
			rules: [
				{ token: "keyword", foreground: "C586C0", fontStyle: "bold" },
				{ token: "number", foreground: "B5CEA8" },
				{ token: "string", foreground: "CE9178" },
				{ token: "comment", foreground: "6A9955", fontStyle: "italic" },
				{ token: "identifier", foreground: "9CDCFE" },
				{ token: "delimiter", foreground: "D4D4D4" },
			],
			colors: {
				"editor.background": "#1E1E1E",
				"editor.foreground": "#D4D4D4",
				"editorLineNumber.foreground": "#858585",
				"editorLineNumber.activeForeground": "#C6C6C6",
				"editorCursor.foreground": "#AEAFAD",
				"editor.selectionBackground": "#264F78",
				"editor.inactiveSelectionBackground": "#3A3D41",
			},
		});

		monaco.editor.setTheme("vscode-dark-python");
		window.requestAnimationFrame(() => {
			editor.layout();
		});
	};

	const runCommand = async (stdin?: string, codeOverride?: string) => {
		const codeToRun = codeOverride !== undefined ? codeOverride : inputValue;
		if (!codeToRun.trim()) {
			setTerminalOutput((prev) => [
				...prev,
				{
					timestamp: Date.now(),
					text: "Please enter some Python code to run",
					isError: true,
				},
			]);
			return;
		}

		socket?.emit("clearTerminal", { studentId: effectiveStudentId });

		if (isViewingOtherStudent) {
			socket?.emit("runForStudent", {
				studentId: effectiveStudentId,
				// Only send stdin if teacher has the Input panel open
				input: showStdinInput ? stdinValue : undefined,
				code: codeToRun,
			});
			return;
		}

		try {
			const containerId = sessionStorage
				.getItem("containerId")
				?.replace(/^"(.*)"$/, "$1");
			const response = await axios.post(
				"http://localhost:8000/api/docker-command",
				{
					input: codeToRun,
					containerId,
					stdin: stdin !== undefined ? stdin : stdinValue,
				}
			);

			const outputText =
				response.data.output ||
				"Code executed successfully (no output)";
			socket?.emit("terminalOutput", {
				studentId: currentUser,
				output: outputText,
			});
		} catch (error: any) {
			console.error("Error executing code:", error);
			const errorText =
				error.response?.data?.error || "Error executing Python code";
			socket?.emit("terminalOutput", {
				studentId: currentUser,
				output: errorText,
				isError: true,
			});
		}
	};

	return (
		<div className="editor">
			<div
				className={`editor-container ${
					teacherEdit ? "teacher-edit" : ""
				}`}
			>
				{/* Editor Header + Run Button */}
				<div className="editor-header">
					<div className="editor-header-left">
						<Button
							icon={showStdinInput ? "pi pi-chevron-up" : "pi pi-chevron-down"}
							label="Input"
							onClick={() => setShowStdinInput(!showStdinInput)}
							className="p-button-text p-button-sm stdin-toggle-button"
							tooltip="Toggle program input"
						/>
					</div>
					<div className="editor-header-right">
						<Button
							icon="pi pi-play"
							label="Run Code"
							onClick={() => runCommand()}
							className="p-button-success p-button-sm run-button"
						/>
					</div>
				</div>

				{/* Stdin input */}
				{showStdinInput && (
					<div className="stdin-section">
						<textarea
							id="stdin-input"
							value={stdinValue}
							onChange={(e) => setStdinValue(e.target.value)}
							className="stdin-input"
							placeholder="Enter input for input() calls (one per line)..."
						/>
					</div>
				)}

				{/* Monaco Editor */}
				<div className="monaco-wrapper">
					<Editor
						height="100%"
						language={language}
						theme="vscode-dark-python"
						value={inputValue}
						onChange={(value) => handleInputChange(value || "")}
						onMount={handleEditorMount}
						options={{
							automaticLayout: false,
							readOnly: readOnly || false,
							minimap: { enabled: false },
							fontSize: 14,
							fontFamily: "'Consolas', 'Courier New', monospace",
							lineNumbers: "on",
							renderLineHighlight: "all",
							scrollBeyondLastLine: false,
							wordWrap: "on",
							wrappingIndent: "indent",
							tabSize: 4,
							insertSpaces: true,
							autoIndent: "full",
							formatOnPaste: true,
							formatOnType: true,
							folding: true,
							foldingHighlight: true,
							matchBrackets: "always",
							cursorBlinking: "smooth",
							cursorSmoothCaretAnimation: "on",
							smoothScrolling: true,
							contextmenu: true,
							mouseWheelZoom: true,
						}}
					/>
					{teacherEdit && (
						<div className="teacher-edit-indicator">
							Teacher is editing...
						</div>
					)}
				</div>

				{/* Terminal Output */}
				<div className="terminal" ref={terminalRef}>
					<div className="terminal-header">
						<span className="terminal-title">Output</span>
					</div>
					<div className="terminal-content">
						{terminalOutput.length === 0 ? (
							<div className="terminal-empty">
								Run your code to see output here...
							</div>
						) : (
							terminalOutput.map((output, index) => (
								<div
									key={`${output.timestamp}-${index}`}
									className={`terminal-line ${
										output.isError ? "error" : ""
									}`}
								>
									<span className="terminal-prompt">{"> "}</span>
									{output.text}
								</div>
							))
						)}
					</div>
				</div>
			</div>
		</div>
	);
};
