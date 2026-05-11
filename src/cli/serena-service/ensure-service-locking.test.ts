import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { EventEmitter } from "node:events"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { acquireSerenaServiceLock, readSerenaServiceLock } from "./lock-file"
import { ensureSerenaService } from "./ensure-service"
import { createSerenaServiceOwnerId } from "./service-owner-id"

class FakeChildProcess extends EventEmitter {
	pid = process.pid
	unref = mock(() => {})
}

function createDeferred<T>() {
	let resolve!: (value: T | PromiseLike<T>) => void
	const promise = new Promise<T>((res) => {
		resolve = res
	})

	return { promise, resolve }
}

function defaultSerenaCommand(): string[] {
	return ["uvx", "--from", "git+https://github.com/oraios/serena", "serena"]
}

describe("ensureSerenaService locking", () => {
	let tempDir: string
	let env: NodeJS.ProcessEnv
	let projectRoot: string

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "serena-service-locking-"))
		projectRoot = join(tempDir, "project")
		env = { ...process.env, LOCALAPPDATA: tempDir }
	})

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true })
	})

	test("#given another owner holds the service lock without publishing ready status #when ensure waits #then ensure fails deterministically after bounded timeout instead of recursing forever", async () => {
		await acquireSerenaServiceLock({
			projectRoot,
			ownerId: "other-owner",
			pid: process.pid,
			startedBy: "ensure",
			env,
		})

		const spawnProcess = mock(() => new FakeChildProcess() as never)

		await expect(
			ensureSerenaService(projectRoot, env, {
				spawnProcess: spawnProcess as never,
				isProcessRunning: () => true,
				lockWaitTimeoutMs: 10,
				lockWaitPollIntervalMs: 1,
			})
		).rejects.toThrow("Timed out waiting 10ms for the existing Serena service owner to publish ready status")

		expect(spawnProcess).not.toHaveBeenCalled()
	})

	test("#given concurrent ensure callers #when the first caller owns the lock #then only one Serena instance is launched and both calls converge on the same ready status", async () => {
		const enteredReadinessGate = createDeferred<void>()
		const enteredWaitLoop = createDeferred<void>()
		const releaseReadiness = createDeferred<void>()
		const spawnProcess = mock(() => new FakeChildProcess() as never)
		const waitForReady = mock(async () => {
			enteredReadinessGate.resolve()
			await releaseReadiness.promise
			return { dashboardUrl: null }
		})

		const firstEnsure = ensureSerenaService(projectRoot, env, {
			reservePort: async () => 9121,
			spawnProcess: spawnProcess as never,
			waitForReady: waitForReady as never,
			defaultCommand: defaultSerenaCommand,
		})

		await enteredReadinessGate.promise

		const activeLock = await readSerenaServiceLock(projectRoot, env)
		expect(activeLock?.ownerId).toContain(`${createSerenaServiceOwnerId(projectRoot).split(":").slice(0, 2).join(":")}:`)
		expect(activeLock?.startedBy).toBe("ensure")

		const secondEnsure = ensureSerenaService(projectRoot, env, {
			spawnProcess: spawnProcess as never,
			waitForReady: waitForReady as never,
			defaultCommand: defaultSerenaCommand,
			waitForDelay: async () => {
				enteredWaitLoop.resolve()
				await new Promise((resolve) => setTimeout(resolve, 1))
			},
			lockWaitTimeoutMs: 100,
			lockWaitPollIntervalMs: 1,
		})

		await enteredWaitLoop.promise
		releaseReadiness.resolve()

		const [firstStatus, secondStatus] = await Promise.all([firstEnsure, secondEnsure])

		expect(spawnProcess).toHaveBeenCalledTimes(1)
		expect(waitForReady).toHaveBeenCalledTimes(1)
		expect(firstStatus).toEqual(secondStatus)
		expect((await readSerenaServiceLock(projectRoot, env)) ?? null).toBeNull()
	})

	test("#given owner ids for the same project #when they are generated twice #then each acquisition gets a unique owner id", () => {
		const firstOwnerId = createSerenaServiceOwnerId(projectRoot)
		const secondOwnerId = createSerenaServiceOwnerId(projectRoot)

		expect(firstOwnerId).not.toBe(secondOwnerId)
		expect(firstOwnerId.split(":").slice(0, 2).join(":")).toBe(secondOwnerId.split(":").slice(0, 2).join(":"))
	})
})
