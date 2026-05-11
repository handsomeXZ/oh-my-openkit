import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import { probeSerenaDashboardUrl } from "./probe-dashboard-url"
import { readDashboardUrlFromWrapperLog } from "./read-wrapper-log"
import { waitForDelay } from "./wait"

const DEFAULT_READY_TIMEOUT_MS = 15000
const DEFAULT_READY_POLL_INTERVAL_MS = 250

export class SerenaServiceReadinessError extends Error {
	constructor(message: string, readonly state: "degraded" | "error") {
		super(message)
		this.name = "SerenaServiceReadinessError"
	}
}

export interface SerenaServiceReadinessResult {
	dashboardUrl: string | null
}

interface WaitForSerenaMcpReadyOptions {
	mcpUrl: string
	logFilePath: string
	requiredTools: readonly string[]
	timeoutMs?: number
	pollIntervalMs?: number
	ensureProcessAlive?: () => boolean
	createClient?: () => Client
	createTransport?: (mcpUrl: string) => StreamableHTTPClientTransport
	probeDashboardUrl?: (dashboardUrl: string) => Promise<boolean>
}

export async function waitForSerenaMcpReady(
	options: WaitForSerenaMcpReadyOptions
): Promise<SerenaServiceReadinessResult> {
	const deadline = Date.now() + (options.timeoutMs ?? DEFAULT_READY_TIMEOUT_MS)
	const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_READY_POLL_INTERVAL_MS
	let lastError = "Serena MCP readiness check did not complete"
	let dashboardUrl: string | null = null

	while (Date.now() <= deadline) {
		if (options.ensureProcessAlive && !options.ensureProcessAlive()) {
			throw new SerenaServiceReadinessError("Serena process exited before MCP became ready", "error")
		}

		dashboardUrl = await readDashboardUrlFromWrapperLog(options.logFilePath)

		const client = (options.createClient ?? (() => new Client({ name: "oh-my-opencode", version: "1.0.0" }, { capabilities: {} })))()
		const transport = (options.createTransport ?? ((mcpUrl) => new StreamableHTTPClientTransport(new URL(mcpUrl))))(options.mcpUrl)

		try {
			await client.connect(transport)
			const tools = await client.listTools()
			const availableTools = new Set(tools.tools.map((tool) => tool.name))
			const missingTools = options.requiredTools.filter((toolName) => !availableTools.has(toolName))

			if (missingTools.length > 0) {
				throw new SerenaServiceReadinessError(
					`Serena MCP missing required tools: ${missingTools.join(", ")}`,
					"degraded"
				)
			}

			if (dashboardUrl) {
				const isDashboardReachable = await (options.probeDashboardUrl ?? ((url) => probeSerenaDashboardUrl(url)))(dashboardUrl)
				return { dashboardUrl: isDashboardReachable ? dashboardUrl : null }
			}

			return { dashboardUrl: null }
		} catch (error) {
			lastError = error instanceof Error ? error.message : String(error)
			if (error instanceof SerenaServiceReadinessError && error.state === "degraded") {
				throw error
			}
		} finally {
			await client.close().catch(() => {})
			await transport.close().catch(() => {})
		}

		await waitForDelay(pollIntervalMs)
	}

	throw new SerenaServiceReadinessError(lastError, "error")
}
