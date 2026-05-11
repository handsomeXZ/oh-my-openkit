import { readFile } from "node:fs/promises"

const DASHBOARD_URL_REGEX = /Serena web dashboard started at\s+(https?:\/\/\S+)/gi

export async function readSerenaServiceWrapperLog(logFilePath: string): Promise<string> {
	try {
		return await readFile(logFilePath, "utf8")
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return ""
		}

		throw error
	}
}

export function parseDashboardUrlFromWrapperLog(content: string): string | null {
	const matches = Array.from(content.matchAll(DASHBOARD_URL_REGEX))
	return matches.at(-1)?.[1] ?? null
}

export async function readDashboardUrlFromWrapperLog(logFilePath: string): Promise<string | null> {
	const content = await readSerenaServiceWrapperLog(logFilePath)
	return parseDashboardUrlFromWrapperLog(content)
}
