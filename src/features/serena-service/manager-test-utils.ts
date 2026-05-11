import { mock } from "bun:test"

import { SERENA_SERVICE_FIXED_TOOLS } from "../../cli/serena-service/global-config"
import type { SerenaServiceStatus } from "../../cli/serena-service/types"
import type { SerenaServiceManagerDependencies } from "./manager-types"

export function createPluginConfig(projectRoot = "/repo") {
  return {
    lsp: {
      provider: "serena",
      serena: {
        transport: "managed-http",
        wrapperCommand: ["wrapper"],
        serenaCommand: ["serena"],
        command: ["legacy"],
        env: { SERENA: "1" },
        requiredTools: [...SERENA_SERVICE_FIXED_TOOLS],
        projectRoot,
      },
    },
  } as const
}

export function createStatus(overrides: Partial<SerenaServiceStatus> = {}): SerenaServiceStatus {
  return {
    state: "stopped",
    projectRoot: "/repo",
    mcpUrl: null,
    dashboardUrl: null,
    pid: 123,
    startedBy: "ensure",
    openWebDashboard: false,
    lastError: null,
    serenaHome: null,
    updatedAt: "2026-04-19T00:00:00.000Z",
    ...overrides,
  }
}

export function createFacade() {
  return {
    reconfigure: mock(() => {}),
    initialize: mock(async () => {}),
    dispose: mock(async () => {}),
  }
}

export function createDependencies(overrides: Partial<SerenaServiceManagerDependencies> = {}): SerenaServiceManagerDependencies {
	return {
		getStatus: overrides.getStatus ?? mock(async () => createStatus()),
		ensure: overrides.ensure ?? mock(async () => createStatus()),
		wait: overrides.wait ?? mock(async () => {}),
		now: overrides.now ?? (() => new Date("2026-04-19T00:00:00.000Z")),
    retryAttempts: overrides.retryAttempts ?? 3,
    retryDelayMs: overrides.retryDelayMs ?? 0,
  }
}

export async function flushMicrotasks(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

export function createDeferredPromise<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}
