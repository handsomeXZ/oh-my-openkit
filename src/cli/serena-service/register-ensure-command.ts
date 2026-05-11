import { resolve } from "node:path"
import type { Command } from "commander"
import { ensureSerenaService } from "./ensure-service"
import { resolveProjectSerenaCommand, resolveProjectSerenaServiceOptions } from "./resolve-project-serena-command"

interface SerenaServiceEnsureCommandIo {
	writeJson(value: unknown): void
	writeError(message: string): void
	writeStdout(message: string): void
}

interface RegisterSerenaServiceEnsureCommandDependencies {
	ensureService?: typeof ensureSerenaService
	resolveSerenaCommand?: typeof resolveProjectSerenaCommand
	resolveSerenaServiceOptions?: typeof resolveProjectSerenaServiceOptions
	exitProcess?: typeof process.exit
	env?: NodeJS.ProcessEnv
}

function formatError(error: unknown): string {
	return error instanceof Error ? error.message : String(error)
}

export function registerSerenaServiceEnsureCommand(
	service: Command,
	io: SerenaServiceEnsureCommandIo,
	deps: RegisterSerenaServiceEnsureCommandDependencies = {}
): void {
	const exitProcess = deps.exitProcess ?? process.exit
	const env = deps.env ?? process.env

	service
		.command("ensure")
		.description("Ensure the Serena HTTP service is running for a project")
		.requiredOption("--project <path>", "Project root path")
		.option("--json", "Output machine-readable status")
		.action(async (options) => {
			try {
				const projectRoot = resolve(options.project)
				const serenaOptions = deps.resolveSerenaCommand
					? { serenaCommand: await deps.resolveSerenaCommand(projectRoot) }
					: await (deps.resolveSerenaServiceOptions ?? resolveProjectSerenaServiceOptions)(projectRoot)
				const status = await (deps.ensureService ?? ensureSerenaService)(projectRoot, env, serenaOptions)

				if (options.json) {
					io.writeJson(status)
					exitProcess(0)
					return
				}

				io.writeStdout(`Serena service ${status.state} at ${status.mcpUrl ?? "unknown"}\n`)
				exitProcess(0)
			} catch (error) {
				io.writeError(formatError(error))
				exitProcess(1)
			}
		})
}

export type { RegisterSerenaServiceEnsureCommandDependencies }
