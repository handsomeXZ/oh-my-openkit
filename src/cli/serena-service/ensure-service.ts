import { mkdir, open } from "node:fs/promises"
import { resolveSerenaLspRequiredTools } from "../../shared/serena-lsp-required-tools"
import { acquireSerenaServiceLock, releaseSerenaServiceLock } from "./lock-file"
import { publishSerenaServiceStatus } from "./publish-status"
import { reserveSerenaLocalPort } from "./reserve-local-port"
import { createDefaultSerenaCommand } from "./default-serena-command"
import { ensureSerenaServiceHome } from "./serena-home"
import { resolveSerenaServiceStateDirectory, resolveSerenaServiceWrapperLogFilePath } from "./state-paths"
import { createSerenaServiceOwnerId } from "./service-owner-id"
import { waitForSerenaMcpReady, SerenaServiceReadinessError } from "./wait-for-mcp-ready"
import { getSerenaServiceStatus } from "./get-status"
import { isProcessRunning } from "./is-process-running"
import { waitForDelay } from "./wait"
import { launchDetachedSerenaProcess, type LaunchDetachedSerenaProcessDependencies } from "./launch-detached-serena-process"
import { buildSerenaArgs } from "./serena-launch-args"
import type { SerenaServiceStatus } from "./types"

const DEFAULT_LOCK_WAIT_TIMEOUT_MS = 5000
const DEFAULT_LOCK_WAIT_POLL_INTERVAL_MS = 100

interface EnsureSerenaServiceDependencies extends LaunchDetachedSerenaProcessDependencies {
	reservePort?: typeof reserveSerenaLocalPort
	waitForReady?: typeof waitForSerenaMcpReady
	defaultCommand?: typeof createDefaultSerenaCommand
	serenaCommand?: string[]
	requiredTools?: readonly string[]
	isProcessRunning?: typeof isProcessRunning
	waitForDelay?: typeof waitForDelay
	lockWaitTimeoutMs?: number
	lockWaitPollIntervalMs?: number
}

function createMcpUrl(port: number): string {
	return `http://127.0.0.1:${port}/mcp`
}

function isReusableReadyState(state: SerenaServiceStatus["state"]): boolean {
	return state === "mcp-ready" || state === "dashboard-ready"
}

async function returnIfReady(projectRoot: string, env: NodeJS.ProcessEnv, deps: EnsureSerenaServiceDependencies): Promise<SerenaServiceStatus | null> {
	const status = await getSerenaServiceStatus(projectRoot, env)
	const isRunning = (deps.isProcessRunning ?? isProcessRunning)(status.pid)
	if (!isRunning || !status.mcpUrl || !isReusableReadyState(status.state)) {
		return null
	}

	return status
}

async function waitForExistingReadyStatus(
	projectRoot: string,
	env: NodeJS.ProcessEnv,
	deps: EnsureSerenaServiceDependencies
): Promise<SerenaServiceStatus> {
	const waitTimeoutMs = deps.lockWaitTimeoutMs ?? DEFAULT_LOCK_WAIT_TIMEOUT_MS
	const waitPollIntervalMs = deps.lockWaitPollIntervalMs ?? DEFAULT_LOCK_WAIT_POLL_INTERVAL_MS
	const delay = deps.waitForDelay ?? waitForDelay
	const deadline = Date.now() + waitTimeoutMs

	while (Date.now() <= deadline) {
		const status = await returnIfReady(projectRoot, env, deps)
		if (status) {
			return status
		}

		await delay(waitPollIntervalMs)
	}

	throw new Error(`Timed out waiting ${waitTimeoutMs}ms for the existing Serena service owner to publish ready status`)
}

export async function ensureSerenaService(
	projectRoot: string,
	env: NodeJS.ProcessEnv = process.env,
	deps: EnsureSerenaServiceDependencies = {}
): Promise<SerenaServiceStatus> {
	const existingStatus = await returnIfReady(projectRoot, env, deps)
	if (existingStatus) {
		return existingStatus
	}

	const ownerId = createSerenaServiceOwnerId(projectRoot)
	const acquireResult = await acquireSerenaServiceLock({
		projectRoot,
		ownerId,
		pid: process.pid,
		startedBy: "ensure",
		env,
	})

	if (!acquireResult.acquired) {
		return waitForExistingReadyStatus(projectRoot, env, deps)
	}

	const stateDirectory = resolveSerenaServiceStateDirectory(projectRoot, env)
	const logFilePath = resolveSerenaServiceWrapperLogFilePath(stateDirectory)
	const { serenaHome } = await ensureSerenaServiceHome(projectRoot, env)
	const port = await (deps.reservePort ?? reserveSerenaLocalPort)()
	const mcpUrl = createMcpUrl(port)

	await mkdir(stateDirectory, { recursive: true })
	const logHandle = await open(logFilePath, "w")
	const command = deps.serenaCommand ?? (deps.defaultCommand ?? createDefaultSerenaCommand)()
	const args = buildSerenaArgs(projectRoot, port, command)
	const child = launchDetachedSerenaProcess(command, args, logHandle.fd, logFilePath, { ...env, SERENA_HOME: serenaHome }, deps)

	child.unref()
	await logHandle.close()

	const pid = child.pid ?? null
	await publishSerenaServiceStatus({
		projectRoot,
		state: "starting",
		pid,
		startedBy: "ensure",
		mcpUrl,
		dashboardUrl: null,
		env,
	})

	try {
		const readiness = await (deps.waitForReady ?? waitForSerenaMcpReady)({
			mcpUrl,
			logFilePath,
			requiredTools: resolveSerenaLspRequiredTools(deps.requiredTools),
			ensureProcessAlive: () => (deps.isProcessRunning ?? isProcessRunning)(pid),
		})

		return await publishSerenaServiceStatus({
			projectRoot,
			state: readiness.dashboardUrl ? "dashboard-ready" : "mcp-ready",
			pid,
			startedBy: "ensure",
			mcpUrl,
			dashboardUrl: readiness.dashboardUrl,
			env,
		})
	} catch (error) {
		const readinessError = error instanceof SerenaServiceReadinessError ? error : new SerenaServiceReadinessError(String(error), "error")
		await publishSerenaServiceStatus({
			projectRoot,
			state: readinessError.state,
			pid,
			startedBy: "ensure",
			mcpUrl,
			lastError: readinessError.message,
			env,
		})
		throw readinessError
	} finally {
		await releaseSerenaServiceLock({ projectRoot, ownerId, env }).catch(() => false)
	}
}
