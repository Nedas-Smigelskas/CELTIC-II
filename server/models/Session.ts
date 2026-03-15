import mongoose, { Schema, Document } from "mongoose";

export interface ICompletedTask {
	taskId: mongoose.Types.ObjectId;
	completedAt: Date;
	timeToComplete: number;
	points: number;
	attempts: number;
	passed: boolean;
}

export interface IStudentProgress {
	studentId: string;
	studentName?: string;
	completedTasks: ICompletedTask[];
	totalPoints: number;
	currentTaskIndex: number;
	joinedAt: Date;
	rank?: number;
}

export interface ISession extends Document {
	code: string;
	teacherName: string;
	teacherId?: mongoose.Types.ObjectId;
	task: string; // may still be needed not sure
	
	// New gamification fields
	mode: "empty" | "game" | "teaching";
	templateId?: mongoose.Types.ObjectId;
	taskList: mongoose.Types.ObjectId[];
	currentTaskIndex: number;
	studentProgress: IStudentProgress[];
	
	students: string[];
	
	// Session controls
	isActive: boolean;
	sessionState: "lobby" | "active" | "ended";
	taskStartedAt?: Date;
	startedAt?: Date;
	endedAt?: Date;
	
	createdAt: Date;
	updatedAt: Date;
}

const completedTaskSchema = new Schema<ICompletedTask>({
	taskId: {
		type: Schema.Types.ObjectId,
		ref: "Task",
		required: true,
	},
	completedAt: {
		type: Date,
		default: Date.now,
	},
	timeToComplete: {
		type: Number,
		required: true,
	},
	points: {
		type: Number,
		required: true,
	},
	attempts: {
		type: Number,
		default: 1,
	},
	passed: {
		type: Boolean,
		default: true,
	},
});

const studentProgressSchema = new Schema<IStudentProgress>({
	studentId: {
		type: String,
		required: true,
	},
	studentName: {
		type: String,
	},
	completedTasks: {
		type: [completedTaskSchema],
		default: [],
	},
	totalPoints: {
		type: Number,
		default: 0,
	},
	currentTaskIndex: {
		type: Number,
		default: 0,
	},
	joinedAt: {
		type: Date,
		default: Date.now,
	},
	rank: {
		type: Number,
	},
});

const sessionSchema = new Schema<ISession>(
	{
		code: {
			type: String,
			required: true,
			unique: true,
			index: true,
		},
		teacherName: {
			type: String,
			required: true,
		},
		teacherId: {
			type: Schema.Types.ObjectId,
			ref: "Teachers",
		},
		task: {
			type: String,
			default: "",
		},
		mode: {
			type: String,
			enum: ["empty", "game", "teaching"],
			default: "empty",
		},
		templateId: {
			type: Schema.Types.ObjectId,
			ref: "SessionTemplate",
		},
		taskList: {
			type: [Schema.Types.ObjectId],
			ref: "Task",
			default: [],
		},
		currentTaskIndex: {
			type: Number,
			default: 0,
		},
		studentProgress: {
			type: [studentProgressSchema],
			default: [],
		},
		students: {
			type: [String],
			default: [],
		},
		isActive: {
			type: Boolean,
			default: true,
		},
		sessionState: {
			type: String,
			enum: ["lobby", "active", "ended"],
			default: "lobby",
		},
		taskStartedAt: {
			type: Date,
		},
		startedAt: {
			type: Date,
		},
		endedAt: {
			type: Date,
		},
	},
	{
		timestamps: true,
	}
);

// index for simple look up
sessionSchema.index({ code: 1 });
sessionSchema.index({ teacherId: 1, createdAt: -1 });
sessionSchema.index({ isActive: 1 });

// Get leaderboard method
sessionSchema.methods.getLeaderboard = function () {
	if (this.mode !== "game") {
		return [];
	}

	const leaderboard = this.studentProgress
		.map((student: IStudentProgress) => ({
			studentId: student.studentId,
			studentName: student.studentName || student.studentId,
			totalPoints: student.totalPoints,
			completedTasks: student.completedTasks.length,
			rank: 0,
		}))
		.sort((a: any, b: any) => b.totalPoints - a.totalPoints);

	// check score and assign ranks
	leaderboard.forEach((student: any, index: number) => {
		student.rank = index + 1;
	});

	return leaderboard;
};

// Calculate score based off when you finish in the game mode
sessionSchema.methods.calculatePoints = function (
	basePoints: number,
	completionOrder: number,
	totalStudents: number
): number {
	if (this.mode !== "game") {
		return basePoints;
	}

	let multiplier = 1.0;
	
	if (completionOrder === 1) {
		multiplier = 1.5;
	} else if (completionOrder === 2) {
		multiplier = 1.25;
	} else if (completionOrder === 3) {
		multiplier = 1.1;
	} else {
		multiplier = 1.0;
	}

	return Math.round(basePoints * multiplier);
};

export const Session =
	mongoose.models.Session ||
	mongoose.model<ISession>("Session", sessionSchema, "Sessions");
