import { extname, resolve } from "path"

import { lspManager, LSPClient } from "./client"
import { findServerForExtension } from "./config"
import { isDirectoryPath } from "./file-path-utils"
import { formatServerLookupError } from "./server-lookup-error"
import { findWorkspaceRoot } from "./workspace-root-policy"

export async function withManagedClient<T>(filePath: string, fn: (client: LSPClient, absPath: string) => Promise<T>): Promise<T> {
  const absPath = resolve(filePath)

  if (isDirectoryPath(absPath)) {
    throw new Error(
      "Directory paths are not supported by this LSP tool. Use lsp_diagnostics with the 'extension' parameter for directory diagnostics."
    )
  }

  const result = findServerForExtension(extname(absPath))
  if (result.status !== "found") {
    throw new Error(formatServerLookupError(result))
  }

  const root = findWorkspaceRoot(absPath, result.server.id)
  const client = await lspManager.getClient(root, result.server)

  try {
    return await fn(client, absPath)
  } catch (error) {
    if (error instanceof Error && error.message.includes("timeout") && lspManager.isServerInitializing(root, result.server.id)) {
      throw new Error(`LSP server is still initializing. Please retry in a few seconds. Original error: ${error.message}`)
    }
    throw error
  } finally {
    lspManager.releaseClient(root, result.server.id)
  }
}
