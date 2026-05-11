import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { EventEmitter } from "node:events"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ensureSerenaService } from "./ensure-service"
import { acquireSerenaServiceLock, readSerenaServiceLock } from "./lock-file"
import { publishSerenaServiceStatus } from "./publish-status"
import { stopSerenaService } from "./stop-service"
import { readSerenaServiceStatus, readSerenaServiceStatus as readStatus } from "./status-file"

class FakeChildProcess extends EventEmitter {
	pid = process.pid
	unref = mock(() => {})
}

function defaultSerenaCommand(): string[] {
	return ["uvx", "--from", "git+https://github.com/oraios/serena", "serena"]
}

describe("stopSerenaService", () => {
	let tempDir: string
	let env: NodeJS.ProcessEnv
	let projectRoot: string

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "serena-service-stop-"))
		projectRoot = join(tempDir, "project")
		env = { ...process.env, LOCALAPPDATA: tempDir }
	})

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true })
	})

		test("#given a managed project service #when stop runs #then it terminates the pid and updates status to stopped", async () => {
			await publishSerenaServiceStatus({
				projectRoot,
				state: "mcp-ready",
				pid: process.pid,
				startedBy: "ensure",
				mcpUrl: "http://127.0.0.1:9121/mcp",
				env,
			})

		const terminateProcess = mock(async () => {})
		const status = await stopSerenaService(projectRoot, env, { terminateProcess })

			expect(terminateProcess).toHaveBeenCalledWith(process.pid)
		expect(status.state).toBe("stopped")
		expect(status.pid).toBeNull()
		expect(status.mcpUrl).toBeNull()

		const persisted = await readSerenaServiceStatus(projectRoot, env)
		expect(persisted?.state).toBe("stopped")
	})

	test("#given no running service #when stop runs #then it still returns a machine-readable stopped status", async () => {
		const status = await stopSerenaService(projectRoot, env, {
			terminateProcess: mock(async () => {}) as never,
		})

		expect(status.state).toBe("stopped")
		expect((await readStatus(projectRoot, env))?.state).toBe("stopped")
	})

	test("#given a lock acquired by another owner #when stop runs after terminating the process #then stop clears the stale lock without needing that owner id", async () => {
		await acquireSerenaServiceLock({
			projectRoot,
			ownerId: "foreign-owner",
			pid: process.pid,
			startedBy: "ensure",
			env,
		})
		await publishSerenaServiceStatus({
			projectRoot,
			state: "mcp-ready",
			pid: process.pid,
			startedBy: "ensure",
			mcpUrl: "http://127.0.0.1:9121/mcp",
			env,
		})

		await stopSerenaService(projectRoot, env, {
			terminateProcess: mock(async () => {}) as never,
		})

		expect(await readSerenaServiceLock(projectRoot, env)).toBeNull()
	})

	test("#given terminate fails and the managed process is still running #when stop runs #then stop preserves lock and running status instead of reporting stopped", async () => {
		await acquireSerenaServiceLock({
			projectRoot,
			ownerId: "foreign-owner",
			pid: process.pid,
			startedBy: "ensure",
			env,
		})
		await publishSerenaServiceStatus({
			projectRoot,
			state: "mcp-ready",
			pid: process.pid,
			startedBy: "ensure",
			mcpUrl: "http://127.0.0.1:9121/mcp",
			env,
		})

		await expect(
			stopSerenaService(projectRoot, env, {
				terminateProcess: mock(async () => {
					throw new Error("taskkill exited with code 1")
				}) as never,
				isProcessRunning: () => true,
			})
		).rejects.toThrow("taskkill exited with code 1")

		expect((await readSerenaServiceLock(projectRoot, env))?.ownerId).toBe("foreign-owner")
		expect((await readSerenaServiceStatus(projectRoot, env))?.state).toBe("mcp-ready")
	})

	test("#given terminate fails after the managed process is already proven stopped #when stop runs #then stop still clears the lock and converges to stopped", async () => {
		await acquireSerenaServiceLock({
			projectRoot,
			ownerId: "foreign-owner",
			pid: process.pid,
			startedBy: "ensure",
			env,
		})
		await publishSerenaServiceStatus({
			projectRoot,
			state: "mcp-ready",
			pid: process.pid,
			startedBy: "ensure",
			mcpUrl: "http://127.0.0.1:9121/mcp",
			env,
		})

		const status = await stopSerenaService(projectRoot, env, {
			terminateProcess: mock(async () => {
				throw new Error("taskkill exited with code 128")
			}) as never,
			isProcessRunning: () => false,
		})

		expect(status.state).toBe("stopped")
		expect(await readSerenaServiceLock(projectRoot, env)).toBeNull()
		expect((await readSerenaServiceStatus(projectRoot, env))?.state).toBe("stopped")
	})

	test("#given lock clearing fails after the process is proven stopped #when stop runs #then stop preserves the prior status instead of falsely writing stopped", async () => {
		await acquireSerenaServiceLock({
			projectRoot,
			ownerId: "foreign-owner",
			pid: process.pid,
			startedBy: "ensure",
			env,
		})
		await publishSerenaServiceStatus({
			projectRoot,
			state: "mcp-ready",
			pid: process.pid,
			startedBy: "ensure",
			mcpUrl: "http://127.0.0.1:9121/mcp",
			env,
		})

		await expect(
			stopSerenaService(projectRoot, env, {
				terminateProcess: mock(async () => {}) as never,
				clearLock: mock(async () => {
					throw new Error("EPERM: lock file still busy")
				}) as never,
			})
		).rejects.toThrow("EPERM: lock file still busy")

		expect((await readSerenaServiceStatus(projectRoot, env))?.state).toBe("mcp-ready")
		expect((await readSerenaServiceLock(projectRoot, env))?.ownerId).toBe("foreign-owner")
	})

	test("#given the persisted pid is already dead before stop starts #when lock clearing then fails #then stop does not eagerly rewrite status to stopped", async () => {
		await acquireSerenaServiceLock({
			projectRoot,
			ownerId: "foreign-owner",
			pid: 999999,
			startedBy: "ensure",
			env,
		})
		await publishSerenaServiceStatus({
			projectRoot,
			state: "mcp-ready",
			pid: 999999,
			startedBy: "ensure",
			mcpUrl: "http://127.0.0.1:9121/mcp",
			env,
		})

		await expect(
			stopSerenaService(projectRoot, env, {
				terminateProcess: mock(async () => {}) as never,
				clearLock: mock(async () => {
					throw new Error("EPERM: lock file still busy")
				}) as never,
			})
		).rejects.toThrow("EPERM: lock file still busy")

		expect((await readSerenaServiceStatus(projectRoot, env))?.state).toBe("mcp-ready")
		expect((await readSerenaServiceStatus(projectRoot, env))?.pid).toBe(999999)
		expect((await readSerenaServiceLock(projectRoot, env))?.ownerId).toBe("foreign-owner")
	})

	test("#given a new owner reacquires the lock before stop finalizes #when stop tries to write stopped #then stop does not overwrite the restarted service state", async () => {
		await acquireSerenaServiceLock({
			projectRoot,
			ownerId: "foreign-owner",
			pid: process.pid,
			startedBy: "ensure",
			env,
		})
		await publishSerenaServiceStatus({
			projectRoot,
			state: "mcp-ready",
			pid: process.pid,
			startedBy: "ensure",
			mcpUrl: "http://127.0.0.1:9121/mcp",
			env,
		})

		await expect(
			stopSerenaService(projectRoot, env, {
				terminateProcess: mock(async () => {}) as never,
				acquireLock: mock(async () => ({
					acquired: false,
					lock: {
						projectRoot,
						ownerId: "new-owner",
						pid: 4242,
						startedBy: "ensure",
						acquiredAt: "2026-04-19T00:00:00.000Z",
						updatedAt: "2026-04-19T00:00:00.000Z",
					},
				})) as never,
			})
		).rejects.toThrow("Serena service restarted before stop finalized")

		expect((await readSerenaServiceStatus(projectRoot, env))?.state).toBe("mcp-ready")
		expect((await readSerenaServiceStatus(projectRoot, env))?.mcpUrl).toBe("http://127.0.0.1:9121/mcp")
	})

	test("#given a stopped service after stop #when ensure runs again #then it launches a fresh managed instance", async () => {
		await publishSerenaServiceStatus({
			projectRoot,
			state: "mcp-ready",
			pid: process.pid,
			startedBy: "ensure",
			mcpUrl: "http://127.0.0.1:9121/mcp",
			env,
		})

		await stopSerenaService(projectRoot, env, {
			terminateProcess: mock(async () => {}) as never,
		})

		const spawnProcess = mock(() => new FakeChildProcess() as never)
		const status = await ensureSerenaService(projectRoot, env, {
			reservePort: async () => 9222,
			spawnProcess: spawnProcess as never,
			waitForReady: mock(async () => ({ dashboardUrl: null })) as never,
			defaultCommand: defaultSerenaCommand,
		})

		expect(spawnProcess).toHaveBeenCalledTimes(1)
		expect(status.state).toBe("mcp-ready")
		expect(status.mcpUrl).toBe("http://127.0.0.1:9222/mcp")
	})
})
