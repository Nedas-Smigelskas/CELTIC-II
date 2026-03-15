import express from "express";
import { Teacher, Session } from "../../models";
import { Logger } from "../../utils/logger";

const router = express.Router();

// Get teacher profile
router.get("/api/teacher/:teacherId/profile", async (req, res) => {
	try {
		const { teacherId } = req.params;
		
		const teacher = await Teacher.findById(teacherId).select("-password");
		
		if (!teacher) {
			return res.status(404).json({ error: "Teacher not found" });
		}
		
		res.json({
			teacher: {
				id: teacher._id,
				name: teacher.name,
				email: teacher.email,
				createdAt: teacher.createdAt,
			}
		});
	} catch (error) {
		Logger.error("Error fetching teacher profile", error);
		res.status(500).json({ error: "Failed to fetch profile" });
	}
});

// Update teacher name
router.put("/api/teacher/:teacherId/name", async (req, res) => {
	try {
		const { teacherId } = req.params;
		const { name } = req.body;
		
		if (!name || name.trim().length === 0) {
			return res.status(400).json({ error: "Name is required" });
		}
		
		const teacher = await Teacher.findByIdAndUpdate(
			teacherId,
			{ name: name.trim() },
			{ new: true }
		).select("-password");
		
		if (!teacher) {
			return res.status(404).json({ error: "Teacher not found" });
		}
		
		Logger.info("Teacher name updated", { teacherId, newName: name });
		
		res.json({
			message: "Name updated successfully",
			teacher: {
				id: teacher._id,
				name: teacher.name,
				email: teacher.email,
			}
		});
	} catch (error) {
		Logger.error("Error updating teacher name", error);
		res.status(500).json({ error: "Failed to update name" });
	}
});

// Update teacher email
router.put("/api/teacher/:teacherId/email", async (req, res) => {
	try {
		const { teacherId } = req.params;
		const { email } = req.body;
		
		if (!email || !email.includes("@")) {
			return res.status(400).json({ error: "Valid email is required" });
		}
		
		// Check if email already exists
		const existingTeacher = await Teacher.findOne({ email: email.toLowerCase() });
		if (existingTeacher && existingTeacher._id.toString() !== teacherId) {
			return res.status(400).json({ error: "Email already in use" });
		}
		
		const teacher = await Teacher.findByIdAndUpdate(
			teacherId,
			{ email: email.toLowerCase().trim() },
			{ new: true }
		).select("-password");
		
		if (!teacher) {
			return res.status(404).json({ error: "Teacher not found" });
		}
		
		Logger.info("Teacher email updated", { teacherId, newEmail: email });
		
		res.json({
			message: "Email updated successfully",
			teacher: {
				id: teacher._id,
				name: teacher.name,
				email: teacher.email,
			}
		});
	} catch (error) {
		Logger.error("Error updating teacher email", error);
		res.status(500).json({ error: "Failed to update email" });
	}
});

// Change password
router.put("/api/teacher/:teacherId/password", async (req, res) => {
	try {
		const { teacherId } = req.params;
		const { currentPassword, newPassword } = req.body;
		
		if (!currentPassword || !newPassword) {
			return res.status(400).json({ error: "Current and new password are required" });
		}
		
		if (newPassword.length < 6) {
			return res.status(400).json({ error: "New password must be at least 6 characters" });
		}
		
		const teacher = await Teacher.findById(teacherId);
		
		if (!teacher) {
			return res.status(404).json({ error: "Teacher not found" });
		}
		
		// Verify current password
		if (teacher.password !== currentPassword) {
			return res.status(401).json({ error: "Current password is incorrect" });
		}
		
		// Update password
		teacher.password = newPassword;
		await teacher.save();
		
		Logger.info("Teacher password changed", { teacherId });
		
		res.json({ message: "Password changed successfully" });
	} catch (error) {
		Logger.error("Error changing password", error);
		res.status(500).json({ error: "Failed to change password" });
	}
});

// Delete teacher account
router.delete("/api/teacher/:teacherId", async (req, res) => {
	try {
		const { teacherId } = req.params;
		const { password } = req.body;
		
		if (!password) {
			return res.status(400).json({ error: "Password is required to delete account" });
		}
		
		const teacher = await Teacher.findById(teacherId);
		
		if (!teacher) {
			return res.status(404).json({ error: "Teacher not found" });
		}
		
		// Verify password
		if (teacher.password !== password) {
			return res.status(401).json({ error: "Incorrect password" });
		}
		
		// Delete all sessions created by this teacher
		const sessionResult = await Session.deleteMany({ teacherId: teacherId });
		
		// Delete teacher account
		await Teacher.findByIdAndDelete(teacherId);
		
		Logger.info("Teacher account deleted", { 
			teacherId, 
			email: teacher.email,
			sessionsDeleted: sessionResult.deletedCount 
		});
		
		res.json({ 
			message: "Account deleted successfully",
			sessionsDeleted: sessionResult.deletedCount
		});
	} catch (error) {
		Logger.error("Error deleting teacher account", error);
		res.status(500).json({ error: "Failed to delete account" });
	}
});

// Get session history
router.get("/api/teacher/:teacherId/sessions", async (req, res) => {
	try {
		const { teacherId } = req.params;
		const limit = parseInt(req.query.limit as string) || 10;
		
		const sessions = await Session.find({ teacherId: teacherId })
			.sort({ createdAt: -1 })
			.limit(limit)
			.select("code task mode createdAt studentProgress");
		
		const sessionData = sessions.map(session => ({
			code: session.code,
			task: session.task,
			mode: session.mode,
			createdAt: session.createdAt,
			studentCount: session.studentProgress?.length || 0,
		}));
		
		res.json({ sessions: sessionData });
	} catch (error) {
		Logger.error("Error fetching session history", error);
		res.status(500).json({ error: "Failed to fetch session history" });
	}
});

export default router;
