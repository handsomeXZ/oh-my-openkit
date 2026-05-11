import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { EventEmitter } from "node:events"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ensureSerenaService } from "./ensure-service"
import { SERENA_SERVICE_FIXED_TOOLS } from "./global-config"
import { readSerenaServiceLock } from "./lock-file"
import { readSerenaServiceStatus } from "./status-file"

function createDeferred<T>() {
	let resolve!: (value: T | PromiseLike<T>) => void
	let reject!: (reason?: unknown) => void
	const promise = new Promise<T>((res, rej) => {
		resolve = res
		reject = rej
	})

	return { promise, resolve, reject }
}

function defaultSerenaCommand(): string[] {
	return ["uvx", "--from", "git+https://github.com/oraios/serena", "serena"]
}

class FakeChildProcess extends EventEmitter {
	pid = process.pid
	unref = mock(() => {})
}

describe("ensureSerenaService", () => {
	let tempDir: string
	let env: NodeJS.ProcessEnv
	let projectRoot: string

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "serena-service-ensure-"))
		projectRoot = join(tempDir, "project")
		env = { ...process.env, LOCALAPPDATA: tempDir }
	})

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true })
	})

	test("#given no running service #when ensure executes #then it launches Serena dashboard without opening a browser and publishes mcp-ready status", async () => {
		const child = new FakeChildProcess()
		const spawnProcess = mock((_command: string, _args: string[], _options: Record<string, unknown>) => child as never)
		const waitForReady = mock(async () => ({ dashboardUrl: null }))

		const status = await ensureSerenaService(projectRoot, env, {
			reservePort: async () => 9121,
			spawnProcess: spawnProcess as never,
			waitForReady: waitForReady as never,
			defaultCommand: defaultSerenaCommand,
		})

		expect(status.state).toBe("mcp-ready")
		expect(status.mcpUrl).toBe("http://127.0.0.1:9121/mcp")
		expect(status.dashboardUrl).toBeNull()
		const [command, args, options] = spawnProcess.mock.calls[0] as [string, string[], { env: NodeJS.ProcessEnv; stdio: unknown[] }]
		expect(command).toBe("uvx")
		expect(args).toEqual([
			"--from",
			"git+https://github.com/oraios/serena",
			"serena",
			"start-mcp-server",
			"--transport",
			"streamable-http",
			"--host",
			"127.0.0.1",
			"--port",
			"9121",
			"--context",
			"ide",
			"--project",
			projectRoot,
			"--enable-web-dashboard",
			"True",
			"--open-web-dashboard",
			"False",
			"--enable-gui-log-window",
			"False",
		])
		expect(options.env.SERENA_HOME).toContain("\\oh-my-opencode\\sh\\")
		expect((options as { windowsHide?: boolean }).windowsHide).toBe(true)
		expect(options.stdio[2]).toBeNumber()

		const persisted = await readSerenaServiceStatus(projectRoot, env)
		expect(persisted?.state).toBe("mcp-ready")
		expect(persisted?.mcpUrl).toBe("http://127.0.0.1:9121/mcp")
	})

	test("#given a configured local-fork serenaCommand #when ensure executes #then it launches Serena with that command instead of the upstream default", async () => {
		const child = new FakeChildProcess()
		const spawnProcess = mock((_command: string, _args: string[], _options: Record<string, unknown>) => child as never)

		await ensureSerenaService(projectRoot, env, {
			reservePort: async () => 9122,
			spawnProcess: spawnProcess as never,
			waitForReady: mock(async () => ({ dashboardUrl: null })) as never,
			serenaCommand: ["uv", "run", "--directory", "D:/ForkWorkSpace/serena-lsp", "serena"],
			defaultCommand: defaultSerenaCommand,
		})

		const [command, args] = spawnProcess.mock.calls[0] as [string, string[]]
		expect(command).toBe("uv")
		expect(args.slice(0, 4)).toEqual(["run", "--directory", "D:/ForkWorkSpace/serena-lsp", "serena"])
	})

	test("#given extra required tools #when ensure waits for readiness #then it validates the merged Serena tool contract", async () => {
		const child = new FakeChildProcess()
		const waitForReady = mock(async () => ({ dashboardUrl: null }))

		await ensureSerenaService(projectRoot, env, {
			reservePort: async () => 9123,
			spawnProcess: mock(() => child as never) as never,
			waitForReady: waitForReady as never,
			defaultCommand: defaultSerenaCommand,
			requiredTools: ["custom_serena_tool", "find_symbol"],
		})

		expect(waitForReady).toHaveBeenCalledWith(expect.objectContaining({
			requiredTools: expect.arrayContaining([...SERENA_SERVICE_FIXED_TOOLS, "custom_serena_tool"]),
		}))
	})

	test("#given existing ready service #when ensure runs again #then it reuses the published status instead of spawning another process", async () => {
		const first = await ensureSerenaService(projectRoot, env, {
			reservePort: async () => 9121,
			spawnProcess: mock(() => new FakeChildProcess() as never) as never,
			waitForReady: mock(async () => ({ dashboardUrl: null })) as never,
			defaultCommand: defaultSerenaCommand,
		})

		const secondSpawn = mock(() => new FakeChildProcess() as never)
		const second = await ensureSerenaService(projectRoot, env, {
			spawnProcess: secondSpawn as never,
			isProcessRunning: () => true,
		})

		expect(first.state).toBe("mcp-ready")
		expect(second.state).toBe("mcp-ready")
		expect(secondSpawn).not.toHaveBeenCalled()
	})

	test("#given readiness is still pending #when ensure has spawned Serena #then it publishes starting before resolving dashboard-ready", async () => {
		const child = new FakeChildProcess()
		const enteredReadinessGate = createDeferred<void>()
		const releaseReadiness = createDeferred<void>()
		let startingStatus = null
		const waitForReady = mock(async ({ logFilePath }: { logFilePath: string }) => {
			await writeFile(logFilePath, "Serena web dashboard started at http://127.0.0.1:24282/dashboard/index.html\n", "utf8")
			startingStatus = await readSerenaServiceStatus(projectRoot, env)
			enteredReadinessGate.resolve()
			await releaseReadiness.promise
			return { dashboardUrl: "http://127.0.0.1:24282/dashboard/index.html" }
		})

		const ensurePromise = ensureSerenaService(projectRoot, env, {
			reservePort: async () => 9121,
			spawnProcess: mock(() => child as never) as never,
			waitForReady: waitForReady as never,
			defaultCommand: defaultSerenaCommand,
		})

		await enteredReadinessGate.promise

		expect(startingStatus?.state).toBe("starting")
		expect(startingStatus?.mcpUrl).toBe("http://127.0.0.1:9121/mcp")
		expect(startingStatus?.dashboardUrl).toBeNull()

		releaseReadiness.resolve()

		const status = await ensurePromise

		expect(status.state).toBe("dashboard-ready")
		expect((await readSerenaServiceStatus(projectRoot, env))?.state).toBe("dashboard-ready")
	})

	test("#given a port conflict during readiness #when ensure fails #then it persists an error status and releases the lock", async () => {
		const portConflict = new Error("Port 9121 already in use")

		await expect(
			ensureSerenaService(projectRoot, env, {
				reservePort: async () => 9121,
				spawnProcess: mock(() => new FakeChildProcess() as never) as never,
				waitForReady: mock(async () => {
					throw portConflict
				}) as never,
				defaultCommand: defaultSerenaCommand,
			})
		).rejects.toThrow("Port 9121 already in use")

		const status = await readSerenaServiceStatus(projectRoot, env)

		expect(status?.state).toBe("error")
		expect(status?.lastError).toContain("Port 9121 already in use")
		expect(status?.mcpUrl).toBe("http://127.0.0.1:9121/mcp")
		expect(await readSerenaServiceLock(projectRoot, env)).toBeNull()
	})
})
