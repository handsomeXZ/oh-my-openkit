import { normalizeSerenaProjectRoot } from "./project-root"
import type { SerenaServicePersistedStatus, SerenaServiceStatus } from "./types"

interface CreateSerenaServiceStatusInput {
	state: SerenaServiceStatus["state"]
	projectRoot: string
	mcpUrl?: string | null
	dashboardUrl?: string | null
	pid?: number | null
	startedBy?: SerenaServiceStatus["startedBy"]
	openWebDashboard?: boolean
	lastError?: string | null
	serenaHome?: string | null
	updatedAt?: string
}

export function createSerenaServiceStatus(input: CreateSerenaServiceStatusInput): SerenaServicePersistedStatus {
	return {
		state: input.state,
		projectRoot: normalizeSerenaProjectRoot(input.projectRoot),
		mcpUrl: input.mcpUrl ?? null,
		dashboardUrl: input.dashboardUrl ?? null,
		pid: input.pid ?? null,
		startedBy: input.startedBy ?? null,
		openWebDashboard: input.openWebDashboard ?? false,
		lastError: input.lastError ?? null,
		serenaHome: input.serenaHome ?? null,
		updatedAt: input.updatedAt ?? new Date().toISOString(),
	}
}

export function createStoppedSerenaServiceStatus(projectRoot: string): SerenaServicePersistedStatus {
	return createSerenaServiceStatus({
		state: "stopped",
		projectRoot,
	})
}
