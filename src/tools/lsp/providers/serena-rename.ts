import type { LspPositionArgs } from "../provider-types"
import type { AppliedWorkspaceEdit, PrepareRenameResult } from "../types"

import { findSerenaDeclarationSymbols } from "./serena-declaration-symbols"
import { resolveSerenaSymbolAtPosition } from "./serena-position-symbol"
import { extractDisplayName, getSelectionRange } from "./serena-symbol-formatters"
import { toRelativePath } from "./serena-symbol-lookup"
import type { SerenaLspProviderConfig, SerenaSymbol } from "./serena-symbol-types"

type CallSerenaTool = (toolName: string, args: Record<string, unknown>) => Promise<unknown>
type LoadDetailedSymbols = (relativePath: string, depth: number) => Promise<SerenaSymbol[]>

function getSymbolRelativePath(symbol: SerenaSymbol): string | null {
  return symbol.location?.relative_path ?? symbol.relative_path ?? null
}

function isHeaderLikePath(relativePath: string | null): boolean {
  if (!relativePath) {
    return false
  }

  return /\.(h|hh|hpp|hxx|inl)$/i.test(relativePath)
}

function chooseRenameDeclarationSymbol(symbols: SerenaSymbol[]): SerenaSymbol | null {
  const withIdentity = symbols.filter((symbol) => symbol.name_path && getSymbolRelativePath(symbol))
  if (withIdentity.length === 0) {
    return null
  }

  const headerCandidate = withIdentity.find((symbol) => isHeaderLikePath(getSymbolRelativePath(symbol)))
  return headerCandidate ?? withIdentity[0] ?? null
}

async function resolveRenameSymbol(config: SerenaLspProviderConfig, args: LspPositionArgs, params: {
  callTool: CallSerenaTool
  loadDetailedSymbols: LoadDetailedSymbols
}): Promise<{ symbol: SerenaSymbol; relativePath: string } | null> {
  try {
    const declarationSymbol = chooseRenameDeclarationSymbol(await findSerenaDeclarationSymbols(config, args, params.callTool))
    if (declarationSymbol) {
      return {
        symbol: declarationSymbol,
        relativePath: getSymbolRelativePath(declarationSymbol) ?? toRelativePath(config.projectRoot, args.filePath),
      }
    }
  } catch {}

  const relativePath = toRelativePath(config.projectRoot, args.filePath)
  const symbol = await resolveSerenaSymbolAtPosition(args, {
    callTool: params.callTool,
    loadDetailedSymbols: params.loadDetailedSymbols,
    relativePath,
  })

  if (!symbol?.name_path) {
    return null
  }

  return {
    symbol,
    relativePath: symbol.location?.relative_path ?? symbol.relative_path ?? relativePath,
  }
}

export async function prepareSerenaRename(config: SerenaLspProviderConfig, args: LspPositionArgs, params: {
  callTool: CallSerenaTool
  loadDetailedSymbols: LoadDetailedSymbols
}): Promise<PrepareRenameResult | null> {
  const resolved = await resolveRenameSymbol(config, args, params)
  if (!resolved) {
    return null
  }

  return {
    range: getSelectionRange(resolved.symbol),
    placeholder: extractDisplayName(resolved.symbol),
  }
}

export async function renameSerenaSymbol(config: SerenaLspProviderConfig, args: LspPositionArgs & { newName: string }, params: {
  callTool: CallSerenaTool
  loadDetailedSymbols: LoadDetailedSymbols
}): Promise<AppliedWorkspaceEdit | null> {
  const resolved = await resolveRenameSymbol(config, args, params)
  if (!resolved) {
    return null
  }

  const result = await params.callTool("rename_symbol", {
    name_path: resolved.symbol.name_path,
    relative_path: resolved.relativePath,
    new_name: args.newName,
  })

  return {
    applied: true,
    message: typeof result === "string" ? result : JSON.stringify(result),
  }
}
