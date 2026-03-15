import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { Button } from "primereact/button";
import { InputText } from "primereact/inputtext";
import { Password } from "primereact/password";
import { Toast } from "primereact/toast";
import { Dialog } from "primereact/dialog";
import { Card } from "primereact/card";
import { Divider } from "primereact/divider";
import { jwtDecode } from "jwt-decode";
import "./teacher-settings.css";

export const TeacherSettings = () => {
	const [teacherId, setTeacherId] = useState("");
	const [teacherName, setTeacherName] = useState("");
	const [teacherEmail, setTeacherEmail] = useState("");
	const [accountCreated, setAccountCreated] = useState("");
	const [sessionHistory, setSessionHistory] = useState<any[]>([]);
	
	// Form states
	const [newName, setNewName] = useState("");
	const [newEmail, setNewEmail] = useState("");
	const [currentPassword, setCurrentPassword] = useState("");
	const [newPassword, setNewPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [deletePassword, setDeletePassword] = useState("");
	
	// Dialog states
	const [showDeleteDialog, setShowDeleteDialog] = useState(false);
	const [showPasswordDialog, setShowPasswordDialog] = useState(false);
	
	const navigate = useNavigate();
	const toast = useRef<Toast>(null);

	useEffect(() => {
		if (sessionStorage.getItem("permission") !== "teacher") {
			navigate("/");
			return;
		}

		const token = sessionStorage.getItem("token");
		if (token) {
			try {
				const decoded: any = jwtDecode(token);
				setTeacherId(decoded.id);
				loadProfile(decoded.id);
				loadSessionHistory(decoded.id);
			} catch (error) {
				console.error("Error decoding token:", error);
				navigate("/");
			}
		}
	}, [navigate]);

	const loadProfile = async (id: string) => {
		try {
			const response = await axios.get(
				`http://localhost:8000/api/teacher/${id}/profile`
			);
			const { teacher } = response.data;
			
			setTeacherName(teacher.name);
			setTeacherEmail(teacher.email);
			setNewName(teacher.name);
			setNewEmail(teacher.email);
			setAccountCreated(new Date(teacher.createdAt).toLocaleDateString());
		} catch (error) {
			console.error("Error loading profile:", error);
			showToast("error", "Error", "Failed to load profile");
		}
	};

	const loadSessionHistory = async (id: string) => {
		try {
			const response = await axios.get(
				`http://localhost:8000/api/teacher/${id}/sessions?limit=5`
			);
			setSessionHistory(response.data.sessions);
		} catch (error) {
			console.error("Error loading session history:", error);
		}
	};

	const showToast = (severity: "success" | "info" | "warn" | "error", summary: string, detail: string) => {
		toast.current?.show({ severity, summary, detail });
	};

	const handleUpdateName = async () => {
		if (!newName.trim()) {
			showToast("warn", "Invalid Input", "Name cannot be empty");
			return;
		}

		try {
			const response = await axios.put(
				`http://localhost:8000/api/teacher/${teacherId}/name`,
				{ name: newName }
			);
			
			setTeacherName(response.data.teacher.name);
			sessionStorage.setItem("username", JSON.stringify(response.data.teacher.name));
			showToast("success", "Success", "Name updated successfully");
		} catch (error: any) {
			showToast("error", "Error", error.response?.data?.error || "Failed to update name");
		}
	};

	const handleUpdateEmail = async () => {
		if (!newEmail.trim() || !newEmail.includes("@")) {
			showToast("warn", "Invalid Input", "Please enter a valid email");
			return;
		}

		try {
			const response = await axios.put(
				`http://localhost:8000/api/teacher/${teacherId}/email`,
				{ email: newEmail }
			);
			
			setTeacherEmail(response.data.teacher.email);
			showToast("success", "Success", "Email updated successfully");
		} catch (error: any) {
			showToast("error", "Error", error.response?.data?.error || "Failed to update email");
		}
	};

	const handleChangePassword = async () => {
		if (!currentPassword || !newPassword) {
			showToast("warn", "Invalid Input", "Please fill in all password fields");
			return;
		}

		if (newPassword.length < 6) {
			showToast("warn", "Invalid Input", "New password must be at least 6 characters");
			return;
		}

		if (newPassword !== confirmPassword) {
			showToast("warn", "Invalid Input", "New passwords do not match");
			return;
		}

		try {
			await axios.put(
				`http://localhost:8000/api/teacher/${teacherId}/password`,
				{ currentPassword, newPassword }
			);
			
			setCurrentPassword("");
			setNewPassword("");
			setConfirmPassword("");
			setShowPasswordDialog(false);
			showToast("success", "Success", "Password changed successfully");
		} catch (error: any) {
			showToast("error", "Error", error.response?.data?.error || "Failed to change password");
		}
	};

	const handleDeleteAccount = async () => {
		if (!deletePassword) {
			showToast("warn", "Invalid Input", "Please enter your password");
			return;
		}

		try {
			await axios.delete(
				`http://localhost:8000/api/teacher/${teacherId}`,
				{ data: { password: deletePassword } }
			);
			
			// Clear all localStorage
			sessionStorage.clear();
			
			showToast("success", "Success", "Account deleted successfully");
			
			// Redirect to home after a short delay
			setTimeout(() => {
				navigate("/");
			}, 2000);
		} catch (error: any) {
			showToast("error", "Error", error.response?.data?.error || "Failed to delete account");
		}
	};

	return (
		<div className="settings-container">
			<Toast ref={toast} />
			
			<div className="settings-header">
				<Button
					icon="pi pi-arrow-left"
					label="Back to Dashboard"
					className="p-button-text"
					onClick={() => navigate("/teacher")}
				/>
				<h1>Account Settings</h1>
			</div>

			<div className="settings-content">
				{/* Profile Information */}
				<Card className="settings-card">
					<h2>
						<i className="pi pi-user" style={{ marginRight: "10px" }}></i>
						Profile Information
					</h2>
					<Divider />
					
					<div className="profile-info">
						<div className="info-row">
							<span className="info-label">Account Created:</span>
							<span className="info-value">{accountCreated}</span>
						</div>
					</div>

					<Divider />

					<div className="field">
						<label htmlFor="name">Name</label>
						<div className="input-with-button">
							<InputText
								id="name"
								value={newName}
								onChange={(e) => setNewName(e.target.value)}
								placeholder="Enter your name"
							/>
							<Button
								label="Update"
								onClick={handleUpdateName}
								disabled={newName === teacherName || !newName.trim()}
							/>
						</div>
					</div>

					<div className="field">
						<label htmlFor="email">Email</label>
						<div className="input-with-button">
							<InputText
								id="email"
								value={newEmail}
								onChange={(e) => setNewEmail(e.target.value)}
								placeholder="Enter your email"
							/>
							<Button
								label="Update"
								onClick={handleUpdateEmail}
								disabled={newEmail === teacherEmail || !newEmail.trim()}
							/>
						</div>
					</div>
				</Card>

				{/* Security Settings */}
				<Card className="settings-card">
					<h2>
						<i className="pi pi-lock" style={{ marginRight: "10px" }}></i>
						Security
					</h2>
					<Divider />
					
					<div className="field">
						<label>Password</label>
						<Button
							label="Change Password"
							icon="pi pi-key"
							onClick={() => setShowPasswordDialog(true)}
							className="p-button-secondary"
						/>
					</div>
				</Card>

				{/* Session History */}
				<Card className="settings-card">
					<h2>
						<i className="pi pi-history" style={{ marginRight: "10px" }}></i>
						Recent Sessions
					</h2>
					<Divider />
					
					{sessionHistory.length === 0 ? (
						<p className="no-data">No sessions found</p>
					) : (
						<div className="session-history">
							{sessionHistory.map((session, index) => (
								<div key={index} className="session-item">
									<div className="session-info">
										<strong>{session.code}</strong>
										<span className="session-task">{session.task}</span>
										<span className="session-meta">
											{session.mode === "empty" ? "Empty" : session.mode === "game" ? "Game" : "Teaching"} • 
											{session.studentCount} students • 
											{new Date(session.createdAt).toLocaleDateString()}
										</span>
									</div>
								</div>
							))}
						</div>
					)}
				</Card>

				{/* Danger Zone */}
				<Card className="settings-card danger-card">
					<h2>
						<i className="pi pi-exclamation-triangle" style={{ marginRight: "10px" }}></i>
						Danger Zone
					</h2>
					<Divider />
					
					<p className="danger-text">
						Deleting your account will permanently remove all your data, including all sessions you've created. 
						This action cannot be undone.
					</p>
					
					<Button
						label="Delete Account"
						icon="pi pi-trash"
						className="p-button-danger"
						onClick={() => setShowDeleteDialog(true)}
					/>
				</Card>
			</div>

			{/* Change Password Dialog */}
			<Dialog
				header="Change Password"
				visible={showPasswordDialog}
				style={{ width: "450px" }}
				onHide={() => {
					setShowPasswordDialog(false);
					setCurrentPassword("");
					setNewPassword("");
					setConfirmPassword("");
				}}
				modal
			>
				<div className="dialog-content">
					<div className="field">
						<label htmlFor="currentPassword">Current Password</label>
						<Password
							id="currentPassword"
							value={currentPassword}
							onChange={(e) => setCurrentPassword(e.target.value)}
							feedback={false}
							toggleMask
						/>
					</div>

					<div className="field">
						<label htmlFor="newPassword">New Password</label>
						<Password
							id="newPassword"
							value={newPassword}
							onChange={(e) => setNewPassword(e.target.value)}
							toggleMask
						/>
					</div>

					<div className="field">
						<label htmlFor="confirmPassword">Confirm New Password</label>
						<Password
							id="confirmPassword"
							value={confirmPassword}
							onChange={(e) => setConfirmPassword(e.target.value)}
							feedback={false}
							toggleMask
						/>
					</div>

					<div className="dialog-actions">
						<Button
							label="Cancel"
							icon="pi pi-times"
							onClick={() => {
								setShowPasswordDialog(false);
								setCurrentPassword("");
								setNewPassword("");
								setConfirmPassword("");
							}}
							className="p-button-text"
						/>
						<Button
							label="Change Password"
							icon="pi pi-check"
							onClick={handleChangePassword}
						/>
					</div>
				</div>
			</Dialog>

			{/* Delete Account Dialog */}
			<Dialog
				header="Delete Account"
				visible={showDeleteDialog}
				style={{ width: "450px" }}
				onHide={() => {
					setShowDeleteDialog(false);
					setDeletePassword("");
				}}
				modal
			>
				<div className="dialog-content">
					<p className="delete-warning">
						<i className="pi pi-exclamation-triangle" style={{ fontSize: "2rem", color: "#dc3545" }}></i>
					</p>
					<p className="delete-warning-text">
						This action is permanent and cannot be undone. All your sessions and data will be deleted.
					</p>

					<div className="field">
						<label htmlFor="deletePassword">Enter your password to confirm</label>
						<Password
							id="deletePassword"
							value={deletePassword}
							onChange={(e) => setDeletePassword(e.target.value)}
							feedback={false}
							toggleMask
							placeholder="Enter password"
						/>
					</div>

					<div className="dialog-actions">
						<Button
							label="Cancel"
							icon="pi pi-times"
							onClick={() => {
								setShowDeleteDialog(false);
								setDeletePassword("");
							}}
							className="p-button-text"
						/>
						<Button
							label="Delete My Account"
							icon="pi pi-trash"
							onClick={handleDeleteAccount}
							className="p-button-danger"
						/>
					</div>
				</div>
			</Dialog>
		</div>
	);
};
