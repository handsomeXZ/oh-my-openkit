import { afterEach, describe, expect, it } from "bun:test"
import { mkdtemp, readFile, realpath, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
	createSerenaProjectRootComparisonKey,
	createSerenaServiceProjectHash,
	normalizeSerenaProjectRoot,
	parseSerenaServiceStatusFile,
	readSerenaServiceStatus,
	resolveSerenaServiceConfigFilePath,
	resolveSerenaServiceHomeDirectoryPath,
	resolveSerenaServiceStateDirectory,
	resolveSerenaServiceStatusFilePath,
	resolveSerenaServiceWrapperLogFilePath,
	SERENA_SERVICE_STATES,
	writeStoppedSerenaServiceStatus,
} from "./index"

const cleanupDirectories: string[] = []

async function createLocalAppData(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "serena-service-status-"))
	cleanupDirectories.push(directory)
	return directory
}

afterEach(async () => {
	await Promise.all(cleanupDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe("serena service status contract", () => {
	it("writes the stopped status contract to the per-project LOCALAPPDATA directory", async () => {
		const projectRoot = "C:/Work/Example Project"
		const localAppData = await createLocalAppData()
		const env = { ...process.env, LOCALAPPDATA: localAppData }

		const statusFilePath = await writeStoppedSerenaServiceStatus(projectRoot, env)
		const stateDirectory = resolveSerenaServiceStateDirectory(projectRoot, env)
		const serenaHome = (await realpath(resolveSerenaServiceHomeDirectoryPath(projectRoot, env))).replace(/\\/g, "/")
		const rawStatus = await readFile(statusFilePath, "utf8")
		const parsedStatus = parseSerenaServiceStatusFile(rawStatus)

		expect(stateDirectory).toBe(join(localAppData, "oh-my-opencode", "serena-services", createSerenaServiceProjectHash(projectRoot)))
		expect(statusFilePath).toBe(resolveSerenaServiceStatusFilePath(stateDirectory))
		expect(parsedStatus).toEqual({
			state: "stopped",
			projectRoot,
			mcpUrl: null,
			dashboardUrl: null,
			pid: null,
			startedBy: null,
			openWebDashboard: false,
			lastError: null,
			serenaHome,
			updatedAt: parsedStatus.updatedAt,
		})
		expect(new Date(parsedStatus.updatedAt).toISOString()).toBe(parsedStatus.updatedAt)
	})

	it("exposes the exact planned state enum and auxiliary path contracts", async () => {
		const projectRoot = "C:/Work/Contract Project"
		const localAppData = await createLocalAppData()
		const env = { ...process.env, LOCALAPPDATA: localAppData }
		const stateDirectory = resolveSerenaServiceStateDirectory(projectRoot, env)

		expect(SERENA_SERVICE_STATES).toEqual([
			"stopped",
			"starting",
			"mcp-ready",
			"dashboard-ready",
			"degraded",
			"error",
		])
		expect(resolveSerenaServiceWrapperLogFilePath(stateDirectory)).toBe(join(stateDirectory, "wrapper.log"))
		expect(resolveSerenaServiceHomeDirectoryPath(projectRoot, env)).toBe(
			join(localAppData, "oh-my-opencode", "sh", createSerenaServiceProjectHash(projectRoot))
		)
		expect(resolveSerenaServiceConfigFilePath(projectRoot, env)).toBe(
			join(localAppData, "oh-my-opencode", "sh", createSerenaServiceProjectHash(projectRoot), "serena_config.yml")
		)
	})

	it("reads the status contract back as machine-readable JSON", async () => {
		const projectRoot = "C:/Work/Second Project"
		const localAppData = await createLocalAppData()
		const env = { ...process.env, LOCALAPPDATA: localAppData }

		await writeStoppedSerenaServiceStatus(projectRoot, env)
		const expectedSerenaHome = (await realpath(resolveSerenaServiceHomeDirectoryPath(projectRoot, env))).replace(/\\/g, "/")
		const status = await readSerenaServiceStatus(projectRoot, env)

		expect(status?.state).toBe("stopped")
		expect(status?.projectRoot).toBe(projectRoot)
		expect(status?.mcpUrl).toBeNull()
		expect(status?.dashboardUrl).toBeNull()
		expect(status?.pid).toBeNull()
		expect(status?.startedBy).toBeNull()
		expect(status?.openWebDashboard).toBe(false)
		expect(status?.lastError).toBeNull()
		expect(status?.serenaHome).toBe(expectedSerenaHome)
		expect(typeof status?.updatedAt).toBe("string")
	})

	it("normalizes Windows-style project roots before persisting status records", async () => {
		const projectRoot = "D:\\UE\\Project\\VehicleTest_5_7"
		const localAppData = await createLocalAppData()
		const env = { ...process.env, LOCALAPPDATA: localAppData }

		await writeStoppedSerenaServiceStatus(projectRoot, env)
		const status = await readSerenaServiceStatus("D:/UE/Project/VehicleTest_5_7", env)

		expect(status?.projectRoot).toBe(normalizeSerenaProjectRoot(projectRoot))
		expect(createSerenaProjectRootComparisonKey(projectRoot)).toBe(createSerenaProjectRootComparisonKey("D:/UE/Project/VehicleTest_5_7"))
	})
})
