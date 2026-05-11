import { mkdir } from "node:fs/promises"
import { spawn } from "node:child_process"
import { dirname } from "node:path"

function spawnDetached(command: string, args: string[]): void {
	const child = spawn(command, args, {
		detached: true,
		stdio: "ignore",
		windowsHide: false,
	})
	child.unref()
}

export async function openSerenaServicePath(targetPath: string): Promise<void> {
	await mkdir(dirname(targetPath), { recursive: true })

	if (process.platform === "win32") {
		spawnDetached("cmd.exe", ["/c", "start", "", targetPath])
		return
	}

	spawnDetached("xdg-open", [targetPath])
}

export async function openSerenaServiceUrl(targetUrl: string): Promise<void> {
	if (process.platform === "win32") {
		spawnDetached("cmd.exe", ["/c", "start", "", targetUrl])
		return
	}

	spawnDetached("xdg-open", [targetUrl])
}

export async function openSerenaServiceConsole(logFilePath: string): Promise<void> {
	await mkdir(dirname(logFilePath), { recursive: true })

	if (process.platform === "win32") {
		spawnDetached("powershell.exe", [
			"-NoExit",
			"-Command",
			`Get-Content -Path '${logFilePath.replace(/'/g, "''")}' -Wait`,
		])
		return
	}

	spawnDetached("x-terminal-emulator", ["-e", `tail -f '${logFilePath.replace(/'/g, "'\\''")}'`])
}
