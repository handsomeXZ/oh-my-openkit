import { readFile } from "node:fs/promises"

import type { LspPositionArgs } from "../provider-types"

import { getBodyRange, getSelectionRange } from "./serena-symbol-formatters"
import type { SerenaOverviewGrouped, SerenaSymbol } from "./serena-symbol-types"

const IDENTIFIER_CHAR_REGEX = /[A-Za-z0-9_:~]/

export function toRelativePath(projectRoot: string, filePath: string): string {
  const normalizedRoot = projectRoot.replace(/\\/g, "/").replace(/\/$/, "")
  const normalizedFilePath = filePath.replace(/\\/g, "/")

  if (normalizedFilePath.startsWith(`${normalizedRoot}/`)) {
    return normalizedFilePath.slice(normalizedRoot.length + 1)
  }

  return normalizedFilePath === normalizedRoot ? "" : filePath
}

export function deduplicateSymbols(symbols: SerenaSymbol[]): SerenaSymbol[] {
  const seen = new Set<string>()
  return symbols.filter((symbol) => {
    const key = [
      symbol.name_path ?? "",
      symbol.kind ?? "",
      symbol.relative_path ?? symbol.location?.relative_path ?? "",
      symbol.body_location?.start_line ?? symbol.location?.line ?? -1,
      symbol.body_location?.end_line ?? symbol.location?.line ?? -1,
    ].join("|")

    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}

export function extractNamePathsFromGroupedOverview(
  overview: SerenaOverviewGrouped,
  parentPath = ""
): string[] {
  const results: string[] = []

  for (const value of Object.values(overview)) {
    if (!Array.isArray(value)) {
      continue
    }

    for (const item of value) {
      if (typeof item === "string") {
        results.push(parentPath ? `${parentPath}/${item}` : item)
        continue
      }

      if (!item || typeof item !== "object") {
        continue
      }

      for (const [name, childValue] of Object.entries(item)) {
        const currentPath = parentPath ? `${parentPath}/${name}` : name
        results.push(currentPath)
        if (childValue && typeof childValue === "object") {
          results.push(...extractNamePathsFromGroupedOverview(childValue as SerenaOverviewGrouped, currentPath))
        }
      }
    }
  }

  return results
}

export function flattenSymbols(symbols: SerenaSymbol[]): SerenaSymbol[] {
  const result: SerenaSymbol[] = []
  const visit = (symbol: SerenaSymbol) => {
    result.push(symbol)
    for (const child of symbol.children ?? []) {
      visit(child)
    }
  }
  for (const symbol of symbols) {
    visit(symbol)
  }
  return result
}

export function findInnermostSymbolAtPosition(
  symbols: SerenaSymbol[],
  line: number,
  character: number
): SerenaSymbol | null {
  const matches = flattenSymbols(symbols).filter((symbol) => {
    const range = getBodyRange(symbol)
    if (line < range.start.line || line > range.end.line) {
      return false
    }
    if (line === range.start.line && character < range.start.character) {
      return false
    }
    return !(line === range.end.line && character > range.end.character)
  })

  matches.sort((left, right) => {
    const leftSpan = (left.body_location?.end_line ?? left.location?.line ?? 0) - (left.body_location?.start_line ?? left.location?.line ?? 0)
    const rightSpan = (right.body_location?.end_line ?? right.location?.line ?? 0) - (right.body_location?.start_line ?? right.location?.line ?? 0)
    return leftSpan - rightSpan
  })

  return matches[0] ?? null
}

export function isNearSymbolDeclaration(symbol: SerenaSymbol, args: LspPositionArgs): boolean {
  const line = args.line - 1
  const character = args.character
  const selectionRange = getSelectionRange(symbol)
  if (line !== selectionRange.start.line) {
    return false
  }

  return character >= selectionRange.start.character && character <= selectionRange.end.character
}

function isIdentifierChar(character: string | undefined): boolean {
  return character != null && IDENTIFIER_CHAR_REGEX.test(character)
}

function extractTokenAtCharacter(lineText: string, character: number): string | null {
  if (lineText.length === 0) {
    return null
  }

  let cursor = Math.min(Math.max(character, 0), lineText.length - 1)

  if (!isIdentifierChar(lineText[cursor]) && isIdentifierChar(lineText[cursor - 1])) {
    cursor -= 1
  }

  if (!isIdentifierChar(lineText[cursor]) && isIdentifierChar(lineText[cursor + 1])) {
    cursor += 1
  }

  if (!isIdentifierChar(lineText[cursor])) {
    return null
  }

  let start = cursor
  let end = cursor

  while (start > 0 && isIdentifierChar(lineText[start - 1])) {
    start -= 1
  }

  while (end + 1 < lineText.length && isIdentifierChar(lineText[end + 1])) {
    end += 1
  }

  return lineText.slice(start, end + 1)
}

export async function extractNamePathCandidatesFromFile(
  filePath: string,
  line: number,
  character: number
): Promise<string[]> {
  const content = await readFile(filePath, "utf8")
  const lines = content.split(/\r?\n/)
  const lineText = lines[line - 1] ?? ""
  const token = extractTokenAtCharacter(lineText, character)
  if (!token) {
    return []
  }

  const candidates = new Set<string>()
  candidates.add(token)

  if (token.includes("::")) {
    candidates.add(token.replace(/::/g, "/"))
    const segments = token.split("::").filter(Boolean)
    const lastSegment = segments.at(-1)
    if (lastSegment) {
      candidates.add(lastSegment)
    }
  }

  return [...candidates]
}
