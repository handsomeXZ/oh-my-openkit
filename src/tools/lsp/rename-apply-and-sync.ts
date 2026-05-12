import type { LSPClient } from "./client"
import { withManagedClient } from "./managed-client"
import type { RenameResult } from "./types"
import { applyRenameResult, type ApplyResult } from "./workspace-edit"

type RenameRouteProvider = "builtin" | "serena"

async function syncModifiedFiles(client: LSPClient, filePaths: string[]): Promise<void> {
  const uniqueFilePaths = [...new Set(filePaths)]
  await Promise.all(uniqueFilePaths.map((filePath) => client.openFile(filePath)))
}

export async function applyRenameAndSync(args: {
  edit: RenameResult
  entryFilePath: string
  routeProvider: RenameRouteProvider
}): Promise<ApplyResult> {
  const result = applyRenameResult(args.edit)

  if (!result.success || result.filesModified.length === 0 || args.routeProvider !== "builtin") {
    return result
  }

  try {
    await withManagedClient(args.entryFilePath, async (client) => {
      await syncModifiedFiles(client, result.filesModified)
    })
    return result
  } catch (error) {
    return {
      ...result,
      success: false,
      errors: [...result.errors, `Post-rename LSP sync failed: ${error instanceof Error ? error.message : String(error)}`],
    }
  }
}
