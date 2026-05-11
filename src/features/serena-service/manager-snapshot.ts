import type { SerenaServiceStatus } from "../../cli/serena-service/types"
import type {
  SerenaLifecycleFacade,
  SerenaManagerIssueCode,
  SerenaManagerSnapshot,
  SerenaManagerState,
  SerenaManagerTargetConfig,
} from "./manager-types"

export function createSnapshot(input: {
  now: () => Date
  state: SerenaManagerState
  projectRoot: string | null
  mcpUrl?: string | null
  issueCode?: SerenaManagerIssueCode | null
  lastError?: string | null
  serviceStatus?: SerenaServiceStatus | null
}): SerenaManagerSnapshot {
  return {
    state: input.state,
    projectRoot: input.projectRoot,
    mcpUrl: input.mcpUrl ?? input.serviceStatus?.mcpUrl ?? null,
    issueCode: input.issueCode ?? null,
    lastError: input.lastError ?? null,
    serviceStatus: input.serviceStatus ?? null,
    updatedAt: input.now().toISOString(),
  }
}

export function buildManagedHttpFacadeConfig(config: SerenaManagerTargetConfig, mcpUrl: string): Parameters<SerenaLifecycleFacade["reconfigure"]>[0] {
  return {
    provider: "serena",
    serena: {
      transport: "managed-http",
      url: mcpUrl,
      wrapperCommand: config.wrapperCommand,
      serenaCommand: config.serenaCommand,
      command: config.command,
      env: config.env,
      requiredTools: config.requiredTools,
      projectRoot: config.projectRoot,
    },
  }
}

export function buildStdioFacadeConfig(config: SerenaManagerTargetConfig): Parameters<SerenaLifecycleFacade["reconfigure"]>[0] {
  return {
    provider: "serena",
    serena: {
      transport: "stdio",
      wrapperCommand: config.wrapperCommand,
      serenaCommand: config.serenaCommand,
      command: config.command,
      env: config.env,
      requiredTools: config.requiredTools,
      projectRoot: config.projectRoot,
    },
  }
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
