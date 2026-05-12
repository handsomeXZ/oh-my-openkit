import type { OhMyOpenCodeConfig } from "../../config"

import { ensureSerenaService } from "../../cli/serena-service/ensure-service"
import { getSerenaServiceStatus } from "../../cli/serena-service/get-status"
import { log } from "../../shared"
import { lspFacade } from "../../tools/lsp/facade/lsp-facade"
import { createSnapshot } from "./manager-snapshot"
import { runSerenaManagerLifecycle } from "./manager-runtime"
import { runSerenaStdioLifecycle } from "./manager-stdio-runtime"
import type { SerenaLifecycleFacade, SerenaManagerSnapshot, SerenaServiceManagerDependencies } from "./manager-types"
import { resolveSerenaManagerTargetConfig } from "./manager-types"

const DEFAULT_RETRY_ATTEMPTS = 3
const DEFAULT_RETRY_DELAY_MS = 250

function waitForDelay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

export class SerenaServiceManager {
  private readonly inFlightStartups = new Map<string, Promise<SerenaManagerSnapshot>>()
  private readonly snapshots = new Map<string, SerenaManagerSnapshot>()
  private readonly snapshotListeners = new Set<(snapshot: SerenaManagerSnapshot, previousSnapshot: SerenaManagerSnapshot | null) => void>()
  private lastSnapshot: SerenaManagerSnapshot | null = null

  constructor(
    private readonly facade: SerenaLifecycleFacade = lspFacade,
		private readonly dependencies: SerenaServiceManagerDependencies = {
			getStatus: getSerenaServiceStatus,
			ensure: (config) => ensureSerenaService(config.projectRoot, process.env, { serenaCommand: config.serenaCommand, requiredTools: config.requiredTools }),
			wait: waitForDelay,
      now: () => new Date(),
      retryAttempts: DEFAULT_RETRY_ATTEMPTS,
      retryDelayMs: DEFAULT_RETRY_DELAY_MS,
    }
  ) {}

  start(pluginConfig: OhMyOpenCodeConfig): void {
    const serenaConfig = resolveSerenaManagerTargetConfig(pluginConfig)

    if (!serenaConfig) {
      const issueCode = pluginConfig.lsp?.provider === "serena" ? "missing-project-root" : "provider-disabled"
      this.facade.reconfigure({ provider: "builtin" })
      this.publishSnapshot(createSnapshot({
        now: this.dependencies.now,
        state: "idle",
        projectRoot: pluginConfig.lsp?.serena?.projectRoot ?? null,
        issueCode,
      }))
      log("[serena-service-manager] Using builtin LSP provider", {
        issueCode,
        provider: pluginConfig.lsp?.provider ?? null,
        configuredProjectRoot: pluginConfig.lsp?.serena?.projectRoot ?? null,
        configuredTransport: pluginConfig.lsp?.serena?.transport ?? null,
      })
      return
    }

    if (this.inFlightStartups.has(serenaConfig.projectRoot)) {
      log("[serena-service-manager] Startup already in flight; skipping duplicate start", {
        projectRoot: serenaConfig.projectRoot,
      })
      return
    }

    log("[serena-service-manager] Starting Serena lifecycle manager", {
      transport: serenaConfig.transport,
      projectRoot: serenaConfig.projectRoot,
      wrapperCommand: serenaConfig.wrapperCommand ?? null,
      serenaCommand: serenaConfig.serenaCommand ?? null,
      command: serenaConfig.command ?? null,
      requiredTools: serenaConfig.requiredTools ?? null,
    })

    const startupPromise = (serenaConfig.transport === "stdio" ? runSerenaStdioLifecycle : runSerenaManagerLifecycle)({
      config: serenaConfig,
      facade: this.facade,
      dependencies: this.dependencies,
      publishSnapshot: (snapshot) => this.publishSnapshot(snapshot),
    })
      .then((snapshot) => {
        log("[serena-service-manager] Startup finished", {
          projectRoot: serenaConfig.projectRoot,
          state: snapshot.state,
          issueCode: snapshot.issueCode,
          mcpUrl: snapshot.mcpUrl,
          lastError: snapshot.lastError,
        })
        this.publishSnapshot(snapshot)
        if (snapshot.state !== "ready") {
          log("[serena-service-manager] Falling back to builtin provider after unsuccessful Serena startup", {
            projectRoot: serenaConfig.projectRoot,
            state: snapshot.state,
            issueCode: snapshot.issueCode,
          })
          this.facade.reconfigure({ provider: "builtin" })
        }
        return snapshot
      })
      .catch((error) => {
        const lastError = error instanceof Error ? error.message : String(error)
        log("[serena-service-manager] Startup threw before snapshot stabilization", {
          projectRoot: serenaConfig.projectRoot,
          transport: serenaConfig.transport,
          lastError,
        })
        const snapshot = createSnapshot({
          now: this.dependencies.now,
          state: "error",
          projectRoot: serenaConfig.projectRoot,
          issueCode: "ensure-failed",
          lastError,
        })
        this.publishSnapshot(snapshot)
        this.facade.reconfigure({ provider: "builtin" })
        return snapshot
      })
      .finally(() => {
        this.inFlightStartups.delete(serenaConfig.projectRoot)
      })

    this.inFlightStartups.set(serenaConfig.projectRoot, startupPromise)
  }

  getSnapshot(projectRoot?: string): SerenaManagerSnapshot | null {
    if (projectRoot) {
      return this.snapshots.get(projectRoot) ?? null
    }

    return this.lastSnapshot
  }

  subscribeSnapshots(listener: (snapshot: SerenaManagerSnapshot, previousSnapshot: SerenaManagerSnapshot | null) => void): () => void {
    this.snapshotListeners.add(listener)

    return () => {
      this.snapshotListeners.delete(listener)
    }
  }

  private publishSnapshot(snapshot: SerenaManagerSnapshot): void {
    const previousSnapshot = snapshot.projectRoot
      ? this.snapshots.get(snapshot.projectRoot) ?? null
      : this.lastSnapshot

    this.lastSnapshot = snapshot
    if (snapshot.projectRoot) {
      this.snapshots.set(snapshot.projectRoot, snapshot)
    }

    log("[serena-service-manager] Published snapshot", {
      projectRoot: snapshot.projectRoot,
      state: snapshot.state,
      issueCode: snapshot.issueCode,
      mcpUrl: snapshot.mcpUrl,
      lastError: snapshot.lastError,
      previousState: previousSnapshot?.state ?? null,
      previousIssueCode: previousSnapshot?.issueCode ?? null,
    })

    for (const listener of this.snapshotListeners) {
      try {
        listener(snapshot, previousSnapshot)
      } catch (error) {
        log("[serena-service-manager] Snapshot listener failed:", error)
      }
    }
  }

  async dispose(): Promise<void> {
    await Promise.allSettled(this.inFlightStartups.values())

    await this.facade.dispose().catch((error) => {
      log("[serena-service-manager] Failed to dispose Serena client resources:", error)
    })
  }
}
