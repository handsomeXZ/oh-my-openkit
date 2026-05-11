import { resolve } from "node:path"
import { Command } from "commander"
import { getSerenaServiceStatus } from "./get-status"
import { probeSerenaDashboardUrl } from "./probe-dashboard-url"
import { readDashboardUrlFromWrapperLog } from "./read-wrapper-log"
import { registerSerenaServiceEnsureCommand, type RegisterSerenaServiceEnsureCommandDependencies } from "./register-ensure-command"
import { openSerenaServiceConsole, openSerenaServicePath, openSerenaServiceUrl } from "./open-target"
import { stopSerenaService } from "./stop-service"
import { resolveSerenaServiceStateDirectory, resolveSerenaServiceWrapperLogFilePath } from "./state-paths"

function writeJson(value: unknown, write: typeof process.stdout.write = process.stdout.write.bind(process.stdout)): void {
	write(`${JSON.stringify(value, null, 2)}\n`)
}

function writeError(message: string, write: typeof process.stderr.write = process.stderr.write.bind(process.stderr)): void {
	write(`${message}\n`)
}

function getWrapperLogPath(projectRoot: string, env: NodeJS.ProcessEnv = process.env): string {
	return resolveSerenaServiceWrapperLogFilePath(resolveSerenaServiceStateDirectory(projectRoot, env))
}

interface CreateSerenaServiceCommandDependencies {
	ensure?: RegisterSerenaServiceEnsureCommandDependencies
	service?: {
		getStatus?: typeof getSerenaServiceStatus
		openUrl?: typeof openSerenaServiceUrl
		probeDashboardUrl?: typeof probeSerenaDashboardUrl
		readDashboardUrlFromWrapperLog?: typeof readDashboardUrlFromWrapperLog
		stop?: typeof stopSerenaService
	}
	runtime?: {
		stdoutWrite?: typeof process.stdout.write
		stderrWrite?: typeof process.stderr.write
		exitProcess?: typeof process.exit
		env?: NodeJS.ProcessEnv
	}
}

export function createSerenaServiceCommand(deps: CreateSerenaServiceCommandDependencies = {}): Command {
	const serena = new Command("serena").description("Serena wrapper lifecycle commands")
	const service = new Command("service").description("Manage the project-scoped Serena HTTP service")
	const stdoutWrite = deps.runtime?.stdoutWrite ?? process.stdout.write.bind(process.stdout)
	const stderrWrite = deps.runtime?.stderrWrite ?? process.stderr.write.bind(process.stderr)
	const exitProcess = deps.runtime?.exitProcess ?? process.exit
	const env = deps.runtime?.env ?? process.env
	const getStatus = deps.service?.getStatus ?? getSerenaServiceStatus
	const openUrl = deps.service?.openUrl ?? openSerenaServiceUrl
	const probeDashboard = deps.service?.probeDashboardUrl ?? probeSerenaDashboardUrl
	const readDashboardUrl = deps.service?.readDashboardUrlFromWrapperLog ?? readDashboardUrlFromWrapperLog
	const stopService = deps.service?.stop ?? stopSerenaService

	registerSerenaServiceEnsureCommand(
		service,
		{
			writeJson: (value) => writeJson(value, stdoutWrite),
			writeError: (message) => writeError(message, stderrWrite),
			writeStdout: (message) => stdoutWrite(message),
		},
		{
			...deps.ensure,
			exitProcess: deps.ensure?.exitProcess ?? exitProcess,
			env: deps.ensure?.env ?? env,
		}
	)

	service
		.command("status")
		.description("Show the Serena service status for a project")
		.requiredOption("--project <path>", "Project root path")
		.option("--json", "Output machine-readable status")
		.action(async (options) => {
			const status = await getStatus(resolve(options.project), env)
			if (options.json) {
				writeJson(status, stdoutWrite)
			} else {
				stdoutWrite(`Serena service state: ${status.state}\n`)
			}
			exitProcess(0)
		})

	service
		.command("stop")
		.description("Stop the managed Serena service for a project")
		.requiredOption("--project <path>", "Project root path")
		.option("--json", "Output machine-readable status")
		.action(async (options) => {
			try {
				const status = await stopService(resolve(options.project), env)
				if (options.json) {
					writeJson(status, stdoutWrite)
				} else {
					stdoutWrite(`Serena service state: ${status.state}\n`)
				}
				exitProcess(0)
			} catch (error) {
				writeError(error instanceof Error ? error.message : String(error), stderrWrite)
				exitProcess(1)
			}
		})

	service
		.command("open-logs")
		.description("Open the Serena wrapper log file")
		.requiredOption("--project <path>", "Project root path")
		.action(async (options) => {
			const projectRoot = resolve(options.project)
			const logFilePath = getWrapperLogPath(projectRoot, env)
			await openSerenaServicePath(logFilePath)
			stdoutWrite(`${logFilePath}\n`)
			exitProcess(0)
		})

	service
		.command("open-web")
		.description("Open the Serena dashboard URL")
		.requiredOption("--project <path>", "Project root path")
		.action(async (options) => {
			const projectRoot = resolve(options.project)
			const status = await getStatus(projectRoot, env)
			let dashboardUrl = status.dashboardUrl
			if (dashboardUrl && !(await probeDashboard(dashboardUrl))) {
				dashboardUrl = null
			}

			if (!dashboardUrl) {
				dashboardUrl = await readDashboardUrl(getWrapperLogPath(projectRoot, env))
			}

			if (!dashboardUrl || !(await probeDashboard(dashboardUrl))) {
				writeError("Serena dashboard URL is not available yet", stderrWrite)
				exitProcess(1)
				return
			}

			await openUrl(dashboardUrl)
			stdoutWrite(`${dashboardUrl}\n`)
			exitProcess(0)
		})

	service
		.command("open-console")
		.description("Open a console window following the Serena wrapper log")
		.requiredOption("--project <path>", "Project root path")
		.action(async (options) => {
			const projectRoot = resolve(options.project)
			const logFilePath = getWrapperLogPath(projectRoot, env)
			await openSerenaServiceConsole(logFilePath)
			stdoutWrite(`${logFilePath}\n`)
			exitProcess(0)
		})

	serena.addCommand(service)
	return serena
}
