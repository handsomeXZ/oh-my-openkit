import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { SERENA_SERVICE_FIXED_TOOLS } from "./global-config"
import { waitForSerenaMcpReady } from "./wait-for-mcp-ready"

function createToolList() {
	return SERENA_SERVICE_FIXED_TOOLS.map((name) => ({ name }))
}

describe("waitForSerenaMcpReady", () => {
	let tempDir: string
	let logFilePath: string

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "serena-service-ready-"))
		logFilePath = join(tempDir, "wrapper.log")
	})

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true })
	})

	test("#given stderr flood fills the wrapper log #when MCP becomes ready #then readiness still returns the dashboard URL without hanging", async () => {
		const noisyLog = Array.from({ length: 4000 }, (_value, index) => `stderr line ${index}`).join("\n")
		await writeFile(
			logFilePath,
			`${noisyLog}\nSerena web dashboard started at http://127.0.0.1:24282/dashboard/index.html\n`,
			"utf8"
		)

		const connect = mock(async () => {})
		const listTools = mock(async () => ({
			tools: createToolList(),
		}))
		const closeClient = mock(async () => {})
		const closeTransport = mock(async () => {})

		const readiness = await waitForSerenaMcpReady({
			mcpUrl: "http://127.0.0.1:9121/mcp",
			logFilePath,
			requiredTools: SERENA_SERVICE_FIXED_TOOLS,
			timeoutMs: 50,
			pollIntervalMs: 1,
			probeDashboardUrl: async () => true,
			createClient: () =>
				({
					connect,
					listTools,
					close: closeClient,
				}) as never,
			createTransport: () =>
				({
					close: closeTransport,
				}) as never,
		})

		expect(readiness.dashboardUrl).toBe("http://127.0.0.1:24282/dashboard/index.html")
		expect(connect).toHaveBeenCalledTimes(1)
		expect(listTools).toHaveBeenCalledTimes(1)
		expect(closeClient).toHaveBeenCalledTimes(1)
		expect(closeTransport).toHaveBeenCalledTimes(1)
	})

	test("#given multiple dashboard URLs in wrapper log #when MCP becomes ready #then readiness returns the latest reachable dashboard URL", async () => {
		await writeFile(
			logFilePath,
			[
				"Serena web dashboard started at http://127.0.0.1:24282/dashboard/index.html",
				"later logs",
				"Serena web dashboard started at http://127.0.0.1:24283/dashboard/index.html",
			].join("\n"),
			"utf8"
		)

		const readiness = await waitForSerenaMcpReady({
			mcpUrl: "http://127.0.0.1:9121/mcp",
			logFilePath,
			requiredTools: SERENA_SERVICE_FIXED_TOOLS,
			timeoutMs: 50,
			pollIntervalMs: 1,
			createClient: () =>
				({
					connect: async () => {},
					listTools: async () => ({
						tools: createToolList(),
					}),
					close: async () => {},
				}) as never,
			createTransport: () => ({ close: async () => {} }) as never,
			probeDashboardUrl: async (dashboardUrl) => dashboardUrl.includes(":24283/"),
		})

		expect(readiness.dashboardUrl).toBe("http://127.0.0.1:24283/dashboard/index.html")
	})

	test("#given Serena is missing P1 MCP tools #when readiness checks capabilities #then it reports degraded readiness", async () => {
		await writeFile(logFilePath, "Serena web dashboard started at http://127.0.0.1:24282/dashboard/index.html\n", "utf8")

		const readiness = waitForSerenaMcpReady({
			mcpUrl: "http://127.0.0.1:9121/mcp",
			logFilePath,
			requiredTools: SERENA_SERVICE_FIXED_TOOLS,
			timeoutMs: 50,
			pollIntervalMs: 1,
			createClient: () =>
				({
					connect: async () => {},
					listTools: async () => ({
						tools: [{ name: "find_symbol" }, { name: "get_symbols_overview" }],
					}),
					close: async () => {},
				}) as never,
			createTransport: () => ({ close: async () => {} }) as never,
		})

		await expect(readiness).rejects.toMatchObject({
			state: "degraded",
			message: "Serena MCP missing required tools: find_declaration, find_referencing_symbols, get_diagnostics_for_file, rename_symbol",
		})
	})
})
