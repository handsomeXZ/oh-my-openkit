import { afterEach, describe, expect, it } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
	acquireSerenaServiceLock,
	readSerenaServiceLock,
	refreshSerenaServiceLock,
	releaseSerenaServiceLock,
	resolveSerenaServiceLockFilePath,
	resolveSerenaServiceStateDirectory,
	SERENA_SERVICE_LOCK_FILE_NAME,
} from "./index"

const cleanupDirectories: string[] = []

async function createLocalAppData(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "serena-service-lock-"))
	cleanupDirectories.push(directory)
	return directory
}

afterEach(async () => {
	await Promise.all(cleanupDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe("serena service lock contract", () => {
	it("keeps the first concurrent owner until that owner releases the lock", async () => {
		const projectRoot = "C:/Work/Lock Project"
		const localAppData = await createLocalAppData()
		const env = { ...process.env, LOCALAPPDATA: localAppData }
		const stateDirectory = resolveSerenaServiceStateDirectory(projectRoot, env)

		const firstAcquire = await acquireSerenaServiceLock({
			projectRoot,
			ownerId: "owner-a",
			pid: 111,
			startedBy: "cli",
			env,
			updatedAt: "2026-04-18T00:00:00.000Z",
		})
		const secondAcquire = await acquireSerenaServiceLock({
			projectRoot,
			ownerId: "owner-b",
			pid: 222,
			startedBy: "ensure",
			env,
			updatedAt: "2026-04-18T00:00:05.000Z",
		})

		expect(firstAcquire.acquired).toBe(true)
		expect(secondAcquire.acquired).toBe(false)
		expect(secondAcquire.lock.ownerId).toBe("owner-a")
		expect(secondAcquire.lock.pid).toBe(111)
		expect(secondAcquire.lock.startedBy).toBe("cli")
		expect(resolveSerenaServiceLockFilePath(stateDirectory)).toBe(join(stateDirectory, SERENA_SERVICE_LOCK_FILE_NAME))
		expect(SERENA_SERVICE_LOCK_FILE_NAME).toBe("service.lock")
	})

	it("only lets the current owner refresh and release the lock", async () => {
		const projectRoot = "C:/Work/Refresh Project"
		const localAppData = await createLocalAppData()
		const env = { ...process.env, LOCALAPPDATA: localAppData }

		await acquireSerenaServiceLock({
			projectRoot,
			ownerId: "owner-a",
			pid: 456,
			startedBy: "cli",
			env,
			updatedAt: "2026-04-18T01:00:00.000Z",
		})

		await expect(
			refreshSerenaServiceLock({
				projectRoot,
				ownerId: "owner-b",
				env,
				updatedAt: "2026-04-18T01:01:00.000Z",
			})
		).rejects.toThrow("Only the current Serena service lock owner may refresh the lock")

		const refreshedLock = await refreshSerenaServiceLock({
			projectRoot,
			ownerId: "owner-a",
			env,
			updatedAt: "2026-04-18T01:02:00.000Z",
		})
		const wrongOwnerRelease = await releaseSerenaServiceLock({
			projectRoot,
			ownerId: "owner-b",
			env,
		})
		const currentLock = await readSerenaServiceLock(projectRoot, env)
		const stateDirectory = resolveSerenaServiceStateDirectory(projectRoot, env)
		const rawLock = await readFile(resolveSerenaServiceLockFilePath(stateDirectory), "utf8")
		const rightOwnerRelease = await releaseSerenaServiceLock({
			projectRoot,
			ownerId: "owner-a",
			env,
		})
		const releasedLock = await readSerenaServiceLock(projectRoot, env)

		expect(refreshedLock.acquiredAt).toBe("2026-04-18T01:00:00.000Z")
		expect(refreshedLock.updatedAt).toBe("2026-04-18T01:02:00.000Z")
		expect(wrongOwnerRelease).toBe(false)
		expect(currentLock?.ownerId).toBe("owner-a")
		expect(rawLock).toContain('"ownerId": "owner-a"')
		expect(rightOwnerRelease).toBe(true)
		expect(releasedLock).toBeNull()
	})

})
