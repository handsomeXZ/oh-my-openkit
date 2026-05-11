import { existsSync, statSync } from "fs"
import { fileURLToPath, pathToFileURL } from "node:url"

export function isDirectoryPath(filePath: string): boolean {
  if (!existsSync(filePath)) {
    return false
  }
  return statSync(filePath).isDirectory()
}

export function uriToPath(uri: string): string {
  if (!uri.startsWith("file:")) {
    return uri
  }

  const legacyWindowsFileUri = uri.match(/^file:\/\/([A-Za-z]:\/.*)$/)
  if (legacyWindowsFileUri) {
    return legacyWindowsFileUri[1].replace(/\//g, "\\")
  }

  return fileURLToPath(uri)
}

export function pathToUri(filePath: string): string {
  const normalizedPath = filePath.replace(/\\/g, "/")
  const windowsPath = normalizedPath.match(/^([A-Za-z]:\/.*)$/)
  if (windowsPath) {
    return new URL(`file:///${windowsPath[1]}`).href
  }

  return pathToFileURL(filePath).href
}
