import { initConfigContext } from "./cli/config-manager/config-context"
import type { Hooks, Plugin } from "@opencode-ai/plugin"

import type { HookName } from "./config"

import { createHooks } from "./create-hooks"
import { createManagers } from "./create-managers"
import { createRuntimeTmuxConfig, isTmuxIntegrationEnabled } from "./create-runtime-tmux-config"
import { createTools } from "./create-tools"
import { initializeOpenClaw } from "./openclaw"
import { createPluginInterface } from "./plugin-interface"
import { createPluginDispose, type PluginDispose } from "./plugin-dispose"
import {
  createCompactionAutocontinueHandler,
  createSessionCompactingHandler,
  type CompactionAutocontinueHook,
} from "./plugin/session-compacting"

import { loadPluginConfig } from "./plugin-config"
import { createModelCacheState } from "./plugin-state"
import { createFirstMessageVariantGate } from "./shared/first-message-variant"
import { log } from "./shared/logger"
import { logLegacyPluginStartupWarning } from "./shared/log-legacy-plugin-startup-warning"
import { injectServerAuthIntoClient } from "./shared/opencode-server-auth"
import { installAgentSortShim, setAgentSortOrder } from "./shared/agent-sort-shim"
import { detectExternalSkillPlugin, getSkillPluginConflictWarning } from "./shared/external-plugin-detector"
import { lspManager } from "./tools"
import { startBackgroundCheck as startTmuxCheck } from "./tools/interactive-bash"

type HooksWithCompactionAutocontinue = Hooks & {
  "experimental.compaction.autocontinue"?: CompactionAutocontinueHook
}

type PluginModule = {
  id: string
  server: Plugin
}

let activePluginDispose: PluginDispose | null = null

const serverPlugin: Plugin = async (input): Promise<Hooks> => {
  installAgentSortShim()
  initConfigContext("opencode", null)
  log("[oh-my-openagent] ENTRY - plugin loading", {
    directory: input.directory,
  })
  logLegacyPluginStartupWarning()

  const skillPluginCheck = detectExternalSkillPlugin(input.directory)
  if (skillPluginCheck.detected && skillPluginCheck.pluginName) {
    console.warn(getSkillPluginConflictWarning(skillPluginCheck.pluginName))
  }

  injectServerAuthIntoClient(input.client)

  await activePluginDispose?.()

  const pluginConfig = loadPluginConfig(input.directory, input)
  setAgentSortOrder(pluginConfig.agent_order)

  if (pluginConfig.openclaw) {
    await initializeOpenClaw(pluginConfig.openclaw)
  }
  if (pluginConfig.team_mode?.enabled) {
    const teamModeConfig = pluginConfig.team_mode
    try {
      const { ensureBaseDirs, resolveBaseDir } = await import("./features/team-mode/team-registry/paths")
      const { checkTeamModeDependencies } = await import("./features/team-mode/deps")
      await checkTeamModeDependencies(teamModeConfig)
      await ensureBaseDirs(resolveBaseDir(teamModeConfig))
      if (pluginConfig.disabled_skills?.includes("team-mode")) {
        console.warn(
          "[team-mode] enabled=true but team-mode skill is disabled; skill docs hidden but tools still registered (D-29)",
        )
      }
    } catch (err) {
      console.warn("[team-mode] init failed:", err)
    }
  }
  const tmuxIntegrationEnabled = isTmuxIntegrationEnabled(pluginConfig)
  if (tmuxIntegrationEnabled) {
    startTmuxCheck()
  }
  const disabledHooks = new Set(pluginConfig.disabled_hooks ?? [])

  const isHookEnabled = (hookName: HookName): boolean => !disabledHooks.has(hookName)
  const safeHookEnabled = pluginConfig.experimental?.safe_hook_creation ?? true

  const firstMessageVariantGate = createFirstMessageVariantGate()

  const tmuxConfig = createRuntimeTmuxConfig(pluginConfig)

  const modelCacheState = createModelCacheState()

  const managers = createManagers({
    ctx: input,
    pluginConfig,
    tmuxConfig,
    modelCacheState,
    backgroundNotificationHookEnabled: isHookEnabled("background-notification"),
  })

  managers.serenaServiceManager.start(pluginConfig)

  const toolsResult = await createTools({
    ctx: input,
    pluginConfig,
    managers,
  })

  const hooks = createHooks({
    ctx: input,
    pluginConfig,
    modelCacheState,
    backgroundManager: managers.backgroundManager,
    modelFallbackControllerAccessor: managers.modelFallbackControllerAccessor,
    isHookEnabled,
    safeHookEnabled,
    mergedSkills: toolsResult.mergedSkills,
    availableSkills: toolsResult.availableSkills,
  })

  const pluginInterface = createPluginInterface({
    ctx: input,
    pluginConfig,
    firstMessageVariantGate,
    managers,
    hooks,
    tools: toolsResult.filteredTools,
  })

  const dispose = createPluginDispose({
    backgroundManager: managers.backgroundManager,
    skillMcpManager: managers.skillMcpManager,
    serenaServiceManager: managers.serenaServiceManager,
    lspManager,
    disposeHooks: hooks.disposeHooks,
  })

  const pluginHooks: HooksWithCompactionAutocontinue = {
    ...pluginInterface,

    "experimental.session.compacting": createSessionCompactingHandler(hooks),

    "experimental.compaction.autocontinue": createCompactionAutocontinueHandler(hooks),
  }

  activePluginDispose = dispose

  return pluginHooks
}

const pluginModule: PluginModule = {
  id: "oh-my-openagent",
  server: serverPlugin,
}

export default pluginModule

export type {
  OhMyOpenCodeConfig,
  AgentName,
  AgentOverrideConfig,
  AgentOverrides,
  McpName,
  HookName,
  BuiltinCommandName,
} from "./config"

export type { ConfigLoadError } from "./shared/config-errors"
