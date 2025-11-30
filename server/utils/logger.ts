export class Logger {
	private static formatMessage(
		level: string,
		message: string,
		meta?: any
	): string {
		const timestamp = new Date().toISOString();
		const metaStr = meta ? ` | ${JSON.stringify(meta)}` : "";
		return `[${timestamp}] [${level}] ${message}${metaStr}`;
	}

	static info(message: string, meta?: any): void {
		console.log(this.formatMessage("INFO", message, meta));
	}

	static error(message: string, error?: any): void {
		const errorDetails =
			error instanceof Error
				? { message: error.message, stack: error.stack }
				: error;
		console.error(this.formatMessage("ERROR", message, errorDetails));
	}

	static warn(message: string, meta?: any): void {
		console.warn(this.formatMessage("WARN", message, meta));
	}

	static debug(message: string, meta?: any): void {
		if (process.env.NODE_ENV !== "production") {
			console.log(this.formatMessage("DEBUG", message, meta));
		}
	}
}
