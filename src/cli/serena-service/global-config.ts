import { EOL } from "node:os"
import { SERENA_LSP_REQUIRED_TOOLS } from "../../shared/serena-lsp-required-tools"

export const SERENA_SERVICE_CONTEXT = "ide" as const
export const SERENA_SERVICE_FIXED_TOOLS = SERENA_LSP_REQUIRED_TOOLS
export const SERENA_SERVICE_BASE_MODES = ["no-onboarding", "no-memories"] as const
export const SERENA_SERVICE_DEFAULT_MODES = ["interactive", "editing"] as const
export const SERENA_SERVICE_PROJECT_SERENA_FOLDER_LOCATION = "$projectDir/.serena"

export interface SerenaServiceGlobalConfig {
	web_dashboard: boolean
	web_dashboard_open_on_launch: boolean
	gui_log_window: boolean
	web_dashboard_listen_address: string
	fixed_tools: readonly string[]
	base_modes: readonly string[]
	default_modes: readonly string[]
	project_serena_folder_location: string
	projects: readonly string[]
}

export function createSerenaServiceGlobalConfig(): SerenaServiceGlobalConfig {
	return {
		web_dashboard: true,
		web_dashboard_open_on_launch: false,
		gui_log_window: false,
		web_dashboard_listen_address: "127.0.0.1",
		fixed_tools: SERENA_SERVICE_FIXED_TOOLS,
		base_modes: SERENA_SERVICE_BASE_MODES,
		default_modes: SERENA_SERVICE_DEFAULT_MODES,
		project_serena_folder_location: SERENA_SERVICE_PROJECT_SERENA_FOLDER_LOCATION,
		projects: [],
	}
}

export function createSerenaServiceGlobalConfigContent(): string {
	return [
		"web_dashboard: True",
		"web_dashboard_open_on_launch: False",
		"gui_log_window: False",
		"web_dashboard_listen_address: 127.0.0.1",
		"fixed_tools:",
		...SERENA_SERVICE_FIXED_TOOLS.map((tool) => `  - ${tool}`),
		"base_modes:",
		...SERENA_SERVICE_BASE_MODES.map((mode) => `  - ${mode}`),
		"default_modes:",
		...SERENA_SERVICE_DEFAULT_MODES.map((mode) => `  - ${mode}`),
		`project_serena_folder_location: \"${SERENA_SERVICE_PROJECT_SERENA_FOLDER_LOCATION}\"`,
		"projects: []",
		"",
	].join(EOL)
}
