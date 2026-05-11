import { randomUUID } from "node:crypto"
import { createSerenaServiceProjectHash } from "./state-paths"

export function createSerenaServiceOwnerId(projectRoot: string): string {
	return `serena-service:${createSerenaServiceProjectHash(projectRoot)}:${randomUUID()}`
}
