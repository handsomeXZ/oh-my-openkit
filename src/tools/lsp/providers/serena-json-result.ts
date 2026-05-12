function createTextPreview(value: string): string {
	const normalized = value.replace(/\s+/g, " ").trim()
	return normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized
}

function looksLikeJson(value: string): boolean {
	return value.startsWith("{") || value.startsWith("[")
}

export function parseJsonResult<T>(value: unknown, context = "Serena tool"): T {
	if (typeof value !== "string") {
		return value as T
	}

	const trimmed = value.trim()
	if (trimmed.length === 0) {
		throw new Error(`${context} returned an empty response instead of JSON`)
	}

	if (!looksLikeJson(trimmed)) {
		throw new Error(`${context} returned non-JSON text: ${createTextPreview(trimmed)}`)
	}

	try {
		return JSON.parse(trimmed) as T
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		throw new Error(`${context} returned invalid JSON: ${message}`)
	}
}
