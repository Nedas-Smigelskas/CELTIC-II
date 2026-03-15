import mongoose, { Schema, Document } from "mongoose";

export interface ITestCase {
	input: string;
	expectedOutput: string;
	description: string;
}

export interface ITask extends Document {
	teacherId: mongoose.Types.ObjectId;
	title: string;
	description: string;
	starterCode: string;
	testCases: ITestCase[];
	difficulty: "easy" | "medium" | "hard";
	points: number;
	timeLimit: number;
	createdAt: Date;
	updatedAt: Date;
}

const testCaseSchema = new Schema<ITestCase>({
	input: { type: String, default: "" },
	expectedOutput: { type: String, required: true },
	description: { type: String, required: true },
});

const taskSchema = new Schema<ITask>(
	{
		teacherId: {
			type: Schema.Types.ObjectId,
			ref: "Teachers",
			required: true,
		},
		title: {
			type: String,
			required: true,
			trim: true,
		},
		description: {
			type: String,
			required: true,
		},
		starterCode: {
			type: String,
			default: "# Write your code here\n",
		},
		testCases: {
			type: [testCaseSchema],
			required: true,
			validate: {
				validator: function (v: ITestCase[]) {
					return v.length > 0;
				},
				message: "At least one test case is required",
			},
		},
		difficulty: {
			type: String,
			enum: ["easy", "medium", "hard"],
			default: "medium",
		},
		points: {
			type: Number,
			required: true,
			min: 0,
			default: 100,
		},
		timeLimit: {
			type: Number,
			default: 300,
			min: 30,
		},
	},
	{
		timestamps: true,
	}
);

taskSchema.index({ teacherId: 1, createdAt: -1 });

export const Task =
	mongoose.models.Task || mongoose.model<ITask>("Task", taskSchema, "Tasks");
