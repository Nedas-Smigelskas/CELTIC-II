import express from "express";
import jwt from "jsonwebtoken";
import { Teacher, Session } from "../../models";
require("dotenv").config();

// Read sensitive values from environment for flexibility in different deploys
const router = express.Router();
const secretKey = process.env.JWT_SECRET || "your-secret-key";

// Teacher Registration
router.post("/api/teacher-register", async (req, res) => {
	const { name, email, password } = req.body;

	try {
		const existingTeacher = await Teacher.findOne({ email });

		if (existingTeacher) {
			return res
				.status(400)
				.json({ message: "Email already registered" });
		}

		const newTeacher = new Teacher({ name, email, password });
		await newTeacher.save();
		res.status(201).json({ message: "Teacher registered successfully" });
	} catch (error) {
		console.error("Error registering teacher:", error);
		res.status(500).json({
			message: "Internal server error",
			error: String(error),
		});
	}
});

// Teacher Login
router.post("/api/teacher-login", async (req, res) => {
	const { email, password } = req.body;

	try {
		const teacher = await Teacher.findOne({ email, password });

		if (!teacher) {
			return res.status(401).json({ message: "Invalid credentials" });
		}

		const user_id = { id: teacher._id };
		const accessToken = jwt.sign(user_id, secretKey, { expiresIn: "1h" });

		res.status(200).json({
			message: "Authentication successful",
			user: {
				name: teacher.name,
				email: teacher.email,
			},
			accessToken: accessToken,
		});
	} catch (error) {
		console.error("Error authenticating teacher:", error);
		res.status(500).json({ message: "Internal server error" });
	}
});

// Verify Session Code
router.post("/api/verify-session", async (req, res) => {
	const { sessionCode } = req.body;

	try {
		if (!sessionCode || sessionCode.length < 4) {
			return res.status(400).json({ message: "Invalid session code" });
		}

		// Check if session actually exists in database
		const session = await Session.findOne({ code: sessionCode });

		if (!session) {
			return res.status(404).json({ message: "Session not found" });
		}

		res.status(200).json({
			message: "Session valid",
			session: {
				code: session.code,
				teacherName: session.teacherName,
				task: session.task,
			},
		});
	} catch (error) {
		console.error("Error verifying session:", error);
		res.status(500).json({ message: "Internal server error" });
	}
});

router.post("/api/validateToken", (req, res) => {
	const token = req.body.token; // Ensure youre sending the token in the body in your client-side request

	if (!token) {
		return res.status(401).send({ message: "No token provided" });
	}

	jwt.verify(token, secretKey, (error: unknown) => {
		if (error) {
			return res
				.status(403)
				.send({ message: "Failed to authenticate token" });
		}

		res.status(200);
	});
});

export default router;
