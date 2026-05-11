import { existsSync } from "fs"
import { dirname, join, resolve } from "path"

import { isDirectoryPath } from "./file-path-utils"

const DEFAULT_WORKSPACE_MARKERS = [".git", "package.json", "pyproject.toml", "Cargo.toml", "go.mod", "pom.xml", "build.gradle"]
const CLANGD_WORKSPACE_MARKERS = ["compile_commands.json", "compile_flags.txt", ".clangd"]

function findNearestWorkspaceMarker(startDir: string, markers: string[]): string | null {
  let dir = startDir
  let prevDir = ""

  while (dir !== prevDir) {
    for (const marker of markers) {
      if (existsSync(join(dir, marker))) {
        return dir
      }
    }
    prevDir = dir
    dir = dirname(dir)
  }

  return null
}

export function findWorkspaceRoot(filePath: string, serverId?: string): string {
  let dir = resolve(filePath)

  if (!existsSync(dir) || !isDirectoryPath(dir)) {
    dir = dirname(dir)
  }

  if (serverId === "clangd") {
    const clangdRoot = findNearestWorkspaceMarker(dir, CLANGD_WORKSPACE_MARKERS)
    if (clangdRoot) {
      return clangdRoot
    }
  }

  const defaultRoot = findNearestWorkspaceMarker(dir, DEFAULT_WORKSPACE_MARKERS)
  if (defaultRoot) {
    return defaultRoot
  }

  return dirname(resolve(filePath))
}
