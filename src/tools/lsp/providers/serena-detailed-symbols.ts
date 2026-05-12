import { normalizeSymbolTree } from "./serena-symbol-formatters"
import { parseJsonResult } from "./serena-json-result"
import { deduplicateSymbols, extractNamePathsFromGroupedOverview } from "./serena-symbol-lookup"
import type { SerenaOverviewGrouped, SerenaSymbol } from "./serena-symbol-types"

export async function getDetailedTopLevelSymbols(
  relativePath: string,
  depth: number,
  callTool: (toolName: string, args: Record<string, unknown>) => Promise<unknown>
): Promise<SerenaSymbol[]> {
  const overviewResult = await callTool("get_symbols_overview", { relative_path: relativePath, depth })
  const overview = parseJsonResult<SerenaOverviewGrouped>(overviewResult, "Serena get_symbols_overview")
  const namePaths = extractNamePathsFromGroupedOverview(overview)
  const detailedSymbols: SerenaSymbol[] = []

  for (const namePath of new Set(namePaths)) {
    const detailResult = await callTool("find_symbol", {
      name_path_pattern: namePath,
      relative_path: relativePath,
      include_body: false,
      depth,
    })
    detailedSymbols.push(...parseJsonResult<SerenaSymbol[]>(detailResult, "Serena find_symbol").map((symbol) => normalizeSymbolTree(symbol)))
  }

  return deduplicateSymbols(detailedSymbols)
}
