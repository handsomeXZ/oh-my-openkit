import { afterEach, describe, expect, it } from "bun:test"
import { mkdtemp, readFile, realpath, rm, stat } from "node:fs/promises"
import { load } from "js-yaml"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import {
	createSerenaServiceGlobalConfig,
	ensureSerenaServiceHome,
	readSerenaServiceStatus,
	resolveSerenaServiceConfigFilePath,
	resolveSerenaServiceHomeDirectoryPath,
	resolveSerenaServiceStateDirectory,
	SERENA_SERVICE_BASE_MODES,
	SERENA_SERVICE_CONTEXT,
	SERENA_SERVICE_DEFAULT_MODES,
	SERENA_SERVICE_FIXED_TOOLS,
	SERENA_SERVICE_PROJECT_SERENA_FOLDER_LOCATION,
	writeStoppedSerenaServiceStatus,
} from "./index"

const cleanupDirectories: string[] = []

async function createTempDirectory(prefix: string): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), prefix))
	cleanupDirectories.push(directory)
	return directory
}

async function pathExists(filePath: string): Promise<boolean> {
	try {
		await stat(filePath)
		return true
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return false
		}

		throw error
	}
}

async function resolvePersistedSerenaHome(configFilePath: string): Promise<string> {
	return dirname(await realpath(configFilePath)).replace(/\\/g, "/")
}

afterEach(async () => {
	await Promise.all(cleanupDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe("serena service serenaHome contract", () => {
	it("serenaHome generates an isolated wrapper-owned global config with the exact tool and mode contract", async () => {
		const projectRoot = "C:/Work/Serena Home Project"
		const localAppData = await createTempDirectory("serena-service-home-")
		const env = { ...process.env, LOCALAPPDATA: localAppData }
		const expectedSerenaHome = resolveSerenaServiceHomeDirectoryPath(projectRoot, env)
		const expectedConfigFilePath = resolveSerenaServiceConfigFilePath(projectRoot, env)

		await writeStoppedSerenaServiceStatus(projectRoot, env)
		const status = await readSerenaServiceStatus(projectRoot, env)
		const rawConfig = await readFile(expectedConfigFilePath, "utf8")
		const expectedPersistedSerenaHome = await resolvePersistedSerenaHome(expectedConfigFilePath)
		const parsedConfig = load(rawConfig)

		expect(SERENA_SERVICE_CONTEXT).toBe("ide")
		expect(status?.serenaHome).toBe(expectedPersistedSerenaHome)
		expect(parsedConfig).toEqual(createSerenaServiceGlobalConfig())
			expect(parsedConfig).toEqual({
				web_dashboard: true,
				web_dashboard_open_on_launch: false,
				gui_log_window: false,
				web_dashboard_listen_address: "127.0.0.1",
				fixed_tools: [...SERENA_SERVICE_FIXED_TOOLS],
				base_modes: [...SERENA_SERVICE_BASE_MODES],
				default_modes: [...SERENA_SERVICE_DEFAULT_MODES],
				project_serena_folder_location: SERENA_SERVICE_PROJECT_SERENA_FOLDER_LOCATION,
				projects: [],
			})
	})

	it("globalConfig writes only to the wrapper state directory and never %USERPROFILE%\\.serena", async () => {
		const projectRoot = "C:/Work/Global Config Project"
		const localAppData = await createTempDirectory("serena-service-global-")
		const userProfile = await createTempDirectory("serena-user-profile-")
		const env = { ...process.env, LOCALAPPDATA: localAppData, USERPROFILE: userProfile }
		const expectedSerenaHome = resolveSerenaServiceHomeDirectoryPath(projectRoot, env)
		const expectedConfigFilePath = resolveSerenaServiceConfigFilePath(projectRoot, env)
		const userGlobalConfigPath = join(userProfile, ".serena", "serena_config.yml")

		const contract = await ensureSerenaServiceHome(projectRoot, env)
		await writeStoppedSerenaServiceStatus(projectRoot, env)
		const status = await readSerenaServiceStatus(projectRoot, env)
		const expectedPersistedSerenaHome = await resolvePersistedSerenaHome(expectedConfigFilePath)

		expect(contract.context).toBe("ide")
		expect(contract.serenaHome).toBe(expectedSerenaHome)
		expect(contract.configFilePath).toBe(expectedConfigFilePath)
		expect(status?.serenaHome).toBe(expectedPersistedSerenaHome)
		expect(await pathExists(expectedConfigFilePath)).toBe(true)
		expect(await pathExists(userGlobalConfigPath)).toBe(false)
		expect(expectedConfigFilePath.replace(/\\/g, "/")).toStartWith(join(localAppData, "oh-my-opencode", "sh").replace(/\\/g, "/"))
		expect(expectedConfigFilePath).not.toBe(userGlobalConfigPath)
	})
})
