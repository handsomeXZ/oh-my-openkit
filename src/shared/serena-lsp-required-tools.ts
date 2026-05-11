export const SERENA_LSP_REQUIRED_TOOLS = [
  "find_declaration",
  "find_symbol",
  "get_symbols_overview",
  "find_referencing_symbols",
  "get_diagnostics_for_file",
  "rename_symbol",
] as const

export function resolveSerenaLspRequiredTools(configuredTools: readonly string[] | undefined): string[] {
  return [...new Set([...(configuredTools ?? []), ...SERENA_LSP_REQUIRED_TOOLS])]
}
