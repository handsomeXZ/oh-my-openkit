import { existsSync, lstatSync, readdirSync, type Stats } from "fs"
import { extname, join, resolve } from "path"

import { findServerForExtension } from "./config"
import {
  diagnosticMatchesSeverityThreshold,
  resolveSerenaMinSeverity,
  type SerenaDiagnosticSeverity,
} from "./diagnostics-severity"
import { LSPClient } from "./lsp-client"
import { lspManager } from "./lsp-server"
import { formatServerLookupError } from "./server-lookup-error"
import { findWorkspaceRoot } from "./workspace-root-policy"
import { DEFAULT_MAX_DIRECTORY_FILES } from "./constants"
import { formatDirectoryDiagnostics, type DirectoryFileDiagnostic, type DirectoryFileError } from "./directory-diagnostics-format"
import type { Diagnostic } from "./types"

const SKIP_DIRECTORIES = new Set(["node_modules", ".git", "dist", "build", ".next", "out"])

type LoadFileDiagnostics = (filePath: string) => Promise<Diagnostic[]>

function collectFilesWithExtension(dir: string, extension: string, maxFiles: number): string[] {
  const files: string[] = []

  function walk(currentDir: string): void {
    if (files.length >= maxFiles) return

    let entries: string[] = []
    try {
      entries = readdirSync(currentDir)
    } catch {
      return
    }

    for (const entry of entries) {
      if (files.length >= maxFiles) return

      const fullPath = join(currentDir, entry)

      let stat: Stats | undefined
      try {
        stat = lstatSync(fullPath)
      } catch {
        continue
      }

      if (!stat || stat.isSymbolicLink()) {
        continue
      }

      if (stat.isDirectory()) {
        if (!SKIP_DIRECTORIES.has(entry)) {
          walk(fullPath)
        }
      } else if (stat.isFile()) {
        if (extname(fullPath) === extension) {
          files.push(fullPath)
        }
      }
    }
  }

  walk(dir)
  return files
}

export async function aggregateDiagnosticsForDirectory(
  directory: string,
  extension: string,
  severity?: "error" | "warning" | "information" | "hint" | "all",
  maxFiles: number = DEFAULT_MAX_DIRECTORY_FILES,
  minSeverity?: SerenaDiagnosticSeverity,
  loadFileDiagnostics?: LoadFileDiagnostics
): Promise<string> {
  if (!extension.startsWith(".")) {
    throw new Error(
      `Extension must start with a dot (e.g., ".ts", not "${extension}"). ` +
        `Use ".${extension}" instead.`
    )
  }

  const absDir = resolve(directory)
  if (!existsSync(absDir)) {
    throw new Error(`Directory does not exist: ${absDir}`)
  }

  const allFiles = collectFilesWithExtension(absDir, extension, maxFiles + 1)
  const wasCapped = allFiles.length > maxFiles
  const filesToProcess = allFiles.slice(0, maxFiles)

  if (filesToProcess.length === 0) {
    return [
      `Directory: ${absDir}`,
      `Extension: ${extension}`,
      `Files scanned: 0`,
      `No files found with extension "${extension}".`,
    ].join("\n")
  }

  const allDiagnostics: DirectoryFileDiagnostic[] = []
  const fileErrors: DirectoryFileError[] = []
  const severityThreshold = resolveSerenaMinSeverity(severity, minSeverity)

  if (loadFileDiagnostics) {
    for (const file of filesToProcess) {
      try {
        const result = await loadFileDiagnostics(file)
        const filtered = result.filter((diagnostic) => diagnosticMatchesSeverityThreshold(diagnostic.severity, severityThreshold))
        allDiagnostics.push(
          ...filtered.map((diagnostic) => ({
            filePath: file,
            diagnostic,
          }))
        )
      } catch (e) {
        fileErrors.push({
          file,
          error: e instanceof Error ? e.message : String(e),
        })
      }
    }

    return formatDirectoryDiagnostics(absDir, extension, filesToProcess.length, wasCapped, maxFiles, allDiagnostics, fileErrors)
  }

  const serverResult = findServerForExtension(extension)
  if (serverResult.status !== "found") {
    throw new Error(formatServerLookupError(serverResult))
  }

  const server = serverResult.server
  const root = findWorkspaceRoot(absDir, server.id)

  let client: LSPClient
  try {
    client = await lspManager.getClient(root, server)

    for (const file of filesToProcess) {
      try {
        const result = await client.diagnostics(file)
        const filtered = result.items.filter((diagnostic) => diagnosticMatchesSeverityThreshold(diagnostic.severity, severityThreshold))
        allDiagnostics.push(
          ...filtered.map((diagnostic) => ({
            filePath: file,
            diagnostic,
          }))
        )
      } catch (e) {
        fileErrors.push({
          file,
          error: e instanceof Error ? e.message : String(e),
        })
      }
    }
  } finally {
    lspManager.releaseClient(root, server.id)
  }

  return formatDirectoryDiagnostics(absDir, extension, filesToProcess.length, wasCapped, maxFiles, allDiagnostics, fileErrors)
}
