import type { DocumentSymbol, Location, SymbolInfo } from "../types"
import { pathToUri } from "../file-path-utils"

import { SERENA_SYMBOL_KIND_MAP, type SerenaSymbol } from "./serena-symbol-types"

const OVERLOAD_SUFFIX_REGEX = /\[\d+\]$/
const GENERATED_BODY_NAME = "GENERATED_BODY"

export function getKindNumber(kind?: string): number {
  if (!kind) {
    return 13
  }
  return SERENA_SYMBOL_KIND_MAP[kind] ?? 13
}

export function extractDisplayName(symbol: SerenaSymbol): string {
  if (symbol.name && symbol.name.trim().length > 0) {
    return symbol.name
  }

  const namePath = symbol.name_path?.trim()
  if (!namePath) {
    return "unknown"
  }

  const normalizedNamePath = namePath.replace(/::/g, "/")
  const lastSegment = normalizedNamePath.split("/").filter(Boolean).pop()
  if (!lastSegment) {
    return namePath
  }

  return lastSegment.replace(OVERLOAD_SUFFIX_REGEX, "")
}

export function getSelectionRange(symbol: SerenaSymbol) {
  const line = symbol.location?.line ?? symbol.body_location?.start_line ?? 0
  const character = symbol.location?.column ?? 0
  const displayName = extractDisplayName(symbol)

  return {
    start: { line, character },
    end: { line, character: character + Math.max(displayName.length, 1) },
  }
}

export function getBodyRange(symbol: SerenaSymbol) {
  const startLine = symbol.body_location?.start_line ?? symbol.location?.line ?? 0
  const endLine = symbol.body_location?.end_line ?? startLine

  return {
    start: { line: startLine, character: 0 },
    end: { line: endLine, character: 0 },
  }
}

export function toAbsolutePath(projectRoot: string, relativePath?: string | null): string {
  const normalizedRelativePath = (relativePath ?? "").replace(/\\/g, "/")
  const normalizedRoot = projectRoot.replace(/\\/g, "/").replace(/\/$/, "")
  return `${normalizedRoot}/${normalizedRelativePath}`
}

export function convertToLocation(projectRoot: string, symbol: SerenaSymbol): Location {
  return {
    uri: pathToUri(toAbsolutePath(projectRoot, symbol.location?.relative_path ?? symbol.relative_path)),
    range: getSelectionRange(symbol),
  }
}

export function convertToSymbolInfo(projectRoot: string, symbol: SerenaSymbol): SymbolInfo {
  return {
    name: extractDisplayName(symbol),
    kind: getKindNumber(symbol.kind),
    location: convertToLocation(projectRoot, symbol),
    containerName: symbol.containerName,
  }
}

function isGeneratedBodySymbol(symbol: SerenaSymbol): boolean {
  return symbol.name_path?.includes(`/${GENERATED_BODY_NAME}`) ?? false
}

function normalizeGroupedChildren(
  parentNamePath: string | undefined,
  children: SerenaSymbol["children"] | Record<string, unknown> | undefined
): SerenaSymbol[] {
  if (Array.isArray(children)) {
    return children
  }

  if (!children || typeof children !== "object") {
    return []
  }

  const result: SerenaSymbol[] = []

  for (const [kind, entries] of Object.entries(children)) {
    if (!Array.isArray(entries)) {
      continue
    }

    for (const entry of entries) {
      if (!entry || typeof entry !== "object") {
        continue
      }

      const symbolEntry = entry as SerenaSymbol
      const childName = symbolEntry.name ?? "unknown"
      result.push({
        ...symbolEntry,
        kind: symbolEntry.kind ?? kind,
        name_path: symbolEntry.name_path ?? (parentNamePath ? `${parentNamePath}/${childName}` : childName),
        children: normalizeGroupedChildren(
          symbolEntry.name_path ?? (parentNamePath ? `${parentNamePath}/${childName}` : childName),
          symbolEntry.children as SerenaSymbol["children"] | Record<string, unknown> | undefined
        ),
      })
    }
  }

  return result
}

export function normalizeSymbolTree(symbol: SerenaSymbol): SerenaSymbol {
  const normalizedChildren = normalizeGroupedChildren(symbol.name_path, symbol.children as SerenaSymbol["children"])

  return {
    ...symbol,
    children: normalizedChildren.map((child) => normalizeSymbolTree(child)),
  }
}

function sanitizeDocumentSymbolTree(symbol: SerenaSymbol, topLevel = false): SerenaSymbol | null {
  if (!topLevel && isGeneratedBodySymbol(symbol)) {
    return null
  }

  const normalizedChildren = normalizeSymbolTree(symbol).children ?? []

  return {
    ...symbol,
    children: normalizedChildren
      .map((child) => sanitizeDocumentSymbolTree(child))
      .filter((child): child is SerenaSymbol => child !== null),
  }
}

export function convertToDocumentSymbol(symbol: SerenaSymbol): DocumentSymbol {
  return {
    name: extractDisplayName(symbol),
    kind: getKindNumber(symbol.kind),
    range: getBodyRange(symbol),
    selectionRange: getSelectionRange(symbol),
    children: symbol.children?.map((child) => convertToDocumentSymbol(child)),
  }
}

export function sanitizeDocumentSymbols(symbols: SerenaSymbol[]): SerenaSymbol[] {
  return symbols
    .filter((symbol) => !symbol.name_path?.includes("/"))
    .map((symbol) => sanitizeDocumentSymbolTree(symbol, true))
    .filter((symbol): symbol is SerenaSymbol => symbol !== null)
}
