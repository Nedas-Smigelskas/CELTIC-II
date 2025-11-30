import express from "express";
import Docker from "dockerode";
import { PassThrough } from "stream";

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
		console.log(`Container ${containerId} cleaned up successfully`);
	} catch (err) {
		console.error(`Error cleaning up container ${containerId}:`, err);
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

		// Execute the Python code
		const exec = await container.exec({
			Cmd: ["python", "-c", input],
			AttachStdout: true,
			AttachStderr: true,
			AttachStdin: true,
			Tty: false,
		});

		// Start the exec with hijack/stdin enabled so we can write to stdin if provided
		const stream = await exec.start({ hijack: true, stdin: true });

		// If the client provided stdin (e.g. for input()) write it to the exec stream
		const stdinData = req.body.stdin;
		if (stdinData) {
			try {
				// Ensure newline so input() receives the line
				(stream as any).write(String(stdinData) + "\n");
			} catch (e) {
				console.warn("Failed to write stdin to exec stream", e);
			}
		}

		// The docker exec stream is multiplexed (header bytes indicate stdout/stderr) when Tty is false
		// Demultiplex it into separate stdout/stderr streams to avoid raw control bytes appearing in output
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

		// demux the docker stream into the two PassThrough streams
		// docker.modem.demuxStream is available on the docker instance
		// (it will split the multiplexed stream into stdout/stderr)
		try {
			// @ts-ignore - docker.modem typing may not include demuxStream
			docker.modem.demuxStream(stream, stdoutStream, stderrStream);
		} catch (demuxErr) {
			// If demux fails, fall back to plain text collection
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
