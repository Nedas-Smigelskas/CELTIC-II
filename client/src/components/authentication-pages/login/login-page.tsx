import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./login-page.css";
import axios from "axios";

export const LoginPage = () => {
	const [mode, setMode] = useState<"teacher" | "student">("teacher");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [studentName, setStudentName] = useState("");
	const [sessionCode, setSessionCode] = useState("");
	const [message, setMessage] = useState("");
	const navigate = useNavigate();

	const handleTeacherLogin = (e: React.FormEvent) => {
		e.preventDefault();
		axios
			.post("http://localhost:8000/api/teacher-login", {
				email,
				password,
			})
			.then((response) => {
				if (response.status === 200) {
				sessionStorage.setItem("token", response.data.accessToken);
				sessionStorage.setItem(
					"username",
					JSON.stringify(response.data.user.name)
				);
				sessionStorage.setItem("permission", "teacher");
					setMessage("Login successful");
					setTimeout(() => {
						navigate("/teacher");
					}, 100);
				} else {
					setMessage("Authentication failed");
				}
			})
			.catch((error) => {
				console.error("Error:", error);
				setMessage("Invalid email or password");
			});
	};

	const handleStudentJoin = (e: React.FormEvent) => {
		e.preventDefault();
		if (!studentName.trim() || !sessionCode.trim()) {
			setMessage("Please enter your name and session code");
			return;
		}

		// Verify session exists and get session info
		axios
			.post("http://localhost:8000/api/verify-session", {
				sessionCode,
			})
			.then((response) => {
				if (response.status === 200) {
					// Store student info for session
					sessionStorage.setItem(
						"username",
						JSON.stringify(studentName)
					);
					sessionStorage.setItem("permission", "student");
					sessionStorage.setItem("sessionId", sessionCode);
					sessionStorage.setItem(
						"student-sessionInfo",
						JSON.stringify(response.data.session)
					);

					// Navigate to student page
					navigate("/student");
				} else {
					setMessage("Invalid session code");
				}
			})
			.catch((error) => {
				console.error("Error:", error);
				setMessage("Invalid session code");
			});
	};

	return (
		<div className="main-container-login">
			<div className="container-login">
				<div className="mode-toggle">
					<button
						type="button"
						className={mode === "teacher" ? "active" : ""}
						onClick={() => {
							setMode("teacher");
							setMessage("");
						}}
					>
						Teacher Login
					</button>
					<button
						type="button"
						className={mode === "student" ? "active" : ""}
						onClick={() => {
							setMode("student");
							setMessage("");
						}}
					>
						Join Session
					</button>
				</div>

				{mode === "teacher" ? (
					<form onSubmit={handleTeacherLogin}>
						<div className="title-login">Teacher Login</div>
						<div className="input-box-login underline">
							<input
								type="email"
								placeholder="Email"
								required={true}
								value={email}
								onChange={(e) => setEmail(e.target.value)}
							/>
							<div className="underline-login"></div>
						</div>
						<div className="input-box-login">
							<input
								type="password"
								placeholder="Password"
								required={true}
								value={password}
								onChange={(e) => setPassword(e.target.value)}
							/>
							<div className="underline-login"></div>
						</div>
						<div className="input-box-login button">
							<input type="submit" value="Login" />
						</div>
						{message && <p className="message">{message}</p>}
						<div className="redirect-to-register">
							<p>Don't have an account?</p>
							<button
								type="button"
								onClick={() => navigate("/register")}
								className="redirect-to-register-button"
							>
								Register
							</button>
						</div>
					</form>
				) : (
					<form onSubmit={handleStudentJoin}>
						<div className="title-login">Join Session</div>
						<div className="input-box-login underline">
							<input
								type="text"
								placeholder="Your Name"
								required={true}
								value={studentName}
								onChange={(e) => setStudentName(e.target.value)}
							/>
							<div className="underline-login"></div>
						</div>
						<div className="input-box-login">
							<input
								type="text"
								placeholder="Session Code"
								required={true}
								value={sessionCode}
								onChange={(e) => setSessionCode(e.target.value)}
							/>
							<div className="underline-login"></div>
						</div>
						<div className="input-box-login button">
							<input type="submit" value="Join" />
						</div>
						{message && <p className="message">{message}</p>}
					</form>
				)}
			</div>
		</div>
	);
};
