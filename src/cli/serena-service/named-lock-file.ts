import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { SERENA_SERVICE_STARTED_BY } from "./types"
import type { SerenaServiceLock, SerenaServiceLockAcquireResult } from "./types"

export type SerenaLockKind = "service"

export interface SerenaLockOptions {
	projectRoot: string
	ownerId: string
	env?: NodeJS.ProcessEnv
}

export interface AcquireSerenaServiceLockOptions extends SerenaLockOptions {
	pid?: number | null
	startedBy?: SerenaServiceLock["startedBy"]
	updatedAt?: string
}

export interface ReleaseSerenaServiceLockOptions extends SerenaLockOptions {}

export interface RefreshSerenaServiceLockOptions extends ReleaseSerenaServiceLockOptions {
	updatedAt?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

function createSerenaLock(options: AcquireSerenaServiceLockOptions): SerenaServiceLock {
	const timestamp = options.updatedAt ?? new Date().toISOString()

	return {
		projectRoot: options.projectRoot,
		ownerId: options.ownerId,
		pid: options.pid ?? null,
		startedBy: options.startedBy ?? null,
		acquiredAt: timestamp,
		updatedAt: timestamp,
	}
}

function createSerenaLockLabel(kind: SerenaLockKind): string {
	return "Serena service lock"
}

function parseSerenaLockFileContent(content: string, kind: SerenaLockKind): SerenaServiceLock {
	const parsed = JSON.parse(content) as unknown
	const lockLabel = createSerenaLockLabel(kind)

	if (!isRecord(parsed)) {
		throw new Error(`${lockLabel} must be a JSON object`)
	}

	if (typeof parsed.projectRoot !== "string") {
		throw new Error(`${lockLabel} requires projectRoot`)
	}

	if (typeof parsed.ownerId !== "string") {
		throw new Error(`${lockLabel} requires ownerId`)
	}

	if (parsed.pid !== null && typeof parsed.pid !== "number") {
		throw new Error(`${lockLabel} has an invalid pid`)
	}

	if (
		parsed.startedBy !== null &&
		!SERENA_SERVICE_STARTED_BY.includes(parsed.startedBy as SerenaServiceLock["startedBy"] & string)
	) {
		throw new Error(`${lockLabel} has an invalid startedBy`)
	}

	if (typeof parsed.acquiredAt !== "string" || typeof parsed.updatedAt !== "string") {
		throw new Error(`${lockLabel} requires timestamps`)
	}

	return {
		projectRoot: parsed.projectRoot,
		ownerId: parsed.ownerId,
		pid: parsed.pid,
		startedBy: parsed.startedBy as SerenaServiceLock["startedBy"],
		acquiredAt: parsed.acquiredAt,
		updatedAt: parsed.updatedAt,
	}
}

export async function readSerenaLockFile(lockFilePath: string, kind: SerenaLockKind): Promise<SerenaServiceLock | null> {
	try {
		const content = await readFile(lockFilePath, "utf8")
		return parseSerenaLockFileContent(content, kind)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return null
		}

		throw error
	}
}

export async function acquireSerenaLockFile(
	kind: SerenaLockKind,
	lockFilePath: string,
	stateDirectory: string,
	options: AcquireSerenaServiceLockOptions
): Promise<SerenaServiceLockAcquireResult> {
	const lock = createSerenaLock(options)

	await mkdir(stateDirectory, { recursive: true })

	try {
		await writeFile(lockFilePath, JSON.stringify(lock, null, 2) + "\n", {
			encoding: "utf8",
			flag: "wx",
		})
		return { acquired: true, lock }
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
			throw error
		}

		const existingLock = await readSerenaLockFile(lockFilePath, kind)

		if (!existingLock) {
			throw new Error(`${createSerenaLockLabel(kind)} exists but could not be read`)
		}

		return { acquired: false, lock: existingLock }
	}
}

export async function refreshSerenaLockFile(
	kind: SerenaLockKind,
	lockFilePath: string,
	options: RefreshSerenaServiceLockOptions
): Promise<SerenaServiceLock> {
	const existingLock = await readSerenaLockFile(lockFilePath, kind)

	if (!existingLock) {
		throw new Error(`${createSerenaLockLabel(kind)} does not exist`)
	}

	if (existingLock.ownerId !== options.ownerId) {
		throw new Error(`Only the current ${createSerenaLockLabel(kind)} owner may refresh the lock`)
	}

	const refreshedLock: SerenaServiceLock = {
		...existingLock,
		updatedAt: options.updatedAt ?? new Date().toISOString(),
	}

	await writeFile(lockFilePath, JSON.stringify(refreshedLock, null, 2) + "\n", "utf8")
	return refreshedLock
}

export async function releaseSerenaLockFile(
	kind: SerenaLockKind,
	lockFilePath: string,
	options: ReleaseSerenaServiceLockOptions
): Promise<boolean> {
	const existingLock = await readSerenaLockFile(lockFilePath, kind)

	if (!existingLock || existingLock.ownerId !== options.ownerId) {
		return false
	}

	await rm(lockFilePath)
	return true
}

export async function clearSerenaLockFile(lockFilePath: string, kind: SerenaLockKind): Promise<boolean> {
	const existingLock = await readSerenaLockFile(lockFilePath, kind)

	if (!existingLock) {
		return false
	}

	await rm(lockFilePath)
	return true
}
