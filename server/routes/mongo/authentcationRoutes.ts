import express from "express";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
require("dotenv").config();

// Read sensitive values from environment for flexibility in different deploys
const router = express.Router();
const secretKey = process.env.JWT_SECRET || "your-secret-key";

const teacherSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
});

const Teacher = mongoose.model("Teachers", teacherSchema, "Teachers");

// Import Session model for verification
const sessionSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  teacherName: { type: String, required: true },
  task: { type: String, required: false, default: '' },
  students: [{ type: String }],
  createdAt: { type: Date, default: Date.now }
});

const SessionModel = mongoose.models.Session || mongoose.model('Session', sessionSchema, 'Sessions');

// Teacher Registration
router.post("/api/teacher-register", async (req, res) => {
  const { name, email, password } = req.body;

  console.log('Registration attempt:', { name, email, hasPassword: !!password });

  try {
    const existingTeacher = await Teacher.findOne({ email });

    if (existingTeacher) {
      console.log('Email already exists:', email);
      return res.status(400).json({ message: "Email already registered" });
    }

    const newTeacher = new Teacher({ name, email, password });
    await newTeacher.save();
    console.log('Teacher registered successfully:', email);
    res.status(201).json({ message: "Teacher registered successfully" });
  } catch (error) {
    console.error("Error registering teacher:", error);
    res.status(500).json({ message: "Internal server error", error: String(error) });
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
    const session = await SessionModel.findOne({ code: sessionCode });
    
    if (!session) {
      return res.status(404).json({ message: "Session not found" });
    }

    res.status(200).json({ 
      message: "Session valid",
      session: {
        code: session.code,
        teacherName: session.teacherName,
        task: session.task
      }
    });
  } catch (error) {
    console.error("Error verifying session:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/api/validateToken", (req, res) => {
  const token = req.body.token; // Ensure youre sending the token in the body in your client-side request

  if (!token) {
    console.log("No token provided");
    return res.status(401).send({ message: "No token provided" });
  }

  jwt.verify(token, secretKey, (error: unknown) => {
    if (error) {
      console.log("Token is invalid");
      return res.status(403).send({ message: "Failed to authenticate token" });
    }

    res.status(200);
  });
});

export default router;
