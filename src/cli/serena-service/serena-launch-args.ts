export function buildSerenaArgs(projectRoot: string, port: number, command: string[]): string[] {
	return [
		...command.slice(1),
		"start-mcp-server",
		"--transport",
		"streamable-http",
		"--host",
		"127.0.0.1",
		"--port",
		String(port),
		"--context",
		"ide",
		"--project",
		projectRoot,
		"--enable-web-dashboard",
		"True",
		"--open-web-dashboard",
		"False",
		"--enable-gui-log-window",
		"False",
	]
}
