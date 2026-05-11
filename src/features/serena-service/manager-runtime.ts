import { SerenaCapabilityMismatchError } from "../../tools/lsp/providers/serena-mcp-client"
import { createSerenaProjectRootComparisonKey } from "../../cli/serena-service/project-root"
import type { SerenaServiceStatus } from "../../cli/serena-service/types"
import { createSnapshot, buildManagedHttpFacadeConfig, getErrorMessage } from "./manager-snapshot"
import type {
  SerenaLifecycleFacade,
  SerenaManagerIssueCode,
  SerenaManagerSnapshot,
  SerenaManagerTargetConfig,
  SerenaServiceManagerDependencies,
} from "./manager-types"

function canAttach(status: SerenaServiceStatus): boolean {
  return Boolean(status.mcpUrl) && status.state !== "stopped"
}

function isProjectRootMismatch(status: SerenaServiceStatus, projectRoot: string): boolean {
	return createSerenaProjectRootComparisonKey(status.projectRoot) !== createSerenaProjectRootComparisonKey(projectRoot)
}

function createProjectRootMismatchError(expectedProjectRoot: string, actualProjectRoot: string): string {
  return `Serena service status projectRoot mismatch: expected ${expectedProjectRoot}, received ${actualProjectRoot}`
}

function createConnectionMismatchError(expectedUrl: string, actualUrl: string): string {
  return `Serena service connection mismatch: attempted ${expectedUrl}, latest status advertised ${actualUrl}`
}

function shouldReplaceFailure(
  currentFailure: { issueCode: SerenaManagerIssueCode } | null,
  nextFailure: { issueCode: SerenaManagerIssueCode }
): boolean {
  if (!currentFailure) {
    return true
  }

  if (currentFailure.issueCode === "connection-mismatch" || currentFailure.issueCode === "required-tools-mismatch") {
    return nextFailure.issueCode !== "attach-failed"
  }

  return true
}

async function tryAttach(params: {
  config: SerenaManagerTargetConfig
  status: SerenaServiceStatus
  facade: SerenaLifecycleFacade
  dependencies: SerenaServiceManagerDependencies
}): Promise<{ ok: true } | { ok: false; issueCode: SerenaManagerIssueCode; lastError: string; latestStatus: SerenaServiceStatus }> {
  const { config, status, facade, dependencies } = params

  if (isProjectRootMismatch(status, config.projectRoot)) {
    return {
      ok: false,
      issueCode: "status-project-root-mismatch",
      lastError: createProjectRootMismatchError(config.projectRoot, status.projectRoot),
      latestStatus: status,
    }
  }

  if (!status.mcpUrl) {
    return {
      ok: false,
      issueCode: "attach-failed",
      lastError: "Serena service status did not publish an MCP URL for attachment",
      latestStatus: status,
    }
  }

  try {
    facade.reconfigure(buildManagedHttpFacadeConfig(config, status.mcpUrl))
    await facade.initialize()
    return { ok: true }
  } catch (error) {
    const latestStatus = await dependencies.getStatus(config.projectRoot).catch(() => status)
    if (isProjectRootMismatch(latestStatus, config.projectRoot)) {
      return {
        ok: false,
        issueCode: "status-project-root-mismatch",
        lastError: createProjectRootMismatchError(config.projectRoot, latestStatus.projectRoot),
        latestStatus,
      }
    }

    if (status.mcpUrl && latestStatus.mcpUrl && latestStatus.mcpUrl !== status.mcpUrl) {
      return {
        ok: false,
        issueCode: "connection-mismatch",
        lastError: createConnectionMismatchError(status.mcpUrl, latestStatus.mcpUrl),
        latestStatus,
      }
    }

    return {
      ok: false,
      issueCode: error instanceof SerenaCapabilityMismatchError ? "required-tools-mismatch" : "attach-failed",
      lastError: getErrorMessage(error),
      latestStatus,
    }
  }
}

export async function runSerenaManagerLifecycle(params: {
  config: SerenaManagerTargetConfig
  facade: SerenaLifecycleFacade
  dependencies: SerenaServiceManagerDependencies
  publishSnapshot: (snapshot: SerenaManagerSnapshot) => void
}): Promise<SerenaManagerSnapshot> {
  const { config, facade, dependencies, publishSnapshot } = params
  publishSnapshot(createSnapshot({ now: dependencies.now, state: "starting", projectRoot: config.projectRoot }))

  const initialStatus = await dependencies.getStatus(config.projectRoot)
  let lastFailure: { issueCode: SerenaManagerIssueCode; lastError: string; latestStatus: SerenaServiceStatus } | null = null

  if (canAttach(initialStatus)) {
    const attachResult = await tryAttach({ config, status: initialStatus, facade, dependencies })
    if (attachResult.ok) {
      return createSnapshot({ now: dependencies.now, state: "ready", projectRoot: config.projectRoot, serviceStatus: initialStatus })
    }
    if (shouldReplaceFailure(lastFailure, attachResult)) {
      lastFailure = attachResult
    }
  }

  let ensuredStatus: SerenaServiceStatus
  try {
		ensuredStatus = await dependencies.ensure(config)
  } catch (error) {
    return createSnapshot({
      now: dependencies.now,
      state: "error",
      projectRoot: config.projectRoot,
      issueCode: "ensure-failed",
      lastError: getErrorMessage(error),
      serviceStatus: initialStatus,
    })
  }

  let currentStatus = ensuredStatus
  for (let attempt = 1; attempt <= dependencies.retryAttempts; attempt++) {
    if (isProjectRootMismatch(currentStatus, config.projectRoot)) {
      return createSnapshot({
        now: dependencies.now,
        state: "degraded",
        projectRoot: config.projectRoot,
        issueCode: "status-project-root-mismatch",
        lastError: createProjectRootMismatchError(config.projectRoot, currentStatus.projectRoot),
        serviceStatus: currentStatus,
      })
    }

    if (canAttach(currentStatus)) {
      const attachResult = await tryAttach({ config, status: currentStatus, facade, dependencies })
      if (attachResult.ok) {
        return createSnapshot({ now: dependencies.now, state: "ready", projectRoot: config.projectRoot, serviceStatus: currentStatus })
      }
      if (shouldReplaceFailure(lastFailure, attachResult)) {
        lastFailure = attachResult
      }
    }

    if (attempt < dependencies.retryAttempts) {
      await dependencies.wait(dependencies.retryDelayMs)
      currentStatus = await dependencies.getStatus(config.projectRoot)
    }
  }

  if (currentStatus.state === "error") {
    return createSnapshot({
      now: dependencies.now,
      state: "error",
      projectRoot: config.projectRoot,
      issueCode: lastFailure?.issueCode ?? "attach-failed",
      lastError: currentStatus.lastError ?? lastFailure?.lastError ?? "Serena service reported an error state",
      serviceStatus: currentStatus,
    })
  }

  return createSnapshot({
    now: dependencies.now,
    state: "degraded",
    projectRoot: config.projectRoot,
    issueCode: lastFailure?.issueCode ?? "attach-failed",
    lastError: lastFailure?.lastError ?? currentStatus.lastError ?? "Serena service did not become attachable within retry budget",
    serviceStatus: currentStatus,
  })
}
