import { Router } from "express";
import { SessionTemplate, Task } from "../../models";
import { Logger } from "../../utils/logger";

const router = Router();

// Create a new session template
router.post("/api/templates", async (req, res) => {
	try {
		const { teacherId, name, tasks, mode, settings } = req.body;

		if (!teacherId || !name || !tasks || tasks.length === 0 || !mode) {
			return res.status(400).json({
				error: "Missing required fields",
				required: ["teacherId", "name", "tasks (at least 1)", "mode"]
			});
		}

		// Verify all tasks exist
		const taskDocs = await Task.find({ _id: { $in: tasks } });
		if (taskDocs.length !== tasks.length) {
			return res.status(400).json({ error: "One or more tasks not found" });
		}

		const newTemplate = new SessionTemplate({
			teacherId,
			name,
			tasks,
			mode,
			settings: settings || {},
		});

		await newTemplate.save();
		Logger.info("Template created successfully", { templateId: newTemplate._id, name });
		res.status(201).json({ success: true, template: newTemplate });
	} catch (error: any) {
		Logger.error("Error creating template", error);
		res.status(500).json({ error: "Failed to create template", details: error.message });
	}
});

// Get all templates for a teacher
router.get("/api/templates/teacher/:teacherId", async (req, res) => {
	try {
		const templates = await SessionTemplate.find({ teacherId: req.params.teacherId })
			.populate("tasks")
			.sort({ createdAt: -1 });
		
		res.json({ success: true, templates });
	} catch (error: any) {
		Logger.error("Error fetching templates", error);
		res.status(500).json({ error: "Failed to fetch templates", details: error.message });
	}
});

// Get a specific template with full task details
router.get("/api/templates/:templateId", async (req, res) => {
	try {
		const template = await SessionTemplate.findById(req.params.templateId)
			.populate("tasks");
		
		if (!template) {
			return res.status(404).json({ error: "Template not found" });
		}

		res.json({ success: true, template });
	} catch (error: any) {
		Logger.error("Error fetching template", error);
		res.status(500).json({ error: "Failed to fetch template", details: error.message });
	}
});

// Update a template
router.put("/api/templates/:templateId", async (req, res) => {
	try {
		const { name, tasks, mode, settings } = req.body;

		const template = await SessionTemplate.findById(req.params.templateId);
		
		if (!template) {
			return res.status(404).json({ error: "Template not found" });
		}

		if (name !== undefined) {
			const trimmedName = String(name).trim();
			if (!trimmedName) {
				return res.status(400).json({ error: "Template name is required" });
			}
			template.name = trimmedName;
		}

		if (tasks !== undefined) {
			if (!Array.isArray(tasks) || tasks.length === 0) {
				return res.status(400).json({ error: "At least one task is required" });
			}

			const taskDocs = await Task.find({ _id: { $in: tasks } });
			if (taskDocs.length !== tasks.length) {
				return res.status(400).json({ error: "One or more tasks not found" });
			}
			template.tasks = tasks;
		}

		if (mode !== undefined) template.mode = mode;
		if (settings !== undefined) template.settings = settings;

		await template.save();
		Logger.info("Template updated successfully", { templateId: template._id });
		res.json({ success: true, template });
	} catch (error: any) {
		Logger.error("Error updating template", error);
		res.status(500).json({ error: "Failed to update template", details: error.message });
	}
});

// Delete a template
router.delete("/api/templates/:templateId", async (req, res) => {
	try {
		const template = await SessionTemplate.findByIdAndDelete(req.params.templateId);
		
		if (!template) {
			return res.status(404).json({ error: "Template not found" });
		}

		Logger.info("Template deleted successfully", { templateId: req.params.templateId });
		res.json({ success: true, message: "Template deleted successfully" });
	} catch (error: any) {
		Logger.error("Error deleting template", error);
		res.status(500).json({ error: "Failed to delete template", details: error.message });
	}
});

export default router;
