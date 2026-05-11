export type LspCapability =
  | "gotoDefinition"
  | "findReferences"
  | "documentSymbols"
  | "workspaceSymbols"
  | "prepareRename"
  | "rename"
  | "diagnostics"

export type LspProviderName = "builtin" | "serena"

export type LspRouteReason = "builtin-default" | "serena-ready" | "builtin-fallback"

export interface LspRouteDecision {
  capability: LspCapability
  provider: LspProviderName
  reason: LspRouteReason
}

const SERENA_CAPABILITY_MATRIX: Record<LspCapability, LspProviderName> = {
  gotoDefinition: "serena",
  findReferences: "serena",
  documentSymbols: "serena",
  workspaceSymbols: "serena",
  prepareRename: "serena",
  rename: "serena",
  diagnostics: "serena",
}

export function resolveLspRoute(preferredProvider: LspProviderName, capability: LspCapability): LspRouteDecision {
  if (preferredProvider === "builtin") {
    return {
      capability,
      provider: "builtin",
      reason: "builtin-default",
    }
  }

  const routedProvider = SERENA_CAPABILITY_MATRIX[capability]

  return {
    capability,
    provider: routedProvider,
    reason: routedProvider === "serena" ? "serena-ready" : "builtin-fallback",
  }
}
