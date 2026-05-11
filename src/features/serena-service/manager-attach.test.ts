import { describe, expect, mock, test } from "bun:test"

import { SerenaCapabilityMismatchError } from "../../tools/lsp/providers/serena-mcp-client"
import { SerenaServiceManager } from "./manager"
import { createDependencies, createFacade, createPluginConfig, createStatus } from "./manager-test-utils"

describe("SerenaServiceManager attach lifecycle", () => {
  test("#attach prefers an existing mcpUrl before ensure and stores a ready snapshot", async () => {
    const facade = createFacade()
    const dependencies = createDependencies({
      getStatus: mock(async () => createStatus({ state: "mcp-ready", mcpUrl: "http://127.0.0.1:9001/mcp" })),
      ensure: mock(async () => createStatus({ state: "mcp-ready", mcpUrl: "http://127.0.0.1:9002/mcp" })),
    })
    const manager = new SerenaServiceManager(facade, dependencies)

    manager.start(createPluginConfig() as never)
    await manager.dispose()

    expect(dependencies.ensure).not.toHaveBeenCalled()
    expect(facade.reconfigure).toHaveBeenCalledWith(expect.objectContaining({
      provider: "serena",
      serena: expect.objectContaining({ url: "http://127.0.0.1:9001/mcp", projectRoot: "/repo" }),
    }))
    expect(manager.getSnapshot("/repo")).toEqual(expect.objectContaining({ state: "ready", mcpUrl: "http://127.0.0.1:9001/mcp" }))
  })

  test("#ensure starts a missing instance and promotes the ensured mcpUrl into a ready snapshot", async () => {
    const facade = createFacade()
    const dependencies = createDependencies({
      getStatus: mock(async () => createStatus()),
      ensure: mock(async () => createStatus({ state: "dashboard-ready", mcpUrl: "http://127.0.0.1:9002/mcp" })),
    })
    const manager = new SerenaServiceManager(facade, dependencies)
    const pluginConfig = createPluginConfig()

    manager.start(pluginConfig as never)
    await manager.dispose()

    expect(dependencies.ensure).toHaveBeenCalledWith(pluginConfig.lsp.serena)
    expect(facade.reconfigure).toHaveBeenCalledWith(expect.objectContaining({
      provider: "serena",
      serena: expect.objectContaining({ url: "http://127.0.0.1:9002/mcp", projectRoot: "/repo" }),
    }))
    expect(manager.getSnapshot("/repo")).toEqual(expect.objectContaining({ state: "ready", mcpUrl: "http://127.0.0.1:9002/mcp" }))
  })

	test("#ready snapshot remains stable without launching the wrapper tray host", async () => {
		const facade = createFacade()
		const dependencies = createDependencies({
			getStatus: mock(async () => createStatus({ state: "mcp-ready", mcpUrl: "http://127.0.0.1:9001/mcp" })),
			ensure: mock(async () => createStatus({ state: "mcp-ready", mcpUrl: "http://127.0.0.1:9002/mcp" })),
		})
		const manager = new SerenaServiceManager(facade, dependencies)

		manager.start(createPluginConfig() as never)
		await manager.dispose()

		expect(manager.getSnapshot("/repo")).toEqual(expect.objectContaining({ state: "ready", mcpUrl: "http://127.0.0.1:9001/mcp" }))
	})

  test("#attach requiredTools mismatch stays machine-observable as degraded instead of silently reusing the service", async () => {
    const facade = createFacade()
    facade.initialize = mock(async () => {
      throw new SerenaCapabilityMismatchError(["find_declaration", "find_referencing_symbols", "get_diagnostics_for_file", "rename_symbol"], ["find_symbol", "get_symbols_overview"])
    })
    const readyStatus = createStatus({ state: "mcp-ready", mcpUrl: "http://127.0.0.1:9001/mcp" })
    const dependencies = createDependencies({
      getStatus: mock(async () => readyStatus),
      ensure: mock(async () => readyStatus),
    })
    const manager = new SerenaServiceManager(facade, dependencies)

    manager.start(createPluginConfig() as never)
    await manager.dispose()

    expect(manager.getSnapshot("/repo")).toEqual(expect.objectContaining({
      state: "degraded",
      issueCode: "required-tools-mismatch",
      mcpUrl: "http://127.0.0.1:9001/mcp",
    }))
    expect(facade.reconfigure).toHaveBeenLastCalledWith({ provider: "builtin" })
  })

  test("#attach failure falls back to builtin after retry budget is exhausted", async () => {
    const facade = createFacade()
    facade.initialize = mock(async () => {
      throw new Error("connection refused")
    })
    const readyStatus = createStatus({ state: "mcp-ready", mcpUrl: "http://127.0.0.1:9001/mcp" })
    const dependencies = createDependencies({
      getStatus: mock(async () => readyStatus),
      ensure: mock(async () => readyStatus),
      retryAttempts: 1,
    })
    const manager = new SerenaServiceManager(facade, dependencies)

    manager.start(createPluginConfig() as never)
    await manager.dispose()

    expect(manager.getSnapshot("/repo")).toEqual(expect.objectContaining({
      state: "degraded",
      issueCode: "attach-failed",
      lastError: "connection refused",
    }))
    expect(facade.reconfigure).toHaveBeenLastCalledWith({ provider: "builtin" })
  })
})
