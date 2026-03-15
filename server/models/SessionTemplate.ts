import mongoose, { Schema, Document } from "mongoose";

export interface ISessionSettings {
	timeLimit?: number;
	pointsMultiplier: number;
	allowLateSubmissions: boolean;
}

export interface ISessionTemplate extends Document {
	teacherId: mongoose.Types.ObjectId;
	name: string;
	tasks: mongoose.Types.ObjectId[];
	mode: "game" | "teaching";
	settings: ISessionSettings;
	createdAt: Date;
	updatedAt: Date;
}

const sessionSettingsSchema = new Schema<ISessionSettings>({
	timeLimit: {
		type: Number,
		min: 0,
		default: 300, // realistically no default is needed cuz there shouldn't be a task without timelimit
	},
	pointsMultiplier: {
		type: Number,
		min: 1,
		max: 5,
		default: 1,
	},
	allowLateSubmissions: {
		type: Boolean,
		default: true,
	},
});

const sessionTemplateSchema = new Schema<ISessionTemplate>(
	{
		teacherId: {
			type: Schema.Types.ObjectId,
			ref: "Teachers",
			required: true,
		},
		name: {
			type: String,
			required: true,
			trim: true,
		},
		tasks: {
			type: [Schema.Types.ObjectId],
			ref: "Task",
			required: true,
			validate: {
				validator: function (v: mongoose.Types.ObjectId[]) {
					return v.length > 0;
				},
				message: "At least one task is required in a template",
			},
		},
		mode: {
			type: String,
			enum: ["game", "teaching"],
			required: true,
			default: "teaching",
		},
		settings: {
			type: sessionSettingsSchema,
			required: true,
			default: () => ({}),
		},
	},
	{
		timestamps: true,
	}
);

sessionTemplateSchema.index({ teacherId: 1, createdAt: -1 });

export const SessionTemplate =
	mongoose.models.SessionTemplate ||
	mongoose.model<ISessionTemplate>(
		"SessionTemplate",
		sessionTemplateSchema,
		"SessionTemplates"
	);
