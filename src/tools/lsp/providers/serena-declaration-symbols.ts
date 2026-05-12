import type { LspPositionArgs } from "../provider-types"

import { createDeclarationQuery } from "./serena-declaration-query"
import { preferRequestedToken } from "./serena-declaration-token-filter"
import { parseJsonResult } from "./serena-json-result"
import type { SerenaLspProviderConfig, SerenaSymbol } from "./serena-symbol-types"
import { toRelativePath } from "./serena-symbol-lookup"

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

export async function findSerenaDeclarationSymbols(
  config: SerenaLspProviderConfig,
  args: LspPositionArgs,
  callTool: (toolName: string, args: Record<string, unknown>) => Promise<unknown>
): Promise<SerenaSymbol[]> {
  const query = await createDeclarationQuery(args)
  if (!query) {
    return []
  }

  const relativePath = toRelativePath(config.projectRoot, args.filePath)
  const result = await callTool("find_declaration", {
    relative_path: relativePath,
    regex: query.regex,
    include_body: false,
    include_info: false,
  })

  const symbols: SerenaSymbol[] = []
  collectDeclarationSymbols(parseJsonResult<unknown>(result, "Serena find_declaration"), symbols)
  return preferRequestedToken(symbols, query.token)
}
