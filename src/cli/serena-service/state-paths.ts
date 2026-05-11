import { createHash } from "node:crypto"
import { join } from "node:path"
import { createSerenaProjectRootComparisonKey } from "./project-root"

export const SERENA_SERVICES_DIRECTORY_NAME = "serena-services"
export const SERENA_RUNTIME_HOMES_DIRECTORY_NAME = "sh"
export const SERENA_SERVICE_STATUS_FILE_NAME = "status.json"
export const SERENA_SERVICE_LOCK_FILE_NAME = "service.lock"
export const SERENA_SERVICE_WRAPPER_LOG_FILE_NAME = "wrapper.log"
export const SERENA_SERVICE_HOME_DIRECTORY_NAME = "serena-home"
export const SERENA_SERVICE_CONFIG_FILE_NAME = "serena_config.yml"

export function resolveSerenaServicesRootDirectory(env: NodeJS.ProcessEnv = process.env): string {
	const localAppData = env.LOCALAPPDATA

	if (!localAppData) {
		throw new Error("LOCALAPPDATA is required to resolve the Serena service state directory")
	}

	return join(localAppData, "oh-my-opencode", SERENA_SERVICES_DIRECTORY_NAME)
}

export function createSerenaServiceProjectHash(projectRoot: string): string {
	return createHash("sha256").update(createSerenaProjectRootComparisonKey(projectRoot)).digest("hex")
}

export function resolveSerenaServiceStateDirectory(
	projectRoot: string,
	env: NodeJS.ProcessEnv = process.env
): string {
	return join(resolveSerenaServicesRootDirectory(env), createSerenaServiceProjectHash(projectRoot))
}

export function resolveSerenaRuntimeHomesRootDirectory(env: NodeJS.ProcessEnv = process.env): string {
	const localAppData = env.LOCALAPPDATA

	if (!localAppData) {
		throw new Error("LOCALAPPDATA is required to resolve the Serena runtime home directory")
	}

	return join(localAppData, "oh-my-opencode", SERENA_RUNTIME_HOMES_DIRECTORY_NAME)
}

export function resolveSerenaServiceHomeDirectoryPath(
	stateDirectoryOrProjectRoot: string,
	env: NodeJS.ProcessEnv = process.env
): string {
	const looksLikeStateDirectory = stateDirectoryOrProjectRoot.includes(SERENA_SERVICES_DIRECTORY_NAME)
	const projectHash = looksLikeStateDirectory
		? stateDirectoryOrProjectRoot.split(/[\\/]/).at(-1) ?? createSerenaServiceProjectHash(stateDirectoryOrProjectRoot)
		: createSerenaServiceProjectHash(stateDirectoryOrProjectRoot)

	return join(resolveSerenaRuntimeHomesRootDirectory(env), projectHash)
}

export function resolveSerenaServiceStatusFilePath(stateDirectory: string): string {
	return join(stateDirectory, SERENA_SERVICE_STATUS_FILE_NAME)
}

export function resolveSerenaServiceLockFilePath(stateDirectory: string): string {
	return join(stateDirectory, SERENA_SERVICE_LOCK_FILE_NAME)
}

export function resolveSerenaServiceWrapperLogFilePath(stateDirectory: string): string {
	return join(stateDirectory, SERENA_SERVICE_WRAPPER_LOG_FILE_NAME)
}

export function resolveSerenaServiceConfigFilePath(
	stateDirectoryOrProjectRoot: string,
	env: NodeJS.ProcessEnv = process.env
): string {
	return join(resolveSerenaServiceHomeDirectoryPath(stateDirectoryOrProjectRoot, env), SERENA_SERVICE_CONFIG_FILE_NAME)
}
