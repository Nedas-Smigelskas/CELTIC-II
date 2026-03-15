import express from "express";
import Docker from "dockerode";
import { PassThrough } from "stream";
import { Logger } from "../../utils/logger";

const router = express.Router();
const docker = new Docker();

// Function to cleanup containers
const cleanupContainer = async (containerId: string) => {
	try {
		const container = docker.getContainer(containerId);
		try {
			await container.stop();
		} catch (err) {
			// Container might already be stopped
		}
		await container.remove();
		Logger.info("Container cleaned up", { containerId });
	} catch (err) {
		Logger.error("Error cleaning up container", { containerId, error: err });
	}
};

router.get("/api/containers", async (req, res) => {
	try {
		docker.listContainers({ all: true }, (err, containers) => {
			if (err) {
				console.error("Error listing containers:", err);
				res.status(500).json({ error: "Internal server error" });
				return;
			}

			res.json(containers);
		});
	} catch (error) {
		console.error("Error retrieving containers:", error);
		res.status(500).json({ error: "Internal server error" });
	}
});

router.post("/api/containers", async (req, res) => {
	try {
		// First try to pull the Python image
		try {
			await new Promise((resolve, reject) => {
				docker.pull("python:3.9", (err: any, stream: any) => {
					if (err) {
						reject(err);
						return;
					}

					docker.modem.followProgress(
						stream,
						(err: any, output: any) => {
							if (err) {
								reject(err);
								return;
							}
							resolve(output);
						}
					);
				});
			});
		} catch (pullError) {
			console.error("Error pulling Python image:", pullError);
			// Continue anyway as the image might already exist
		}

		// Create the container
		const container = await docker.createContainer({
			Image: "python:3.9",
			AttachStdin: false,
			AttachStdout: true,
			AttachStderr: true,
			Tty: true,
			OpenStdin: false,
			StdinOnce: false,
			Cmd: ["python", "-c", "while True: pass"],
			HostConfig: {
				AutoRemove: true, // Container will be automatically removed when stopped
			},
		});

		await container.start();

		const containerInfo = await container.inspect();

		// Store container ID in response
		res.json({
			message: "Container created and started successfully",
			containerId: container.id,
		});
	} catch (error: any) {
		console.error("Error creating container:", error);
		res.status(500).json({
			error: "Failed to create container. Make sure Docker is running and try again.",
		});
	}
});

router.delete("/api/containers/:id", async (req, res) => {
	const containerId = req.params.id;

	try {
		await cleanupContainer(containerId);
		res.status(200).json({ message: "Container deleted successfully" });
	} catch (error) {
		console.error("Error deleting container:", error);
		res.status(500).json({ error: "Internal server error" });
	}
});

router.get("/api/containers/:id", async (req, res) => {
	const containerId = req.params.id;

	try {
		const container = docker.getContainer(containerId);
		await container.inspect();
		res.status(200).json({ message: "Container exists", containerId });
	} catch (error) {
		console.error("Container not found:", containerId);
		res.status(404).json({ error: "Container not found" });
	}
});

router.post("/api/docker-command", async (req, res) => {
	try {
		const input = req.body.input;
		const containerId = req.body.containerId;

		if (!containerId) {
			return res.status(400).json({ error: "No container ID provided" });
		}

		// Get container and check if it exists
		const container = docker.getContainer(containerId);
		try {
			await container.inspect();
		} catch (err) {
			return res.status(404).json({
				error: "Container not found. Please rejoin the session.",
			});
		}

		// Execute the python code
		const exec = await container.exec({
			Cmd: ["python", "-c", input],
			AttachStdout: true,
			AttachStderr: true,
			AttachStdin: true,
			Tty: false,
		});

		const stream = await exec.start({ hijack: true, stdin: true });

		const stdinData = req.body.stdin;
		if (stdinData) {
			try {
				// ensure a new line so that input goes on new line
				(stream as any).write(String(stdinData) + "\n");
			} catch (e) {
				console.warn("Failed to write stdin to exec stream", e);
			}
		}

		const stdoutStream = new PassThrough();
		const stderrStream = new PassThrough();

		let output = "";
		let error = "";

		stdoutStream.on("data", (chunk: Buffer) => {
			output += chunk.toString();
		});

		stderrStream.on("data", (chunk: Buffer) => {
			error += chunk.toString();
		});

		try {

			docker.modem.demuxStream(stream, stdoutStream, stderrStream);
		} catch (demuxErr) {
			console.warn(
				"demuxStream failed, falling back to raw stream handling",
				demuxErr
			);
			(stream as any).on("data", (chunk: Buffer) => {
				output += chunk.toString();
			});
		}

		await new Promise<void>((resolve) => {
			(stream as any).on("end", () => {
				resolve();
			});
			(stream as any).on("close", () => {
				resolve();
			});
		});

		// Send response after stream ends
		if (error) {
			res.status(400).json({ error: error.trim() });
		} else {
			res.json({ output: output.trim() });
		}
	} catch (error: any) {
		console.error("Error executing Docker command:", error);
		res.status(500).json({
			error:
				error.message ||
				"Error executing Python code. Make sure your code is valid Python.",
		});
	}
});

export default router;
