import type { FindReferencesArgs } from "../provider-types"
import type { Location, Range } from "../types"
import { pathToUri } from "../file-path-utils"

import { resolveSerenaSymbolAtPosition } from "./serena-position-symbol"
import { convertToLocation, toAbsolutePath } from "./serena-symbol-formatters"
import {
  parseJsonResult,
  toRelativePath,
} from "./serena-symbol-lookup"
import type { SerenaLspProviderConfig, SerenaSymbol } from "./serena-symbol-types"

type CallSerenaTool = (toolName: string, args: Record<string, unknown>) => Promise<unknown>
type LoadDetailedSymbols = (relativePath: string, depth: number) => Promise<SerenaSymbol[]>

function parseReferenceLine(contentAroundReference: string | undefined): number | null {
  const match = contentAroundReference?.match(/(?:^|\n)\s*>\s*(\d+):/)
  if (!match) {
    return null
  }
  return Number(match[1])
}

function getReferenceRange(symbol: SerenaSymbol): Range {
  const line = symbol.reference_line ?? parseReferenceLine(symbol.content_around_reference) ?? symbol.location?.line ?? symbol.body_location?.start_line ?? 0
  const character = symbol.reference_character ?? 0
  return {
    start: { line, character },
    end: { line, character },
  }
}

function getReferenceRelativePath(symbol: SerenaSymbol): string | null {
  return symbol.location?.relative_path ?? symbol.relative_path ?? null
}

function convertReferenceToLocation(projectRoot: string, symbol: SerenaSymbol): Location | null {
  const relativePath = getReferenceRelativePath(symbol)
  if (!relativePath) {
    return null
  }
  return {
    uri: pathToUri(toAbsolutePath(projectRoot, relativePath)),
    range: getReferenceRange(symbol),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isReferenceSymbolRecord(value: Record<string, unknown>): boolean {
  return typeof value.name_path === "string" || isRecord(value.location) || isRecord(value.body_location) || typeof value.reference_line === "number"
}

function withFallbackRelativePath(symbol: SerenaSymbol, fallbackRelativePath: string | null): SerenaSymbol {
  if (!fallbackRelativePath || symbol.relative_path || symbol.location?.relative_path) {
    return symbol
  }

  return {
    ...symbol,
    relative_path: fallbackRelativePath,
    location: symbol.location ? { ...symbol.location, relative_path: fallbackRelativePath } : symbol.location,
  }
}

function collectReferenceSymbols(value: unknown, symbols: SerenaSymbol[], fallbackRelativePath: string | null = null): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectReferenceSymbols(item, symbols, fallbackRelativePath)
    }
    return
  }

  if (!isRecord(value)) {
    return
  }

  if (isReferenceSymbolRecord(value)) {
    symbols.push(withFallbackRelativePath(value as SerenaSymbol, fallbackRelativePath))
    return
  }

  for (const [key, child] of Object.entries(value)) {
    const childFallbackRelativePath = key.includes("/") || key.includes("\\") ? key : fallbackRelativePath
    collectReferenceSymbols(child, symbols, childFallbackRelativePath)
  }
}

function parseReferenceSymbols(value: unknown): SerenaSymbol[] {
  const parsedResult = parseJsonResult<unknown>(value)
  const symbols: SerenaSymbol[] = []
  collectReferenceSymbols(parsedResult, symbols)
  return symbols
}

export async function findSerenaReferences(
  config: SerenaLspProviderConfig,
  args: FindReferencesArgs,
  callTool: CallSerenaTool,
  loadDetailedSymbols: LoadDetailedSymbols
): Promise<Location[] | null> {
  const relativePath = toRelativePath(config.projectRoot, args.filePath)
  const symbol = await resolveSerenaSymbolAtPosition(args, { callTool, loadDetailedSymbols, relativePath })
  if (!symbol?.name_path) {
    return null
  }
  const symbolRelativePath = symbol.location?.relative_path ?? symbol.relative_path ?? relativePath

  const result = await callTool("find_referencing_symbols", {
    name_path: symbol.name_path,
    relative_path: symbolRelativePath,
  })
  const referenceSymbols = parseReferenceSymbols(result)
  const locations = referenceSymbols
    .map((referenceSymbol) => convertReferenceToLocation(config.projectRoot, referenceSymbol))
    .filter((location): location is Location => location !== null)

  if (args.includeDeclaration) {
    locations.unshift(convertToLocation(config.projectRoot, symbol))
  }

  return locations.length > 0 ? locations : null
}
