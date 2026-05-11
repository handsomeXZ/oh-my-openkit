import type { SerenaServicePersistedStatus, SerenaServiceStatus } from "./types"
import { SERENA_SERVICE_STARTED_BY, SERENA_SERVICE_STATES } from "./types"

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isNullableString(value: unknown): value is string | null {
	return typeof value === "string" || value === null
}

function isNullableNumber(value: unknown): value is number | null {
	return typeof value === "number" || value === null
}

export function parseSerenaServiceStatusFile(content: string): SerenaServicePersistedStatus {
	const parsed = JSON.parse(content) as unknown

	if (!isRecord(parsed)) {
		throw new Error("Serena service status must be a JSON object")
	}

	if (!SERENA_SERVICE_STATES.includes(parsed.state as SerenaServiceStatus["state"])) {
		throw new Error("Serena service status has an invalid state")
	}

	if (typeof parsed.projectRoot !== "string") {
		throw new Error("Serena service status requires projectRoot")
	}

	if (!isNullableString(parsed.mcpUrl)) {
		throw new Error("Serena service status has an invalid mcpUrl")
	}

	if (!isNullableString(parsed.dashboardUrl)) {
		throw new Error("Serena service status has an invalid dashboardUrl")
	}

	if (!isNullableNumber(parsed.pid)) {
		throw new Error("Serena service status has an invalid pid")
	}

	if (
		parsed.startedBy !== null &&
		!SERENA_SERVICE_STARTED_BY.includes(parsed.startedBy as SerenaServiceStatus["startedBy"] & string)
	) {
		throw new Error("Serena service status has an invalid startedBy")
	}

	if (typeof parsed.openWebDashboard !== "boolean") {
		throw new Error("Serena service status has an invalid openWebDashboard")
	}

	if (!isNullableString(parsed.lastError)) {
		throw new Error("Serena service status has an invalid lastError")
	}

	if (!isNullableString(parsed.serenaHome)) {
		throw new Error("Serena service status has an invalid serenaHome")
	}

	if (typeof parsed.updatedAt !== "string") {
		throw new Error("Serena service status requires updatedAt")
	}

	const state = parsed.state as SerenaServiceStatus["state"]
	const startedBy = parsed.startedBy as SerenaServiceStatus["startedBy"]

	return {
		state,
		projectRoot: parsed.projectRoot,
		mcpUrl: parsed.mcpUrl,
		dashboardUrl: parsed.dashboardUrl,
		pid: parsed.pid,
		startedBy,
		openWebDashboard: parsed.openWebDashboard,
		lastError: parsed.lastError,
		serenaHome: parsed.serenaHome,
		updatedAt: parsed.updatedAt,
	}
}
