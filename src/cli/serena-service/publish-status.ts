import { createSerenaServiceStatus } from "./create-status-record"
import { readSerenaServiceStatus } from "./status-file"
import { writeSerenaServiceStatus } from "./status-file"
import type { SerenaServicePersistedStatus, SerenaServiceStartedBy, SerenaServiceState } from "./types"

interface PublishSerenaServiceStatusInput {
	projectRoot: string
	state?: SerenaServiceState
	mcpUrl?: string | null
	dashboardUrl?: string | null
	pid?: number | null
	startedBy?: SerenaServiceStartedBy | null
	lastError?: string | null
	openWebDashboard?: boolean
	env?: NodeJS.ProcessEnv
}

function useProvidedOrExisting<T>(provided: T | undefined, existing: T | undefined, fallback: T): T {
	if (provided !== undefined) {
		return provided
	}

	return existing ?? fallback
}

export async function publishSerenaServiceStatus(input: PublishSerenaServiceStatusInput): Promise<SerenaServicePersistedStatus> {
	const existingStatus = await readSerenaServiceStatus(input.projectRoot, input.env)
	const status = createSerenaServiceStatus({
		state: useProvidedOrExisting(input.state, existingStatus?.state, "stopped"),
		projectRoot: input.projectRoot,
		mcpUrl: useProvidedOrExisting(input.mcpUrl, existingStatus?.mcpUrl, null),
		dashboardUrl: useProvidedOrExisting(input.dashboardUrl, existingStatus?.dashboardUrl, null),
		pid: useProvidedOrExisting(input.pid, existingStatus?.pid, null),
		startedBy: useProvidedOrExisting(input.startedBy, existingStatus?.startedBy, null),
		lastError: useProvidedOrExisting(input.lastError, existingStatus?.lastError, null),
		openWebDashboard: useProvidedOrExisting(input.openWebDashboard, existingStatus?.openWebDashboard, false),
	})

	await writeSerenaServiceStatus(input.projectRoot, status, input.env)
	return (await readSerenaServiceStatus(input.projectRoot, input.env)) ?? status
}
