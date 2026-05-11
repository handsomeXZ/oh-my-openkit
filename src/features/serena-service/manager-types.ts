import type { OhMyOpenCodeConfig } from "../../config"
import type { SerenaServiceStatus } from "../../cli/serena-service/types"

export type SerenaLifecycleFacade = {
  reconfigure: (config: {
    provider: "builtin" | "serena"
    serena?: {
      transport?: "managed-http" | "stdio"
      wrapperCommand?: string[]
      serenaCommand?: string[]
      command?: string[]
      url?: string
      headers?: Record<string, string>
      env?: Record<string, string>
      requiredTools?: string[]
      projectRoot: string
    }
  }) => void
  initialize: () => Promise<void>
  dispose: () => Promise<void>
}

export type SerenaManagerState = "idle" | "starting" | "ready" | "degraded" | "error"

export type SerenaManagerIssueCode =
  | "provider-disabled"
  | "missing-project-root"
  | "status-project-root-mismatch"
  | "required-tools-mismatch"
  | "connection-mismatch"
  | "attach-failed"
  | "ensure-failed"

export interface SerenaManagerSnapshot {
  state: SerenaManagerState
  projectRoot: string | null
  mcpUrl: string | null
  issueCode: SerenaManagerIssueCode | null
  lastError: string | null
  serviceStatus: SerenaServiceStatus | null
  updatedAt: string
}

export interface SerenaManagerTargetConfig {
  transport?: "managed-http" | "stdio"
  wrapperCommand?: string[]
  serenaCommand?: string[]
  command?: string[]
  env?: Record<string, string>
  requiredTools?: string[]
  projectRoot: string
}

export interface SerenaServiceManagerDependencies {
	getStatus: (projectRoot: string) => Promise<SerenaServiceStatus>
	ensure: (config: SerenaManagerTargetConfig) => Promise<SerenaServiceStatus>
	wait: (milliseconds: number) => Promise<void>
	now: () => Date
  retryAttempts: number
  retryDelayMs: number
}

export function resolveSerenaManagerTargetConfig(pluginConfig: OhMyOpenCodeConfig): SerenaManagerTargetConfig | null {
  const serenaConfig = pluginConfig.lsp?.serena

  if (pluginConfig.lsp?.provider !== "serena" || !serenaConfig?.projectRoot) {
    return null
  }

  return {
    transport: serenaConfig.transport,
    wrapperCommand: serenaConfig.wrapperCommand,
    serenaCommand: serenaConfig.serenaCommand,
    command: serenaConfig.command,
    env: serenaConfig.env,
    requiredTools: serenaConfig.requiredTools,
    projectRoot: serenaConfig.projectRoot,
  }
}
