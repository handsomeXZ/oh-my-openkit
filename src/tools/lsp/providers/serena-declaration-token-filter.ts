import { extractDisplayName } from "./serena-symbol-formatters"
import type { SerenaSymbol } from "./serena-symbol-types"

function normalizeName(value: string | undefined): string {
  return (value ?? "").replace(/::/g, "/").split("/").filter(Boolean).at(-1) ?? ""
}

export function preferRequestedToken(symbols: SerenaSymbol[], token: string): SerenaSymbol[] {
  const requestedName = normalizeName(token)
  if (!requestedName) {
    return symbols
  }

  const exactMatches = symbols.filter((symbol) =>
    extractDisplayName(symbol) === requestedName || normalizeName(symbol.name_path ?? symbol.name) === requestedName
  )
  return exactMatches.length > 0 ? exactMatches : symbols
}
