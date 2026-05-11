import type { FindReferencesArgs, LspPositionArgs } from "../provider-types"

import { findDefinitionCandidates } from "./serena-definition-candidates"
import { extractDisplayName } from "./serena-symbol-formatters"
import {
  extractNamePathCandidatesFromFile,
  flattenSymbols,
  isNearSymbolDeclaration,
} from "./serena-symbol-lookup"
import type { SerenaSymbol } from "./serena-symbol-types"

type CallSerenaTool = (toolName: string, args: Record<string, unknown>) => Promise<unknown>
type LoadDetailedSymbols = (relativePath: string, depth: number) => Promise<SerenaSymbol[]>

function findDeclarationSymbolOnSameLine(
  symbols: SerenaSymbol[],
  args: LspPositionArgs,
  textCandidates: string[]
): SerenaSymbol | null {
  const declarationLine = args.line - 1
  const matches = flattenSymbols(symbols).filter((symbol) => {
    const symbolLine = symbol.body_location?.start_line ?? symbol.location?.line
    return symbolLine === declarationLine && textCandidates.includes(extractDisplayName(symbol))
  })

  matches.sort((left, right) => (left.name_path?.length ?? 0) - (right.name_path?.length ?? 0))
  return matches[0] ?? null
}

function findSymbolAtPosition(symbols: SerenaSymbol[], args: LspPositionArgs): SerenaSymbol | null {
  const line = args.line - 1
  const matches = flattenSymbols(symbols).filter((symbol) => {
    const startLine = symbol.body_location?.start_line ?? symbol.location?.line ?? 0
    const endLine = symbol.body_location?.end_line ?? startLine
    return line >= startLine && line <= endLine
  })

  matches.sort((left, right) => {
    const leftSpan = (left.body_location?.end_line ?? left.location?.line ?? 0) - (left.body_location?.start_line ?? left.location?.line ?? 0)
    const rightSpan = (right.body_location?.end_line ?? right.location?.line ?? 0) - (right.body_location?.start_line ?? right.location?.line ?? 0)
    return leftSpan - rightSpan
  })

  return matches[0] ?? null
}

export async function resolveSerenaSymbolAtPosition(args: FindReferencesArgs, params: {
  callTool: CallSerenaTool
  loadDetailedSymbols: LoadDetailedSymbols
  relativePath: string
}): Promise<SerenaSymbol | null> {
  const textCandidates = await extractNamePathCandidatesFromFile(args.filePath, args.line, args.character)
  if (textCandidates.length === 0) {
    return null
  }

  const symbols = await params.loadDetailedSymbols(params.relativePath, 3)
  const sameLineSymbol = findDeclarationSymbolOnSameLine(symbols, args, textCandidates)
  const positionSymbol = sameLineSymbol ?? findSymbolAtPosition(symbols, args)

  if (positionSymbol?.name_path && isNearSymbolDeclaration(positionSymbol, args)) {
    return positionSymbol
  }

  if (positionSymbol?.name_path && textCandidates.includes(extractDisplayName(positionSymbol))) {
    return positionSymbol
  }

  const definitionCandidates = await findDefinitionCandidates(textCandidates, params.callTool)
  return definitionCandidates[0] ?? null
}
