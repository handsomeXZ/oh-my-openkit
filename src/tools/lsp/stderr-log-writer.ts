import { appendFileSync, mkdirSync } from "node:fs"
import { dirname, isAbsolute, relative, resolve, sep } from "node:path"

export function resolveWorkspaceRelativeLogPath(root: string, logPath: string): string {
  if (isAbsolute(logPath)) {
    throw new Error(`LSP stderr log path must be workspace-relative: ${logPath}`)
  }

  const absoluteRoot = resolve(root)
  const absoluteLogPath = resolve(absoluteRoot, logPath)
  const relativePath = relative(absoluteRoot, absoluteLogPath)

  if (relativePath === "" || relativePath === "." || relativePath.startsWith("..") || relativePath.includes(`..${sep}`)) {
    throw new Error(`LSP stderr log path must stay within the workspace: ${logPath}`)
  }

  return absoluteLogPath
}

export function appendLspStderrLog(root: string, logPath: string, text: string): void {
  const absoluteLogPath = resolveWorkspaceRelativeLogPath(root, logPath)
  mkdirSync(dirname(absoluteLogPath), { recursive: true })
  appendFileSync(absoluteLogPath, text, "utf-8")
}
