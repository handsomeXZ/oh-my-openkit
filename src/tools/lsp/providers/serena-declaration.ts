import type { LspPositionArgs } from "../provider-types"
import type { Location, LocationLink } from "../types"
import { pathToUri } from "../file-path-utils"

import { createDeclarationQuery, createDeclarationRegex } from "./serena-declaration-query"
import { preferRequestedToken } from "./serena-declaration-token-filter"
import { getSelectionRange, toAbsolutePath } from "./serena-symbol-formatters"
import { parseJsonResult } from "./serena-json-result"
import type { SerenaLspProviderConfig, SerenaSymbol } from "./serena-symbol-types"
import { toRelativePath } from "./serena-symbol-lookup"
import { filterDefinitionSymbols } from "./serena-definition-candidates"

export { createDeclarationQuery, createDeclarationRegex }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isDeclarationSymbolRecord(value: Record<string, unknown>): boolean {
  return (
    typeof value.name === "string" ||
    typeof value.name_path === "string" ||
    typeof value.kind === "string" ||
    isRecord(value.location) ||
    isRecord(value.body_location)
  )
}

function collectDeclarationSymbols(value: unknown, symbols: SerenaSymbol[]): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectDeclarationSymbols(item, symbols)
    }
    return
  }

  if (!isRecord(value)) {
    return
  }

  if (isDeclarationSymbolRecord(value)) {
    symbols.push(value as SerenaSymbol)
    return
  }

  for (const child of Object.values(value)) {
    collectDeclarationSymbols(child, symbols)
  }
}

function normalizeDeclarationResult(result: unknown): SerenaSymbol[] {
  const parsed = parseJsonResult<unknown>(result, "Serena find_declaration")
  const symbols: SerenaSymbol[] = []
  collectDeclarationSymbols(parsed, symbols)
  return filterDefinitionSymbols(symbols)
}

function convertDeclarationToLocation(projectRoot: string, symbol: SerenaSymbol): Location | null {
  const locationRelativePath = symbol.location?.relative_path ?? symbol.relative_path
  if (symbol.location && locationRelativePath) {
    return {
      uri: pathToUri(toAbsolutePath(projectRoot, locationRelativePath)),
      range: getSelectionRange(symbol),
    }
  }

  const relativePath = symbol.relative_path
  const startLine = symbol.body_location?.start_line
  if (!relativePath || startLine == null) {
    return null
  }

  return {
    uri: pathToUri(toAbsolutePath(projectRoot, relativePath)),
    range: {
      start: { line: startLine, character: 0 },
      end: { line: startLine, character: 0 },
    },
  }
}

export async function findSerenaDeclaration(
  config: SerenaLspProviderConfig,
  args: LspPositionArgs,
  callTool: (toolName: string, args: Record<string, unknown>) => Promise<unknown>
): Promise<Location | Location[] | LocationLink[] | null> {
  const query = await createDeclarationQuery(args)
  if (!query) {
    return null
  }

  const relativePath = toRelativePath(config.projectRoot, args.filePath)
  const result = await callTool("find_declaration", {
    relative_path: relativePath,
    regex: query.regex,
    include_body: false,
    include_info: false,
  })
  const locations = preferRequestedToken(normalizeDeclarationResult(result), query.token)
    .map((symbol) => convertDeclarationToLocation(config.projectRoot, symbol))
    .filter((location): location is Location => location !== null)

  if (locations.length === 0) {
    return null
  }
  return locations.length === 1 ? locations[0] : locations
}
