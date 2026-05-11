import { spawn, spawnSync, type ChildProcess } from "node:child_process"

export interface LaunchDetachedSerenaProcessDependencies {
	spawnProcess?: typeof spawn
	spawnSyncProcess?: typeof spawnSync
}

function quotePowerShellLiteral(value: string): string {
	return `'${value.replace(/'/g, "''")}'`
}

function buildWindowsHiddenLaunchScript(command: string, args: string[], logFilePath: string): string {
	const encodedArgs = args.map((arg) => quotePowerShellLiteral(arg)).join(", ")
	return [
		`$process = Start-Process -FilePath ${quotePowerShellLiteral(command)} -ArgumentList @(${encodedArgs}) -WindowStyle Hidden -RedirectStandardError ${quotePowerShellLiteral(logFilePath)} -PassThru`,
		"if ($null -ne $process) { [Console]::Out.Write($process.Id) }",
	].join("; ")
}

export function launchDetachedSerenaProcess(
	command: string[],
	args: string[],
	logFileDescriptor: number,
	logFilePath: string,
	env: NodeJS.ProcessEnv,
	deps: LaunchDetachedSerenaProcessDependencies
): ChildProcess | { pid: number | null; unref(): void } {
	if (process.platform === "win32" && !deps.spawnProcess) {
		const result = (deps.spawnSyncProcess ?? spawnSync)(
			"powershell.exe",
			[
				"-NoProfile",
				"-NonInteractive",
				"-WindowStyle",
				"Hidden",
				"-Command",
				buildWindowsHiddenLaunchScript(command[0], args, logFilePath),
			],
			{
				windowsHide: true,
				encoding: "utf8",
				env,
			}
		)

		if (result.error) {
			throw result.error
		}

		if ((result.status ?? 0) !== 0) {
			throw new Error(result.stderr?.trim() || `Failed to launch Serena process (exit ${result.status})`)
		}

		const rawPidOutput = String(result.stdout ?? "")
			.replace(/^\uFEFF/, "")
			.trim()
		const parsedPidMatch = rawPidOutput.match(/\d+/)

		return {
			pid: parsedPidMatch ? Number.parseInt(parsedPidMatch[0], 10) || null : null,
			unref() {},
		}
	}

	return (deps.spawnProcess ?? spawn)(command[0], args, {
		detached: true,
		stdio: ["ignore", "ignore", logFileDescriptor],
		windowsHide: true,
		env,
	}) as ChildProcess
}
