import { SerenaCapabilityMismatchError } from "../../tools/lsp/providers/serena-mcp-client"
import { createSnapshot, buildStdioFacadeConfig, getErrorMessage } from "./manager-snapshot"
import type {
  SerenaLifecycleFacade,
  SerenaManagerSnapshot,
  SerenaManagerTargetConfig,
  SerenaServiceManagerDependencies,
} from "./manager-types"

export async function runSerenaStdioLifecycle(params: {
  config: SerenaManagerTargetConfig
  facade: SerenaLifecycleFacade
  dependencies: SerenaServiceManagerDependencies
  publishSnapshot: (snapshot: SerenaManagerSnapshot) => void
}): Promise<SerenaManagerSnapshot> {
  const { config, facade, dependencies, publishSnapshot } = params
  publishSnapshot(createSnapshot({ now: dependencies.now, state: "starting", projectRoot: config.projectRoot }))

  try {
    facade.reconfigure(buildStdioFacadeConfig(config))
    await facade.initialize()
    return createSnapshot({ now: dependencies.now, state: "ready", projectRoot: config.projectRoot })
  } catch (error) {
    return createSnapshot({
      now: dependencies.now,
      state: "error",
      projectRoot: config.projectRoot,
      issueCode: error instanceof SerenaCapabilityMismatchError ? "required-tools-mismatch" : "attach-failed",
      lastError: getErrorMessage(error),
    })
  }
}
