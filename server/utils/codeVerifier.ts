import Docker from "dockerode";
import { Logger } from "./logger";

const docker = new Docker();

export interface TestCase {
	input: string;
	expectedOutput: string;
	description: string;
}

export interface VerificationResult {
	passed: boolean;
	totalTests: number;
	passedTests: number;
	failedTests: TestCase[];
	error?: string;
}

export async function verifyCode(
	code: string,
	testCases: TestCase[],
	containerId: string
): Promise<VerificationResult> {
	const result: VerificationResult = {
		passed: false,
		totalTests: testCases.length,
		passedTests: 0,
		failedTests: [],
	};

	try {
		const container = docker.getContainer(containerId);

		for (const testCase of testCases) {
			try {
				Logger.debug("Starting test case", { 
					input: testCase.input, 
					expected: testCase.expectedOutput,
					description: testCase.description 
				});

				const codeBase64 = Buffer.from(code).toString('base64');
				
				const writeExec = await container.exec({
					Cmd: ["sh", "-c", `echo '${codeBase64}' | base64 -d > /tmp/test_code.py && echo '${testCase.input}' > /tmp/test_input.txt`],
					AttachStdout: true,
					AttachStderr: true,
				});
				
				const writeStream = await writeExec.start({});
			
			await new Promise<void>((resolve, reject) => {
				const timeout = setTimeout(() => resolve(), 2000);
				writeStream.on('data', () => {}); // Consume data
				writeStream.on('end', () => {
					clearTimeout(timeout);
					resolve();
				});
				writeStream.on('error', (err: Error) => {
					clearTimeout(timeout);
					reject(err);
				});
			});
			
			await new Promise(resolve => setTimeout(resolve, 100));

			const exec = await container.exec({
				Cmd: ["sh", "-c", "python3 /tmp/test_code.py < /tmp/test_input.txt"],
				AttachStdout: true,
				AttachStderr: true,
				Tty: false,
			});

			const stream = await exec.start({
					hijack: true,
					stdin: false,
				});

				// Collect the output from the code execution
				let output = "";
				let errorOutput = "";
				
				await new Promise<void>((resolve, reject) => {
					const chunks: Buffer[] = [];
					
					// just in case infinite loop or slow execution time
					const timeout = setTimeout(() => {
						Logger.warn("Test execution timeout", { input: testCase.input });
						resolve();
					}, 5000);

					stream.on("data", (chunk: Buffer) => {
						chunks.push(chunk);
					});

					stream.on("end", () => {
						clearTimeout(timeout);
						const fullOutput = Buffer.concat(chunks as any);
						
						let offset = 0;
						while (offset < fullOutput.length) {
							if (offset + 8 > fullOutput.length) break;
							
							const streamType = fullOutput[offset];
							const size = fullOutput.readUInt32BE(offset + 4);
							
							if (offset + 8 + size > fullOutput.length) break;
							
							const data = fullOutput.slice(offset + 8, offset + 8 + size).toString();
							
							if (streamType === 1) {
								output += data;
							} else if (streamType === 2) {
								errorOutput += data;
							}
							
							offset += 8 + size;
						}
						
						resolve();
					});

					stream.on("error", (err: Error) => {
						clearTimeout(timeout);
						reject(err);
					});
				});

				// Normalize outputs similarly to the terminal output
				const actualOutput = output.trim();
				const expectedOutput = testCase.expectedOutput.trim();

				Logger.debug("Test case execution complete", {
					input: testCase.input,
					expected: expectedOutput,
					actual: actualOutput,
					actualLength: actualOutput.length,
					error: errorOutput,
				});
				if (errorOutput && !actualOutput) {
					result.failedTests.push({
						...testCase,
						input: `Runtime Error: ${errorOutput}`,
					});
				} else if (actualOutput === expectedOutput) {
					result.passedTests++;
				} else {
					result.failedTests.push({
						...testCase,
						expectedOutput: expectedOutput,
						input: `Expected: ${expectedOutput}, Got: ${actualOutput}`,
					});
				}
			} catch (error: any) {
				Logger.error("Error executing test case", { error, testCase });
				result.failedTests.push({
					...testCase,
					input: `Execution error: ${error.message}`,
				});
			}
		}

		result.passed = result.passedTests === result.totalTests;
		return result;
	} catch (error: any) {
		Logger.error("Error during code verification", error);
		return {
			passed: false,
			totalTests: testCases.length,
			passedTests: 0,
			failedTests: [],
			error: error.message || "Verification failed",
		};
	}
}

