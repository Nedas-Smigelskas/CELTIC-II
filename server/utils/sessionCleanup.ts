import { Session } from "../models";
import { Logger } from "./logger";

/**
 * Clean up sessions older than 24 hours
 */
export async function cleanupOldSessions(): Promise<number> {
	try {
		const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
		const result = await Session.deleteMany({
			createdAt: { $lt: twentyFourHoursAgo }
		});
		
		if (result.deletedCount > 0) {
			Logger.info(`Cleaned up ${result.deletedCount} old sessions (>24 hours)`);
		}
		
		return result.deletedCount;
	} catch (error) {
		Logger.error("Error cleaning up old sessions", error);
		return 0;
	}
}

/**
 * While the server runs it checks for any session that have lasted
 * over 24 hours and clears them as to prevent ghost sessions existing
 * Runs every hour currently
 */
export function startPeriodicCleanup(): void {
	// Run immediately on startup
	cleanupOldSessions();
	
	// Run every hour
	const ONE_HOUR = 60 * 60 * 1000;
	setInterval(() => {
		cleanupOldSessions();
	}, ONE_HOUR);
	
	Logger.info("Session cleaning started");
}
