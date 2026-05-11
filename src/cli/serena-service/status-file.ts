import { mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises"
import { createSerenaServiceStatus, createStoppedSerenaServiceStatus } from "./create-status-record"
import { parseSerenaServiceStatusFile } from "./parse-status-file"
import { normalizeSerenaProjectRoot } from "./project-root"
import { ensureSerenaServiceHome } from "./serena-home"
import { resolveSerenaServiceStateDirectory, resolveSerenaServiceStatusFilePath } from "./state-paths"
import type { SerenaServicePersistedStatus, SerenaServiceStatus } from "./types"

async function createStatusRecord(
	projectRoot: string,
	status: SerenaServiceStatus,
	env: NodeJS.ProcessEnv
): Promise<SerenaServicePersistedStatus> {
	const normalizedProjectRoot = normalizeSerenaProjectRoot(projectRoot)
	const { serenaHome } = await ensureSerenaServiceHome(projectRoot, env)
	const resolvedSerenaHome = (await realpath(status.serenaHome ?? serenaHome)).replace(/\\/g, "/")

	return createSerenaServiceStatus({
		state: status.state,
		projectRoot: normalizedProjectRoot,
		mcpUrl: status.mcpUrl,
		dashboardUrl: status.dashboardUrl,
		pid: status.pid,
		startedBy: status.startedBy,
		openWebDashboard: status.openWebDashboard,
		lastError: status.lastError,
		serenaHome: resolvedSerenaHome,
		updatedAt: status.updatedAt,
	})
}

export async function readSerenaServiceStatus(
	projectRoot: string,
	env: NodeJS.ProcessEnv = process.env
): Promise<SerenaServicePersistedStatus | null> {
	const stateDirectory = resolveSerenaServiceStateDirectory(projectRoot, env)
	const statusFilePath = resolveSerenaServiceStatusFilePath(stateDirectory)

	try {
		const content = await readFile(statusFilePath, "utf8")
		return parseSerenaServiceStatusFile(content)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return null
		}

		throw error
	}
}

export async function writeSerenaServiceStatus(
	projectRoot: string,
	status: SerenaServiceStatus,
	env: NodeJS.ProcessEnv = process.env
): Promise<string> {
	const stateDirectory = resolveSerenaServiceStateDirectory(projectRoot, env)
	const statusFilePath = resolveSerenaServiceStatusFilePath(stateDirectory)
	const statusRecord = await createStatusRecord(projectRoot, status, env)

	await mkdir(stateDirectory, { recursive: true })
	const tempStatusFilePath = `${statusFilePath}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`
	await writeFile(tempStatusFilePath, JSON.stringify(statusRecord, null, 2) + "\n", "utf8")

	try {
		await rename(tempStatusFilePath, statusFilePath)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "EEXIST" && (error as NodeJS.ErrnoException).code !== "EPERM") {
			throw error
		}

		await rm(statusFilePath, { force: true })
		await rename(tempStatusFilePath, statusFilePath)
	}

	return statusFilePath
}

export async function writeStoppedSerenaServiceStatus(
	projectRoot: string,
	env: NodeJS.ProcessEnv = process.env
): Promise<string> {
	return writeSerenaServiceStatus(projectRoot, createStoppedSerenaServiceStatus(projectRoot), env)
}
