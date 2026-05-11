import {
	resolveSerenaServiceLockFilePath,
	resolveSerenaServiceStateDirectory,
} from "./state-paths"
import {
	acquireSerenaLockFile,
	clearSerenaLockFile,
	type AcquireSerenaServiceLockOptions,
	type RefreshSerenaServiceLockOptions,
	readSerenaLockFile,
	refreshSerenaLockFile,
	releaseSerenaLockFile,
	type ReleaseSerenaServiceLockOptions,
} from "./named-lock-file"
import type {
	SerenaServiceLock,
	SerenaServiceLockAcquireResult,
} from "./types"

function resolveSerenaLockContext(projectRoot: string, env: NodeJS.ProcessEnv) {
	const stateDirectory = resolveSerenaServiceStateDirectory(projectRoot, env)
	const lockFilePath = resolveSerenaServiceLockFilePath(stateDirectory)

	return { stateDirectory, lockFilePath }
}

export async function readSerenaServiceLock(
	projectRoot: string,
	env: NodeJS.ProcessEnv = process.env
): Promise<SerenaServiceLock | null> {
	return readSerenaLockFile(resolveSerenaLockContext(projectRoot, env).lockFilePath, "service")
}

export async function acquireSerenaServiceLock(
	options: AcquireSerenaServiceLockOptions
): Promise<SerenaServiceLockAcquireResult> {
	const env = options.env ?? process.env
	const { lockFilePath, stateDirectory } = resolveSerenaLockContext(options.projectRoot, env)
	return acquireSerenaLockFile("service", lockFilePath, stateDirectory, options)
}

export async function refreshSerenaServiceLock(options: RefreshSerenaServiceLockOptions): Promise<SerenaServiceLock> {
	const env = options.env ?? process.env
	return refreshSerenaLockFile("service", resolveSerenaLockContext(options.projectRoot, env).lockFilePath, options)
}

export async function releaseSerenaServiceLock(options: ReleaseSerenaServiceLockOptions): Promise<boolean> {
	const env = options.env ?? process.env
	return releaseSerenaLockFile("service", resolveSerenaLockContext(options.projectRoot, env).lockFilePath, options)
}

export async function clearSerenaServiceLock(
	projectRoot: string,
	env: NodeJS.ProcessEnv = process.env
): Promise<boolean> {
	return clearSerenaLockFile(resolveSerenaLockContext(projectRoot, env).lockFilePath, "service")
}
