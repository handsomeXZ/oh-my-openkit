import type { SerenaSymbol } from "./serena-symbol-types"
import { parseJsonResult } from "./serena-json-result"

export function filterDefinitionSymbols(symbols: SerenaSymbol[]): SerenaSymbol[] {
  const sourceSymbols = symbols.filter((symbol) => {
    const relativePath = (symbol.relative_path ?? symbol.location?.relative_path ?? "").replace(/\\/g, "/")
    return relativePath.startsWith("Source/")
  })

  if (sourceSymbols.length > 0) {
    return sourceSymbols
  }

  return symbols.filter((symbol) => {
    const relativePath = (symbol.relative_path ?? symbol.location?.relative_path ?? "").replace(/\\/g, "/")
    return !relativePath.includes("/Intermediate/") && !relativePath.startsWith("Intermediate/")
  })
}

export function addDefinitionCandidate(target: string[], candidate: string | undefined): void {
  if (!candidate) {
    return
  }

  if (candidate.includes("::")) {
    const slashVariant = candidate.replace(/::/g, "/")
    if (!target.includes(slashVariant)) {
      target.push(slashVariant)
    }
  }

  if (!target.includes(candidate)) {
    target.push(candidate)
  }
}

export async function findDefinitionCandidates(
  candidates: string[],
  callTool: (toolName: string, args: Record<string, unknown>) => Promise<unknown>
): Promise<SerenaSymbol[]> {
  for (const candidate of candidates) {
    const result = await callTool("find_symbol", {
      name_path_pattern: candidate,
      relative_path: "",
      include_body: false,
      depth: 0,
    })

    const symbols = filterDefinitionSymbols(parseJsonResult<SerenaSymbol[]>(result, "Serena find_symbol"))
    if (symbols.length > 0) {
      return symbols
    }
  }

  return []
}
