const DEFAULT_DASHBOARD_PROBE_TIMEOUT_MS = 1500

interface ProbeSerenaDashboardUrlDependencies {
	fetchImpl?: typeof fetch
	timeoutMs?: number
}

export async function probeSerenaDashboardUrl(
	targetUrl: string,
	deps: ProbeSerenaDashboardUrlDependencies = {}
): Promise<boolean> {
	const timeoutMs = deps.timeoutMs ?? DEFAULT_DASHBOARD_PROBE_TIMEOUT_MS
	const controller = new AbortController()
	const timeout = setTimeout(() => controller.abort(), timeoutMs)

	try {
		const response = await (deps.fetchImpl ?? fetch)(targetUrl, {
			method: "GET",
			signal: controller.signal,
			redirect: "follow",
		})

		return response.ok
	} catch {
		return false
	} finally {
		clearTimeout(timeout)
	}
}
