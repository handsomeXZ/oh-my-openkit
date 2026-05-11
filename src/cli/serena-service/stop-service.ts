import { acquireSerenaServiceLock, clearSerenaServiceLock, releaseSerenaServiceLock } from "./lock-file"
import { createSerenaServiceStatus, createStoppedSerenaServiceStatus } from "./create-status-record"
import { isProcessRunning } from "./is-process-running"
import { createSerenaServiceOwnerId } from "./service-owner-id"
import { terminateSerenaProcess } from "./terminate-process"
import { readSerenaServiceStatus, writeSerenaServiceStatus } from "./status-file"
import { getSerenaServiceStatus } from "./get-status"
import type { SerenaServiceStatus } from "./types"

interface StopSerenaServiceDependencies {
	terminateProcess?: typeof terminateSerenaProcess
	isProcessRunning?: typeof isProcessRunning
	clearLock?: typeof clearSerenaServiceLock
	acquireLock?: typeof acquireSerenaServiceLock
	releaseLock?: typeof releaseSerenaServiceLock
}

export async function stopSerenaService(
	projectRoot: string,
	env: NodeJS.ProcessEnv = process.env,
	deps: StopSerenaServiceDependencies = {}
): Promise<SerenaServiceStatus> {
	const status = (await readSerenaServiceStatus(projectRoot, env)) ?? createStoppedSerenaServiceStatus(projectRoot)
	const checkProcessRunning = deps.isProcessRunning ?? isProcessRunning
	const finalizationOwnerId = createSerenaServiceOwnerId(projectRoot)

	if (status.pid && checkProcessRunning(status.pid)) {
		try {
			await (deps.terminateProcess ?? terminateSerenaProcess)(status.pid)
		} catch (error) {
			if (checkProcessRunning(status.pid)) {
				throw error
			}
		}
	}

	await (deps.clearLock ?? clearSerenaServiceLock)(projectRoot, env)
	const finalizationLock = await (deps.acquireLock ?? acquireSerenaServiceLock)({
		projectRoot,
		ownerId: finalizationOwnerId,
		env,
	})

	if (!finalizationLock.acquired) {
		throw new Error("Serena service restarted before stop finalized")
	}

	try {
		await writeSerenaServiceStatus(
			projectRoot,
			createSerenaServiceStatus({
				state: "stopped",
				projectRoot,
			}),
			env
		)
		return getSerenaServiceStatus(projectRoot, env)
	} finally {
		await (deps.releaseLock ?? releaseSerenaServiceLock)({
			projectRoot,
			ownerId: finalizationOwnerId,
			env,
		})
	}
}
