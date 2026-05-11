import { beforeEach, describe, expect, mock, test } from "bun:test"
import { Command } from "commander"
import { resolve } from "node:path"
import { createSerenaServiceCommand } from "./command"

const exitCodes: number[] = []
const stdoutWrites: string[] = []
const stderrWrites: string[] = []

function configureCommandTree(command: Command): void {
	command.configureOutput({
		writeOut: (message) => {
			stdoutWrites.push(message)
		},
		writeErr: (message) => {
			stderrWrites.push(message)
		},
	})
	command.exitOverride((error) => {
		exitCodes.push(error.exitCode)
		throw error
	})
	for (const subcommand of command.commands) {
		configureCommandTree(subcommand)
	}
}

function createCommand(deps: Parameters<typeof createSerenaServiceCommand>[0] = {}): Command {
	const command = createSerenaServiceCommand({
		...deps,
		ensure: deps.ensure,
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
	configureCommandTree(command)
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

describe("serena service command", () => {
	test("#given CLI wiring #when command is created #then service commands exclude the removed tray host", () => {
		const serena = createCommand()
		const service = serena.commands.find((command: Command) => command.name() === "service")
		const names = service?.commands.map((command: Command) => command.name()) ?? []

		expect(names).toEqual(["ensure", "status", "stop", "open-logs", "open-web", "open-console"])
	})

	test("#given dashboard URL only exists in wrapper log #when open-web runs #then it probes and opens that URL", async () => {
		const projectRoot = resolve("D:/repo")
		const dashboardUrl = "http://127.0.0.1:24282/dashboard/index.html"
		const getStatus = mock(async () => ({
			state: "mcp-ready" as const,
			projectRoot,
			mcpUrl: "http://127.0.0.1:9121/mcp",
			dashboardUrl: null,
			pid: 123,
			startedBy: "ensure" as const,
			openWebDashboard: false,
			lastError: null,
			serenaHome: "D:/serena-home",
			updatedAt: "2026-05-09T00:00:00.000Z",
		}))
		const readDashboardUrlFromWrapperLog = mock(async () => dashboardUrl)
		const probeDashboardUrl = mock(async () => true)
		const openUrl = mock(async () => {})
		const command = createCommand({
			service: {
				getStatus,
				readDashboardUrlFromWrapperLog,
				probeDashboardUrl,
				openUrl,
			},
		})

		await runSerenaCli(["service", "open-web", "--project", projectRoot], command)

		expect(getStatus).toHaveBeenCalledWith(projectRoot, process.env)
		expect(readDashboardUrlFromWrapperLog).toHaveBeenCalledTimes(1)
		expect(probeDashboardUrl).toHaveBeenCalledWith(dashboardUrl)
		expect(openUrl).toHaveBeenCalledWith(dashboardUrl)
		expect(stdoutWrites.join("")).toBe(`${dashboardUrl}\n`)
		expect(exitCodes).toEqual([0])
	})
})
