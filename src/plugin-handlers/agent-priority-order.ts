import { DEFAULT_AGENT_ORDER, resolveAgentOrderDisplayNames } from "../shared/agent-ordering"

const NATIVE_OPENCODE_AGENT_ORDER = ["build", "plan"] as const

/**
 * Default source of truth for core agent ordering.
 * The default order is: sisyphus → hephaestus → prometheus → atlas.
 *
 * User config may override the runtime order through `agent_order`; missing
 * core agents still fall back to this default order. Do not reintroduce sort
 * key prefixes or a second ordering constant.
 *
 * See: src/plugin-handlers/AGENTS.md for architectural context.
 */
export const CANONICAL_CORE_AGENT_ORDER = DEFAULT_AGENT_ORDER

function injectOrderField(agentConfig: unknown, order: number): unknown {
  if (typeof agentConfig === "object" && agentConfig !== null) {
    return { ...agentConfig, order }
  }
  return agentConfig
}

export function reorderAgentsByPriority(
  agents: Record<string, unknown>,
  agentOrder?: readonly string[],
): Record<string, unknown> {
  const ordered: Record<string, unknown> = {}
  const seen = new Set<string>()
  let nextOrder = 1

  for (const nativeAgentName of NATIVE_OPENCODE_AGENT_ORDER) {
    if (Object.prototype.hasOwnProperty.call(agents, nativeAgentName)) {
      ordered[nativeAgentName] = injectOrderField(agents[nativeAgentName], nextOrder)
      seen.add(nativeAgentName)
      nextOrder += 1
    }
  }

  const orderedDisplayNames = resolveAgentOrderDisplayNames(agentOrder)

  for (const displayName of orderedDisplayNames) {
    if (Object.prototype.hasOwnProperty.call(agents, displayName)) {
      ordered[displayName] = injectOrderField(agents[displayName], nextOrder)
      seen.add(displayName)
      nextOrder += 1
    }
  }

  const nonCoreKeys = Object.keys(agents)
    .filter((key) => !seen.has(key))
    .sort((a, b) => a.localeCompare(b))

  for (const key of nonCoreKeys) {
    ordered[key] = agents[key]
  }

  return ordered
}
