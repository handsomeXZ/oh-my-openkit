import { mkdir, writeFile } from "node:fs/promises"
import { createSerenaServiceGlobalConfigContent, SERENA_SERVICE_CONTEXT } from "./global-config"
import { resolveSerenaServiceConfigFilePath, resolveSerenaServiceHomeDirectoryPath, resolveSerenaServiceStateDirectory } from "./state-paths"

export interface SerenaServiceHomeContract {
	context: typeof SERENA_SERVICE_CONTEXT
	serenaHome: string
	configFilePath: string
}

export async function ensureSerenaServiceHome(
	projectRoot: string,
	env: NodeJS.ProcessEnv = process.env
): Promise<SerenaServiceHomeContract> {
	resolveSerenaServiceStateDirectory(projectRoot, env)
	const serenaHome = resolveSerenaServiceHomeDirectoryPath(projectRoot, env)
	const configFilePath = resolveSerenaServiceConfigFilePath(projectRoot, env)

	await mkdir(serenaHome, { recursive: true })
	await writeFile(configFilePath, createSerenaServiceGlobalConfigContent(), "utf8")

	return {
		context: SERENA_SERVICE_CONTEXT,
		serenaHome,
		configFilePath,
	}
}
