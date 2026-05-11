import { spawn } from "node:child_process"
import { isProcessRunning } from "./is-process-running"
import { waitForDelay } from "./wait"

const DEFAULT_STOP_TIMEOUT_MS = 5000

export async function terminateSerenaProcess(pid: number): Promise<void> {
	if (process.platform === "win32") {
		await new Promise<void>((resolve, reject) => {
			const child = spawn("taskkill.exe", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" })
			child.once("error", reject)
			child.once("exit", (code) => {
				if (code === 0 || code === 128 || code === null) {
					resolve()
					return
				}

				reject(new Error(`taskkill exited with code ${code}`))
			})
		})
	} else {
		process.kill(pid, "SIGTERM")
	}

	const deadline = Date.now() + DEFAULT_STOP_TIMEOUT_MS
	while (Date.now() <= deadline) {
		if (!isProcessRunning(pid)) {
			return
		}

		await waitForDelay(100)
	}

	throw new Error(`Serena process ${pid} did not stop in time`)
}
