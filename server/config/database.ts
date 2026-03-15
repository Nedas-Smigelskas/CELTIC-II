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
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000, // Timeout after 5s
    });
    Logger.info('Connected to MongoDB successfully');
  } catch (error) {
    Logger.error('Error connecting to MongoDB', error);
    Logger.warn('Server will continue running without database. Some features may not work.');
  }
};

export default connectDB;
