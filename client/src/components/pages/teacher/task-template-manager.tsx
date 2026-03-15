import React, { useState, useEffect, useRef } from "react";
import { Dialog } from "primereact/dialog";
import { DataTable } from "primereact/datatable";
import { Column } from "primereact/column";
import { Button } from "primereact/button";
import { TabView, TabPanel } from "primereact/tabview";
import { InputText } from "primereact/inputtext";
import { Dropdown } from "primereact/dropdown";
import { MultiSelect } from "primereact/multiselect";
import { Toast } from "primereact/toast";
import { Chip } from "primereact/chip";
import axios from "axios";
import { TaskBuilder, type TaskBuilderTask } from "./task-builder";
import "./task-template-manager.css";

interface Task extends TaskBuilderTask {}

interface Template {
	_id: string;
	name: string;
	mode: string;
	tasks: Task[];
	createdAt: string;
}

type TemplateMode = "game" | "teaching";
type TemplateDialogMode = "create" | "edit";
type TaskDialogMode = "create" | "edit";

interface TaskTemplateManagerProps {
	visible: boolean;
	onHide: () => void;
	teacherId: string;
	onTasksUpdated: () => void;
}

export const TaskTemplateManager: React.FC<TaskTemplateManagerProps> = ({
	visible,
	onHide,
	teacherId,
	onTasksUpdated,
}) => {
	const [tasks, setTasks] = useState<Task[]>([]);
	const [templates, setTemplates] = useState<Template[]>([]);
	const [loading, setLoading] = useState(false);
	const [showTaskDialog, setShowTaskDialog] = useState(false);
	const [taskDialogMode, setTaskDialogMode] = useState<TaskDialogMode>("create");
	const [editingTask, setEditingTask] = useState<Task | null>(null);
	const [showTemplateDialog, setShowTemplateDialog] = useState(false);
	const [templateDialogMode, setTemplateDialogMode] =
		useState<TemplateDialogMode>("create");
	const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
	const [templateName, setTemplateName] = useState("");
	const [templateMode, setTemplateMode] = useState<TemplateMode>("teaching");
	const [selectedTasks, setSelectedTasks] = useState<string[]>([]);

	const toast = useRef<Toast>(null);

	const modeOptions = [
		{ label: "Teaching Mode - Self-paced learning", value: "teaching" },
		{ label: "Game Mode - Competitive racing", value: "game" },
	];

	const showToast = (
		severity: "success" | "info" | "warn" | "error",
		summary: string,
		detail: string
	) => {
		toast.current?.show({ severity, summary, detail });
	};

	const loadTasks = async () => {
		try {
			const response = await axios.get(
				`http://localhost:8000/api/tasks/teacher/${teacherId}`
			);
			setTasks(response.data.tasks);
		} catch (error) {
			console.error("Error loading tasks:", error);
		}
	};

	const loadTemplates = async () => {
		try {
			const response = await axios.get(
				`http://localhost:8000/api/templates/teacher/${teacherId}`
			);
			setTemplates(response.data.templates);
		} catch (error) {
			console.error("Error loading templates:", error);
		}
	};

	useEffect(() => {
		if (visible) {
			loadTasks();
			loadTemplates();
		}
	}, [visible, teacherId]);

	const resetTemplateForm = () => {
		setTemplateDialogMode("create");
		setEditingTemplateId(null);
		setTemplateName("");
		setSelectedTasks([]);
		setTemplateMode("teaching");
	};

	const closeTemplateDialog = () => {
		setShowTemplateDialog(false);
		resetTemplateForm();
	};

	const openCreateTemplateDialog = () => {
		resetTemplateForm();
		setShowTemplateDialog(true);
	};

	const closeTaskDialog = () => {
		setShowTaskDialog(false);
		setTaskDialogMode("create");
		setEditingTask(null);
	};

	const openCreateTaskDialog = () => {
		setTaskDialogMode("create");
		setEditingTask(null);
		setShowTaskDialog(true);
	};

	const openEditTaskDialog = (task: Task) => {
		setTaskDialogMode("edit");
		setEditingTask(task);
		setShowTaskDialog(true);
	};

	const openEditTemplateDialog = (template: Template) => {
		setTemplateDialogMode("edit");
		setEditingTemplateId(template._id);
		setTemplateName(template.name);
		setTemplateMode(template.mode === "game" ? "game" : "teaching");
		setSelectedTasks(template.tasks?.map((task) => task._id) || []);
		setShowTemplateDialog(true);
	};

	const getTemplatePayload = () => ({
		name: templateName.trim(),
		tasks: selectedTasks,
		mode: templateMode,
		settings: {
			...(templateMode === "game" ? { timeLimit: 300 } : {}),
			pointsMultiplier: 1,
			allowLateSubmissions: templateMode === "teaching",
		},
	});

	const deleteTask = async (taskId: string) => {
		if (!window.confirm("Are you sure you want to delete this task?")) {
			return;
		}

		try {
			await axios.delete(`http://localhost:8000/api/tasks/${taskId}`);
			showToast("success", "Success", "Task deleted successfully");
			loadTasks();
			onTasksUpdated();
		} catch (error: any) {
			showToast("error", "Error", "Failed to delete task");
		}
	};

	const deleteTemplate = async (templateId: string) => {
		if (!window.confirm("Are you sure you want to delete this template?")) {
			return;
		}

		try {
			await axios.delete(`http://localhost:8000/api/templates/${templateId}`);
			showToast("success", "Success", "Template deleted successfully");
			loadTemplates();
		} catch (error: any) {
			showToast("error", "Error", "Failed to delete template");
		}
	};

	const saveTemplate = async () => {
		if (!templateName.trim()) {
			showToast("error", "Validation Error", "Template name is required");
			return;
		}
		if (selectedTasks.length === 0) {
			showToast("error", "Validation Error", "Select at least one task");
			return;
		}

		setLoading(true);
		try {
			const payload = getTemplatePayload();

			if (templateDialogMode === "edit" && editingTemplateId) {
				await axios.put(
					`http://localhost:8000/api/templates/${editingTemplateId}`,
					payload
				);
				showToast("success", "Success", "Template updated successfully");
			} else {
				await axios.post("http://localhost:8000/api/templates", {
					teacherId,
					...payload,
				});
				showToast("success", "Success", "Template created successfully");
			}

			closeTemplateDialog();
			loadTemplates();
		} catch (error: any) {
			console.error("Error saving template:", error);
			showToast(
				"error",
				"Error",
				error.response?.data?.error || "Failed to save template"
			);
		} finally {
			setLoading(false);
		}
	};

	const handleTaskSaved = () => {
		closeTaskDialog();
		loadTasks();
		loadTemplates();
		onTasksUpdated();
	};

	// convert difficulty of task to react Chip for style
	const difficultyTemplate = (rowData: Task) => {
		const severity =
			rowData.difficulty === "easy"
				? "success"
				: rowData.difficulty === "medium"
				? "warning"
				: "danger";
		return <Chip label={rowData.difficulty} className={`p-chip-${severity}`} />;
	};

	const actionsTemplate = (rowData: Task) => {
		return (
			<div className="action-buttons">
				<Button
					icon="pi pi-pencil"
					className="p-button-rounded p-button-text"
					onClick={() => openEditTaskDialog(rowData)}
				/>
				<Button
					icon="pi pi-trash"
					className="p-button-rounded p-button-text p-button-danger"
					onClick={() => deleteTask(rowData._id)}
				/>
			</div>
		);
	};

	const templateActionsTemplate = (rowData: Template) => {
		return (
			<div className="action-buttons">
				<Button
					icon="pi pi-pencil"
					className="p-button-rounded p-button-text"
					onClick={() => openEditTemplateDialog(rowData)}
				/>
				<Button
					icon="pi pi-trash"
					className="p-button-rounded p-button-text p-button-danger"
					onClick={() => deleteTemplate(rowData._id)}
				/>
			</div>
		);
	};

	const modeTemplate = (rowData: Template) => {
		return (
			<Chip
				label={rowData.mode === "game" ? "Game Mode" : "Teaching Mode"}
				className={rowData.mode === "game" ? "p-chip-info" : "p-chip-success"}
			/>
		);
	};

	const tasksCountTemplate = (rowData: Template) => {
		return <span>{rowData.tasks?.length || 0} tasks</span>;
	};

	const templateDialogFooter = (
		<div>
			<Button
				label="Cancel"
				icon="pi pi-times"
				onClick={closeTemplateDialog}
				className="p-button-text"
			/>
			<Button
				label={templateDialogMode === "edit" ? "Save Changes" : "Create Template"}
				icon="pi pi-check"
				onClick={saveTemplate}
				loading={loading}
			/>
		</div>
	);

	return (
		<>
			<Toast ref={toast} />
			<Dialog
				header="Task & Template Manager"
				visible={visible}
				style={{ width: "900px", maxHeight: "80vh" }}
				onHide={() => {
					closeTaskDialog();
					closeTemplateDialog();
					onHide();
				}}
				modal
			>
				<TabView>
					<TabPanel header="My Tasks">
						<div className="manager-panel">
							<div className="panel-header">
								<p className="panel-description">
									Manage your programming tasks. Create tasks with test cases that
									students will complete.
								</p>
								<Button
									label="New Task"
									icon="pi pi-plus"
									onClick={openCreateTaskDialog}
								/>
							</div>
							<DataTable
								value={tasks}
								paginator
								rows={5}
								emptyMessage="No tasks created yet. Create your first task!"
								className="task-table"
							>
								<Column field="title" header="Title" style={{ width: "30%" }} />
								<Column
									field="description"
									header="Description"
									style={{ width: "35%" }}
									body={(rowData) => (
										<span className="description-text">
											{rowData.description.substring(0, 60)}
											{rowData.description.length > 60 ? "..." : ""}
										</span>
									)}
								/>
								<Column
									field="difficulty"
									header="Difficulty"
									body={difficultyTemplate}
									style={{ width: "15%" }}
								/>
								<Column
									field="points"
									header="Points"
									style={{ width: "10%" }}
								/>
								<Column
									header="Actions"
									body={actionsTemplate}
									style={{ width: "10%" }}
								/>
							</DataTable>
						</div>
					</TabPanel>

					<TabPanel header="Session Templates">
						<div className="manager-panel">
							<div className="panel-header">
								<p className="panel-description">
									Create reusable session templates with multiple tasks.
								</p>
								<Button
									label="New Template"
									icon="pi pi-plus"
									onClick={openCreateTemplateDialog}
									disabled={tasks.length === 0}
								/>
							</div>
							{tasks.length === 0 && (
								<div className="info-message">
									Create some tasks first before making templates.
								</div>
							)}
							<DataTable
								value={templates}
								paginator
								rows={5}
								emptyMessage="No templates created yet."
								className="template-table"
							>
								<Column field="name" header="Template Name" style={{ width: "35%" }} />
								<Column
									header="Mode"
									body={modeTemplate}
									style={{ width: "20%" }}
								/>
								<Column
									header="Tasks"
									body={tasksCountTemplate}
									style={{ width: "15%" }}
								/>
								<Column
									field="createdAt"
									header="Created"
									style={{ width: "20%" }}
									body={(rowData) =>
										new Date(rowData.createdAt).toLocaleDateString()
									}
								/>
								<Column
									header="Actions"
									body={templateActionsTemplate}
									style={{ width: "15%" }}
								/>
							</DataTable>
						</div>
					</TabPanel>
				</TabView>
			</Dialog>

			<Dialog
				header={
					templateDialogMode === "edit"
						? "Edit Session Template"
						: "Create Session Template"
				}
				visible={showTemplateDialog}
				style={{ width: "600px" }}
				onHide={closeTemplateDialog}
				footer={templateDialogFooter}
				modal
			>
				<div className="template-form">
					<div className="field">
						<label htmlFor="templateName">Template Name *</label>
						<InputText
							id="templateName"
							value={templateName}
							onChange={(e) => setTemplateName(e.target.value)}
							placeholder="e.g., Python Basics - Week 1"
							className="w-full"
						/>
					</div>

					<div className="field">
						<label htmlFor="mode">Session Mode *</label>
						<Dropdown
							id="mode"
							value={templateMode}
							options={modeOptions}
							onChange={(e) => setTemplateMode(e.value)}
							className="w-full"
						/>
						<small className="field-hint">
							{templateMode === "game"
								? "Students compete for speed. Points awarded based on completion order."
								: "Students work at their own pace."}
						</small>
					</div>

					<div className="field">
						<label htmlFor="tasks">Select Tasks *</label>
						<MultiSelect
							id="tasks"
							value={selectedTasks}
							options={tasks.map((t) => ({
								label: `${t.title} (${t.points} pts)`,
								value: t._id,
							}))}
							onChange={(e) => setSelectedTasks(e.value)}
							placeholder="Choose tasks for this template"
							className="w-full"
							display="chip"
						/>
						<small className="field-hint">
							Tasks will be presented in the order selected
						</small>
					</div>
				</div>
			</Dialog>

			<TaskBuilder
				visible={showTaskDialog}
				onHide={closeTaskDialog}
				onTaskSaved={handleTaskSaved}
				teacherId={teacherId}
				mode={taskDialogMode}
				initialTask={editingTask}
			/>
		</>
	);
};
