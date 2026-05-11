import { beforeEach, describe, expect, mock, test } from "bun:test"
import { resolve } from "node:path"
import { Command } from "commander"
import { createSerenaServiceCommand } from "./command"

const exitCodes: number[] = []
const stdoutWrites: string[] = []
const stderrWrites: string[] = []

function createStatus(projectRoot: string) {
	return {
		state: "mcp-ready" as const,
		projectRoot,
		mcpUrl: "http://127.0.0.1:9121/mcp",
		dashboardUrl: null,
		pid: 31337,
		startedBy: "ensure" as const,
		openWebDashboard: false,
		lastError: null,
		serenaHome: "C:/Users/Test/AppData/Local/serena-home",
		updatedAt: "2026-04-26T00:00:00.000Z",
	}
}

function createCommand(deps: Parameters<typeof createSerenaServiceCommand>[0]): Command {
	const command = createSerenaServiceCommand({
		...deps,
		runtime: {
			...deps.runtime,
			stdoutWrite: ((chunk: string | Uint8Array) => {
				stdoutWrites.push(String(chunk))
				return true
			}) as typeof process.stdout.write,
			stderrWrite: ((chunk: string | Uint8Array) => {
				stderrWrites.push(String(chunk))
				return true
			}) as typeof process.stderr.write,
			exitProcess: ((code?: number) => {
				exitCodes.push(code ?? 0)
				return undefined as never
			}) as typeof process.exit,
			env: deps.runtime?.env ?? process.env,
		},
	})
	command.exitOverride((error) => {
		exitCodes.push(error.exitCode)
		throw error
	})
	return command
}

async function runSerenaCli(args: string[], command: Command): Promise<void> {
	try {
		await command.parseAsync(args, { from: "user" })
	} catch (error) {
		if (error instanceof Error && "code" in error && typeof error.code === "string" && error.code.startsWith("commander.")) {
			return
		}
		throw error
	}
}

beforeEach(() => {
	exitCodes.length = 0
	stdoutWrites.length = 0
	stderrWrites.length = 0
})

describe("serena service ensure command", () => {
	test("#json #windows #when ensure succeeds #then it writes clean machine-readable status without launching a tray host", async () => {
		const projectRoot = String.raw`C:\Users\Test User\Repo Name`
		const resolvedProjectRoot = resolve(projectRoot)
		const status = createStatus(resolvedProjectRoot)
		const ensureService = mock(async () => status)
		const resolveSerenaCommand = mock(async () => ["uv", "run", "serena"])

		await runSerenaCli(
			["service", "ensure", "--project", projectRoot, "--json"],
			createCommand({
				ensure: {
					ensureService: ensureService as never,
					resolveSerenaCommand: resolveSerenaCommand as never,
				},
			})
		)

		expect(resolveSerenaCommand).toHaveBeenCalledWith(resolvedProjectRoot)
		expect(ensureService).toHaveBeenCalledWith(resolvedProjectRoot, process.env, { serenaCommand: ["uv", "run", "serena"] })
		expect(exitCodes).toEqual([0])
		expect(stderrWrites).toEqual([])
		expect(JSON.parse(stdoutWrites.join(""))).toEqual(status)
	})

	test("#interactive #windows #when ensure succeeds #then it does not emit tray warnings", async () => {
		const projectRoot = String.raw`C:\Users\Test User\Repo Name`
		const resolvedProjectRoot = resolve(projectRoot)
		const status = { ...createStatus(resolvedProjectRoot), state: "dashboard-ready" as const }
		const ensureService = mock(async () => status)

		await runSerenaCli(
			["service", "ensure", "--project", projectRoot],
			createCommand({
				ensure: {
					ensureService: ensureService as never,
					resolveSerenaCommand: mock(async () => ["uv", "run", "serena"]) as never,
				},
			})
		)

		expect(ensureService).toHaveBeenCalledWith(resolvedProjectRoot, process.env, { serenaCommand: ["uv", "run", "serena"] })
		expect(exitCodes).toEqual([0])
		expect(stdoutWrites.join("")).toBe("Serena service dashboard-ready at http://127.0.0.1:9121/mcp\n")
		expect(stderrWrites).toEqual([])
	})

	test("#json #when project config has extra required tools #then ensure receives the full service options", async () => {
		const projectRoot = String.raw`C:\Users\Test User\Repo Name`
		const resolvedProjectRoot = resolve(projectRoot)
		const status = createStatus(resolvedProjectRoot)
		const ensureService = mock(async () => status)
		const resolveSerenaServiceOptions = mock(async () => ({
			serenaCommand: ["uv", "run", "serena"],
			requiredTools: ["custom_serena_tool"],
		}))

		await runSerenaCli(
			["service", "ensure", "--project", projectRoot, "--json"],
			createCommand({
				ensure: {
					ensureService: ensureService as never,
					resolveSerenaServiceOptions: resolveSerenaServiceOptions as never,
				},
			})
		)

		expect(resolveSerenaServiceOptions).toHaveBeenCalledWith(resolvedProjectRoot)
		expect(ensureService).toHaveBeenCalledWith(resolvedProjectRoot, process.env, {
			serenaCommand: ["uv", "run", "serena"],
			requiredTools: ["custom_serena_tool"],
		})
		expect(exitCodes).toEqual([0])
	})
})
