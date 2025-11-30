import mongoose from "mongoose";
import dotenv from "dotenv";
import { Logger } from '../utils/logger';

dotenv.config();

const uri = process.env.MONGODB_URI || "";

export const connectDB = async () => {
  if (!uri) {
    Logger.warn('MONGODB_URI not set. Skipping MongoDB connection.');
    return;
  }

  try {
    await mongoose.connect(uri);
    Logger.info('Connected to MongoDB Atlas');
  } catch (error) {
    Logger.error('Error connecting to MongoDB', error);
    throw error;
  }
};

export default connectDB;
