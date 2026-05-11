import { loadPluginConfig } from "../../plugin-config"
import { resolveSerenaManagerTargetConfig } from "../../features/serena-service/manager-types"

export interface ProjectSerenaServiceOptions {
	serenaCommand?: string[]
	requiredTools?: string[]
}

export async function resolveProjectSerenaServiceOptions(projectRoot: string): Promise<ProjectSerenaServiceOptions> {
	const pluginConfig = await loadPluginConfig(projectRoot, null)
	const targetConfig = resolveSerenaManagerTargetConfig(pluginConfig)
	return {
		serenaCommand: targetConfig?.serenaCommand,
		requiredTools: targetConfig?.requiredTools,
	}
}

export async function resolveProjectSerenaCommand(projectRoot: string): Promise<string[] | undefined> {
	return (await resolveProjectSerenaServiceOptions(projectRoot)).serenaCommand
}
