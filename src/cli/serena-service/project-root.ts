import { resolve } from "node:path"

export function normalizeSerenaProjectRoot(projectRoot: string): string {
	return resolve(projectRoot).replace(/\\/g, "/")
}

export function createSerenaProjectRootComparisonKey(projectRoot: string): string {
	const normalizedProjectRoot = normalizeSerenaProjectRoot(projectRoot)

	if (process.platform === "win32") {
		return normalizedProjectRoot.toLowerCase()
	}

	return normalizedProjectRoot
}
