import React, { useEffect, useRef, useState } from "react";
import { Dialog } from "primereact/dialog";
import { InputText } from "primereact/inputtext";
import { InputTextarea } from "primereact/inputtextarea";
import { Button } from "primereact/button";
import { Dropdown } from "primereact/dropdown";
import { InputNumber } from "primereact/inputnumber";
import { Toast } from "primereact/toast";
import axios from "axios";
import "./task-builder.css";

interface TestCase {
	input: string;
	expectedOutput: string;
	description: string;
}

export interface TaskBuilderTask {
	_id: string;
	title: string;
	description: string;
	starterCode: string;
	difficulty: "easy" | "medium" | "hard";
	points: number;
	timeLimit: number;
	testCases: TestCase[];
}

type TaskDialogMode = "create" | "edit";

interface TaskBuilderProps {
	visible: boolean;
	onHide: () => void;
	onTaskSaved: () => void;
	teacherId: string;
	mode?: TaskDialogMode;
	initialTask?: TaskBuilderTask | null;
}

export const TaskBuilder: React.FC<TaskBuilderProps> = ({
	visible,
	onHide,
	onTaskSaved,
	teacherId,
	mode = "create",
	initialTask = null,
}) => {
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [starterCode, setStarterCode] = useState("# Write your code here\n");
	const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");
	const [points, setPoints] = useState<number>(100);
	const [timeLimit, setTimeLimit] = useState<number>(300);
	const [testCases, setTestCases] = useState<TestCase[]>([
		{ input: "", expectedOutput: "", description: "Test case 1" },
	]);
	const [loading, setLoading] = useState(false);
	const toast = useRef<Toast>(null);

	const difficultyOptions = [
		{ label: "Easy", value: "easy" },
		{ label: "Medium", value: "medium" },
		{ label: "Hard", value: "hard" },
	];

	const defaultTestCase = () => ({
		input: "",
		expectedOutput: "",
		description: "Test case 1",
	});

	const showToast = (
		severity: "success" | "info" | "warn" | "error",
		summary: string,
		detail: string
	) => {
		toast.current?.show({ severity, summary, detail });
	};

	const resetForm = () => {
		setTitle("");
		setDescription("");
		setStarterCode("# Write your code here\n");
		setDifficulty("medium");
		setPoints(100);
		setTimeLimit(300);
		setTestCases([defaultTestCase()]);
	};

	useEffect(() => {
		if (!visible) {
			return;
		}

		if (mode === "edit" && initialTask) {
			setTitle(initialTask.title);
			setDescription(initialTask.description);
			setStarterCode(initialTask.starterCode || "# Write your code here\n");
			setDifficulty(initialTask.difficulty || "medium");
			setPoints(initialTask.points ?? 100);
			setTimeLimit(initialTask.timeLimit ?? 300);
			setTestCases(
				initialTask.testCases?.length
					? initialTask.testCases.map((testCase) => ({ ...testCase }))
					: [defaultTestCase()]
			);
			return;
		}

		resetForm();
	}, [visible, mode, initialTask]);

	const closeDialog = () => {
		resetForm();
		onHide();
	};

	const addTestCase = () => {
		setTestCases([
			...testCases,
			{
				input: "",
				expectedOutput: "",
				description: `Test case ${testCases.length + 1}`,
			},
		]);
	};

	const removeTestCase = (index: number) => {
		if (testCases.length > 1) {
			setTestCases(testCases.filter((_, i) => i !== index));
		} else {
			showToast("warn", "Cannot Remove", "At least one test case is required");
		}
	};

	const updateTestCase = (index: number, field: keyof TestCase, value: string) => {
		const updated = [...testCases];
		updated[index][field] = value;
		setTestCases(updated);
	};

	const handleSaveTask = async () => {
		// Validation for task
		if (!title.trim()) {
			showToast("error", "Validation Error", "Task title is required");
			return;
		}
		if (!description.trim()) {
			showToast("error", "Validation Error", "Task description is required");
			return;
		}
		if (testCases.some((tc) => !tc.expectedOutput.trim())) {
			showToast("error", "Validation Error", "All test cases must have expected output");
			return;
		}

		setLoading(true);
		try {
			const preparedTestCases = testCases.map((testCase) => ({
				input: testCase.input || "",
				expectedOutput: testCase.expectedOutput,
				description: testCase.description,
			}));

			const taskData = {
				title: title.trim(),
				description: description.trim(),
				starterCode,
				testCases: preparedTestCases,
				difficulty,
				points,
				timeLimit,
			};

			if (mode === "edit" && initialTask?._id) {
				await axios.put(
					`http://localhost:8000/api/tasks/${initialTask._id}`,
					taskData
				);
				showToast("success", "Success", "Task updated successfully");
			} else {
				await axios.post("http://localhost:8000/api/tasks", {
					teacherId,
					...taskData,
				});
				showToast("success", "Success", "Task created successfully");
			}

			onTaskSaved();
			closeDialog();
		} catch (error: any) {
			console.error("Error saving task:", error);
			console.error("Error response:", error.response?.data);
			showToast(
				"error",
				"Error",
				error.response?.data?.details || error.response?.data?.error || "Failed to save task"
			);
		} finally {
			setLoading(false);
		}
	};

	const footer = (
		<div>
			<Button
				label="Cancel"
				icon="pi pi-times"
				onClick={() => {
					closeDialog();
				}}
				className="p-button-text"
			/>
			<Button
				label={mode === "edit" ? "Save Changes" : "Create Task"}
				icon="pi pi-check"
				onClick={handleSaveTask}
				loading={loading}
				autoFocus
			/>
		</div>
	);

	return (
		<>
			<Toast ref={toast} />
			<Dialog
				header={mode === "edit" ? "Edit Task" : "Create New Task"}
				visible={visible}
				style={{ width: "700px" }}
				onHide={closeDialog}
				footer={footer}
				modal
			>
				<div className="task-builder-form">
					<div className="field">
						<label htmlFor="title">Task Title *</label>
						<InputText
							id="title"
							value={title}
							onChange={(e) => setTitle(e.target.value)}
							placeholder="e.g., Code FizzBuzz"
							className="w-full"
						/>
					</div>

					<div className="field">
						<label htmlFor="description">Description *</label>
						<InputTextarea
							id="description"
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							placeholder="Explain what students need to do..."
							rows={4}
							className="w-full"
						/>
					</div>

					<div className="field">
						<label htmlFor="starterCode">Starter Code (Optional)</label>
						<InputTextarea
							id="starterCode"
							value={starterCode}
							onChange={(e) => setStarterCode(e.target.value)}
							rows={3}
							className="w-full"
							style={{ fontFamily: "monospace" }}
						/>
					</div>

					<div className="field-group">
						<div className="field">
							<label htmlFor="difficulty">Difficulty</label>
							<Dropdown
								id="difficulty"
								value={difficulty}
								options={difficultyOptions}
								onChange={(e) => setDifficulty(e.value)}
								className="w-full"
							/>
						</div>

						<div className="field">
							<label htmlFor="points">Base Points</label>
							<InputNumber
								id="points"
								value={points}
								onValueChange={(e) => setPoints(e.value || 100)}
								min={0}
								className="w-full"
							/>
						</div>

						<div className="field">
							<label htmlFor="timeLimit">Time Limit (seconds)</label>
							<InputNumber
								id="timeLimit"
								value={timeLimit}
								onValueChange={(e) => setTimeLimit(e.value || 300)}
								min={30}
								max={3600}
								className="w-full"
							/>
						</div>
					</div>

					<div className="test-cases-section">
						<div className="test-cases-header">
							<label>Test Cases *</label>
							<Button
								label="Add Test Case"
								icon="pi pi-plus"
								onClick={addTestCase}
								className="p-button-sm p-button-outlined"
							/>
						</div>

						{testCases.map((testCase, index) => (
							<div key={index} className="test-case-card">
								<div className="test-case-header">
									<InputText
										value={testCase.description}
										onChange={(e) =>
											updateTestCase(index, "description", e.target.value)
										}
										placeholder="Test case description"
										className="test-case-title"
									/>
									{testCases.length > 1 && (
										<Button
											icon="pi pi-trash"
											className="p-button-rounded p-button-text p-button-danger"
											onClick={() => removeTestCase(index)}
										/>
									)}
								</div>

								<div className="field">
									<label>Input (stdin)</label>
									<InputTextarea
										value={testCase.input}
										onChange={(e) => updateTestCase(index, "input", e.target.value)}
										placeholder="Input data for this test (leave empty if none)"
										rows={2}
										className="w-full"
									/>
								</div>

								<div className="field">
									<label>Expected Output *</label>
									<InputTextarea
										value={testCase.expectedOutput}
										onChange={(e) =>
											updateTestCase(index, "expectedOutput", e.target.value)
										}
										placeholder="What the program should output"
										rows={2}
										className="w-full"
									/>
								</div>
							</div>
						))}
					</div>
				</div>
			</Dialog>
		</>
	);
};
