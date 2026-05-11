export const SERENA_SERVICE_STATES = ["stopped", "starting", "mcp-ready", "dashboard-ready", "degraded", "error"] as const

export const SERENA_SERVICE_STARTED_BY = ["cli", "ensure"] as const

export type SerenaServiceState = (typeof SERENA_SERVICE_STATES)[number]

export type SerenaServiceStartedBy = (typeof SERENA_SERVICE_STARTED_BY)[number]

export interface SerenaServiceStatus {
	state: SerenaServiceState
	projectRoot: string
	mcpUrl: string | null
	dashboardUrl: string | null
	pid: number | null
	startedBy: SerenaServiceStartedBy | null
	openWebDashboard: boolean
	lastError: string | null
	serenaHome: string | null
	updatedAt: string
}

export interface SerenaServicePersistedStatus extends SerenaServiceStatus {}

export interface SerenaServiceLock {
	projectRoot: string
	ownerId: string
	pid: number | null
	startedBy: SerenaServiceStartedBy | null
	acquiredAt: string
	updatedAt: string
}

export interface SerenaServiceLockAcquireResult {
	acquired: boolean
	lock: SerenaServiceLock
}
