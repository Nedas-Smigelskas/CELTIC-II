import { Router } from "express";
import { Task } from "../../models";
import { Logger } from "../../utils/logger";

const router = Router();

// Create a new task
router.post("/api/tasks", async (req, res) => {
	try {
		const { teacherId, title, description, starterCode, testCases, difficulty, points, timeLimit } = req.body;

		// Log incoming request for debugging
		Logger.info("Task creation request received", { 
			teacherId, 
			title, 
			testCasesCount: testCases?.length,
			difficulty,
			points,
			timeLimit
		});

		if (!teacherId || !title || !description || !testCases || testCases.length === 0) {
			return res.status(400).json({ 
				error: "Missing required fields",
				required: ["teacherId", "title", "description", "testCases (at least 1)"]
			});
		}

		const newTask = new Task({
			teacherId,
			title,
			description,
			starterCode: starterCode || "# Write your code here\n",
			testCases,
			difficulty: difficulty || "medium",
			points: points || 100,
			timeLimit: timeLimit || 300, // Default 5 minutes
		});

		await newTask.save();
		Logger.info("Task created successfully", { taskId: newTask._id, title });
		res.status(201).json({ success: true, task: newTask });
	} catch (error: any) {
		Logger.error("Error creating task", { 
			error, 
			message: error.message,
			stack: error.stack,
			validationErrors: error.errors,
			requestBody: req.body
		});
		res.status(500).json({ 
			error: "Failed to create task", 
			details: error.message,
			validationErrors: error.errors 
		});
	}
});

// Get all tasks for a teacher
router.get("/api/tasks/teacher/:teacherId", async (req, res) => {
	try {
		const tasks = await Task.find({ teacherId: req.params.teacherId })
			.sort({ createdAt: -1 });
		
		res.json({ success: true, tasks });
	} catch (error: any) {
		Logger.error("Error fetching tasks", error);
		res.status(500).json({ error: "Failed to fetch tasks", details: error.message });
	}
});

// Get a specific task
router.get("/api/tasks/:taskId", async (req, res) => {
	try {
		const task = await Task.findById(req.params.taskId);
		
		if (!task) {
			return res.status(404).json({ error: "Task not found" });
		}

		res.json({ success: true, task });
	} catch (error: any) {
		Logger.error("Error fetching task", error);
		res.status(500).json({ error: "Failed to fetch task", details: error.message });
	}
});

// Update a task
router.put("/api/tasks/:taskId", async (req, res) => {
	try {
		const { title, description, starterCode, testCases, difficulty, points, timeLimit } = req.body;

		const task = await Task.findById(req.params.taskId);
		
		if (!task) {
			return res.status(404).json({ error: "Task not found" });
		}

		// Update fields if provided
		if (title !== undefined) task.title = title;
		if (description !== undefined) task.description = description;
		if (starterCode !== undefined) task.starterCode = starterCode;
		if (testCases !== undefined) task.testCases = testCases;
		if (difficulty !== undefined) task.difficulty = difficulty;
		if (points !== undefined) task.points = points;
		if (timeLimit !== undefined) task.timeLimit = timeLimit;

		await task.save();
		Logger.info("Task updated successfully", { taskId: task._id });
		res.json({ success: true, task });
	} catch (error: any) {
		Logger.error("Error updating task", error);
		res.status(500).json({ error: "Failed to update task", details: error.message });
	}
});

// Delete a task
router.delete("/api/tasks/:taskId", async (req, res) => {
	try {
		const task = await Task.findByIdAndDelete(req.params.taskId);
		
		if (!task) {
			return res.status(404).json({ error: "Task not found" });
		}

		Logger.info("Task deleted successfully", { taskId: req.params.taskId });
		res.json({ success: true, message: "Task deleted successfully" });
	} catch (error: any) {
		Logger.error("Error deleting task", error);
		res.status(500).json({ error: "Failed to delete task", details: error.message });
	}
});

export default router;
