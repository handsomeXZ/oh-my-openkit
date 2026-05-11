import { describe, expect, mock, test } from "bun:test"

import { SerenaCapabilityMismatchError } from "../../tools/lsp/providers/serena-mcp-client"
import { buildSerenaLifecycleToast, createSerenaLifecycleToastListener, deriveSerenaLifecycleToastState } from "./lifecycle-toast"
import { SerenaServiceManager } from "./manager"
import { createDependencies, createFacade, createPluginConfig, createStatus } from "./manager-test-utils"

describe("Serena lifecycle toast surface", () => {
  test("startingToast derives startup messaging from the first starting snapshot", () => {
    const snapshot = {
      state: "starting",
      projectRoot: "/repo",
      mcpUrl: null,
      issueCode: null,
      lastError: null,
      serviceStatus: null,
      updatedAt: "2026-04-19T00:00:00.000Z",
    } as const

    expect(deriveSerenaLifecycleToastState({ snapshot, previousSnapshot: null })).toBe("starting")
    expect(buildSerenaLifecycleToast({ snapshot, previousSnapshot: null })).toEqual(expect.objectContaining({
      title: "Serena starting",
      message: expect.stringContaining("State: starting"),
    }))
  })

  test("connectedToast shows a connected toast from manager snapshot transitions", async () => {
    const showToast = mock(() => Promise.resolve())
    const client = { tui: { showToast } }
    const manager = new SerenaServiceManager(
      createFacade(),
      createDependencies({
        getStatus: mock(async () => createStatus({ state: "mcp-ready", mcpUrl: "http://127.0.0.1:9001/mcp" })),
      })
    )

    manager.subscribeSnapshots(createSerenaLifecycleToastListener(client as never))
    manager.start(createPluginConfig() as never)
    await manager.dispose()

    expect(showToast).toHaveBeenCalledTimes(2)
    expect(showToast.mock.calls[1]?.[0]).toEqual({
      body: expect.objectContaining({
        title: "Serena connected",
        variant: "success",
        message: expect.stringContaining("Project root: /repo"),
      }),
    })
  })

  test("reconnectingToast treats a later starting snapshot as reconnecting instead of initial startup", () => {
    const previousSnapshot = {
      state: "ready",
      projectRoot: "/repo",
      mcpUrl: "http://127.0.0.1:9001/mcp",
      issueCode: null,
      lastError: null,
      serviceStatus: createStatus({ state: "mcp-ready", mcpUrl: "http://127.0.0.1:9001/mcp" }),
      updatedAt: "2026-04-19T00:00:00.000Z",
    } as const
    const snapshot = {
      ...previousSnapshot,
      state: "starting",
      mcpUrl: null,
      updatedAt: "2026-04-19T00:00:01.000Z",
    } as const

    expect(deriveSerenaLifecycleToastState({ snapshot, previousSnapshot })).toBe("reconnecting")
    expect(buildSerenaLifecycleToast({ snapshot, previousSnapshot })).toEqual(expect.objectContaining({
      title: "Serena reconnecting",
      variant: "warning",
    }))
  })

  test("degradedToast includes project root, manager state, last error, and builtin fallback details", async () => {
    const showToast = mock(() => Promise.resolve())
    const client = { tui: { showToast } }
    const facade = createFacade()
    facade.initialize = mock(async () => {
      throw new SerenaCapabilityMismatchError(["replace_symbol_body"], ["find_symbol"])
    })
    const readyStatus = createStatus({ state: "mcp-ready", mcpUrl: "http://127.0.0.1:9001/mcp" })
    const manager = new SerenaServiceManager(
      facade,
      createDependencies({
        getStatus: mock(async () => readyStatus),
        ensure: mock(async () => readyStatus),
      })
    )

    manager.subscribeSnapshots(createSerenaLifecycleToastListener(client as never))
    manager.start(createPluginConfig() as never)
    await manager.dispose()

    const degradedCall = showToast.mock.calls.at(-1)?.[0]
    expect(degradedCall).toEqual({
      body: expect.objectContaining({
        title: "Serena degraded",
        variant: "warning",
        message: expect.stringContaining("Project root: /repo"),
      }),
    })
    expect(degradedCall?.body.message).toContain("State: degraded")
    expect(degradedCall?.body.message).toContain("Last error:")
    expect(degradedCall?.body.message).toContain("Builtin fallback: active")
  })

  test("errorToast keeps fallback-aware failure details for terminal errors", () => {
    const snapshot = {
      state: "error",
      projectRoot: "/repo",
      mcpUrl: null,
      issueCode: "ensure-failed",
      lastError: "wrapper crashed",
      serviceStatus: createStatus({ state: "error", lastError: "wrapper crashed" }),
      updatedAt: "2026-04-19T00:00:00.000Z",
    } as const

    expect(buildSerenaLifecycleToast({ snapshot, previousSnapshot: null })).toEqual(expect.objectContaining({
      title: "Serena error",
      variant: "error",
      message: expect.stringContaining("Builtin fallback: active"),
    }))
  })
})
