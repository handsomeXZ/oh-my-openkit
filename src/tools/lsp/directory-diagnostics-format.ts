import { DEFAULT_MAX_DIAGNOSTICS } from "./constants"
import { formatDiagnostic } from "./lsp-formatters"
import type { Diagnostic } from "./types"

export type DirectoryFileDiagnostic = {
  filePath: string
  diagnostic: Diagnostic
}

export type DirectoryFileError = {
  file: string
  error: string
}

export function formatDirectoryDiagnostics(
  absDir: string,
  extension: string,
  scannedFileCount: number,
  wasCapped: boolean,
  maxFiles: number,
  allDiagnostics: DirectoryFileDiagnostic[],
  fileErrors: DirectoryFileError[]
): string {
  const displayDiagnostics = allDiagnostics.slice(0, DEFAULT_MAX_DIAGNOSTICS)
  const wasDiagCapped = allDiagnostics.length > DEFAULT_MAX_DIAGNOSTICS

  const lines: string[] = [
    `Directory: ${absDir}`,
    `Extension: ${extension}`,
    `Files scanned: ${scannedFileCount}${wasCapped ? ` (capped at ${maxFiles})` : ""}`,
    `Files with errors: ${fileErrors.length}`,
    `Total diagnostics: ${allDiagnostics.length}`,
  ]

  if (fileErrors.length > 0) {
    lines.push("", "File processing errors:")
    for (const { file, error } of fileErrors) {
      lines.push(`  ${file}: ${error}`)
    }
  }

  if (displayDiagnostics.length > 0) {
    lines.push("")
    for (const { filePath, diagnostic } of displayDiagnostics) {
      lines.push(`${filePath}: ${formatDiagnostic(diagnostic)}`)
    }
    if (wasDiagCapped) {
      lines.push("", `... (${allDiagnostics.length - DEFAULT_MAX_DIAGNOSTICS} more diagnostics not shown)`)
    }
  }

  return lines.join("\n")
}
