import { createSerenaServiceStatus, createStoppedSerenaServiceStatus } from "./create-status-record"
import { normalizeSerenaProjectRoot } from "./project-root"
import { readSerenaServiceStatus, writeSerenaServiceStatus } from "./status-file"
import { isProcessRunning } from "./is-process-running"
import type { SerenaServicePersistedStatus } from "./types"

export async function getSerenaServiceStatus(
	projectRoot: string,
	env: NodeJS.ProcessEnv = process.env
): Promise<SerenaServicePersistedStatus> {
	const normalizedProjectRoot = normalizeSerenaProjectRoot(projectRoot)
	const currentStatus = await readSerenaServiceStatus(projectRoot, env)

	if (!currentStatus) {
		const stoppedStatus = createStoppedSerenaServiceStatus(normalizedProjectRoot)
		await writeSerenaServiceStatus(projectRoot, stoppedStatus, env)
		return (await readSerenaServiceStatus(projectRoot, env)) ?? stoppedStatus
	}

	if (currentStatus.pid && !isProcessRunning(currentStatus.pid)) {
		const stoppedStatus = createSerenaServiceStatus({
			state: "stopped",
			projectRoot: normalizedProjectRoot,
		})
		await writeSerenaServiceStatus(projectRoot, stoppedStatus, env)
		return (await readSerenaServiceStatus(projectRoot, env)) ?? stoppedStatus
	}

	return currentStatus
}
