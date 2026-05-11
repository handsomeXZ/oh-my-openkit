import type { SerenaSymbol } from "./serena-symbol-types"

const GENERATED_BODY_SEGMENT = "/GENERATED_BODY/"

function isGeneratedBodyDerivedSymbol(symbol: SerenaSymbol): boolean {
  return symbol.name_path?.includes(GENERATED_BODY_SEGMENT) ?? false
}

function isUhtHelperSymbol(symbol: SerenaSymbol): boolean {
  const namePath = symbol.name_path ?? ""
  const name = symbol.name ?? ""

  return (
    namePath.startsWith("Z_Construct_") ||
    namePath.startsWith("Z_Registration_") ||
    namePath.startsWith("DEFINE_VTABLE_PTR_HELPER_CTOR_NS/") ||
    name.startsWith("Z_Construct_") ||
    name.startsWith("Z_Registration_") ||
    name === "StaticRegisterNativesAVehicleTest_5_7GameMode"
  )
}

function isUsefulSourceSymbol(symbol: SerenaSymbol): boolean {
  return !isGeneratedBodyDerivedSymbol(symbol) && !isUhtHelperSymbol(symbol)
}

function normalizeRelativePath(symbol: SerenaSymbol): string {
  return (symbol.relative_path ?? symbol.location?.relative_path ?? "").replace(/\\/g, "/")
}

function isSourceSymbol(symbol: SerenaSymbol): boolean {
  return normalizeRelativePath(symbol).startsWith("Source/")
}

function isIntermediateSymbol(symbol: SerenaSymbol): boolean {
  const relativePath = normalizeRelativePath(symbol)
  return relativePath.includes("/Intermediate/") || relativePath.startsWith("Intermediate/")
}

function deduplicateWorkspaceSymbols(symbols: SerenaSymbol[]): SerenaSymbol[] {
  const seen = new Set<string>()

  return symbols.filter((symbol) => {
    const key = [
      symbol.name_path ?? symbol.name ?? "",
      symbol.kind ?? "",
      normalizeRelativePath(symbol),
      symbol.body_location?.start_line ?? symbol.location?.line ?? -1,
    ].join("|")

    if (seen.has(key)) {
      return false
    }

    seen.add(key)
    return true
  })
}

export function filterWorkspaceSymbols(symbols: SerenaSymbol[]): SerenaSymbol[] {
  const sourceSymbols = symbols.filter((symbol) => isSourceSymbol(symbol) && isUsefulSourceSymbol(symbol))
  if (sourceSymbols.length > 0) {
    return deduplicateWorkspaceSymbols(sourceSymbols)
  }

  return deduplicateWorkspaceSymbols(
    symbols.filter((symbol) => !isIntermediateSymbol(symbol) && isUsefulSourceSymbol(symbol))
  )
}
