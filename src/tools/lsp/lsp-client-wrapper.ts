import type { LSPClient } from "./client"
import { isDirectoryPath, uriToPath } from "./file-path-utils"
import { withManagedClient } from "./managed-client"
import { formatServerLookupError } from "./server-lookup-error"
import { findWorkspaceRoot } from "./workspace-root-policy"

export { isDirectoryPath, uriToPath, findWorkspaceRoot, formatServerLookupError }

export async function withLspClient<T>(filePath: string, fn: (client: LSPClient) => Promise<T>): Promise<T> {
  return withManagedClient(filePath, (client) => fn(client))
}
