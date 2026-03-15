import mongoose, { Schema, Document } from "mongoose";

export interface ITeacher extends Document {
	name: string;
	email: string;
	password: string;
	createdAt: Date;
	updatedAt: Date;
}

const teacherSchema = new Schema<ITeacher>(
	{
		name: {
			type: String,
			required: true,
			trim: true,
		},
		email: {
			type: String,
			required: true,
			unique: true,
			lowercase: true,
			trim: true,
		},
		password: {
			type: String,
			required: true,
		},
	},
	{
		timestamps: true,
	}
);

teacherSchema.index({ email: 1 });

export const Teacher =
	mongoose.models.Teachers ||
	mongoose.model<ITeacher>("Teachers", teacherSchema, "Teachers");
