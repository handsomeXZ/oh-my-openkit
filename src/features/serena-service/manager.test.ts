import { describe, expect, test } from "bun:test"

import { SERENA_SERVICE_FIXED_TOOLS } from "../../cli/serena-service/global-config"
import { SerenaCapabilityMismatchError } from "../../tools/lsp/providers/serena-mcp-client"
import { SerenaServiceManager } from "./manager"
import {
  createDeferredPromise,
  createDependencies,
  createFacade,
  createPluginConfig,
  createStatus,
  flushMicrotasks,
} from "./manager-test-utils"

describe("SerenaServiceManager", () => {
  test("#given serena is disabled #when startup runs #then it falls back to builtin provider without initializing serena", async () => {
    const facade = createFacade()
    const manager = new SerenaServiceManager(facade, createDependencies())

    manager.start({ lsp: { provider: "builtin" } } as never)
    await flushMicrotasks()

    expect(facade.reconfigure).toHaveBeenCalledWith({ provider: "builtin" })
    expect(facade.initialize).not.toHaveBeenCalled()
    expect(manager.getSnapshot()?.state).toBe("idle")
  })

  test("#given serena startup is slow #when start is called #then plugin wiring path remains non-blocking", async () => {
    const deferred = createDeferredPromise<void>()
    const facade = createFacade()
    facade.initialize = async () => deferred.promise
    const manager = new SerenaServiceManager(facade, createDependencies({
      getStatus: async () => createStatus({ state: "mcp-ready", mcpUrl: "http://127.0.0.1:9001/mcp" }),
    }))

    const result = manager.start(createPluginConfig() as never)

    expect(result).toBeUndefined()
    await flushMicrotasks()
    expect(facade.reconfigure).toHaveBeenCalledTimes(1)

    deferred.resolve()
    await flushMicrotasks()
  })

  test("#given serena startup is still in flight #when dispose runs #then it waits for startup and only disposes client resources", async () => {
    const deferred = createDeferredPromise<void>()
    const facade = createFacade()
    facade.initialize = async () => deferred.promise
    const manager = new SerenaServiceManager(facade, createDependencies({
      getStatus: async () => createStatus({ state: "mcp-ready", mcpUrl: "http://127.0.0.1:9001/mcp" }),
    }))

    manager.start(createPluginConfig() as never)
    const disposePromise = manager.dispose()
    await flushMicrotasks()

    expect(facade.dispose).not.toHaveBeenCalled()

    deferred.resolve()
    await disposePromise
    expect(facade.dispose).toHaveBeenCalledTimes(1)
  })

  test("#given serena project config includes a local command #when startup falls through to ensure #then manager passes serenaCommand to the ensure dependency", async () => {
		const facade = createFacade()
		const dependencies = createDependencies({
			getStatus: async () => createStatus({ state: "stopped", pid: null }),
			ensure: async (config) => {
				expect(config.serenaCommand).toEqual(["serena"])
				return createStatus({ state: "mcp-ready", mcpUrl: "http://127.0.0.1:9001/mcp", projectRoot: "/repo" })
			},
		})
		const manager = new SerenaServiceManager(facade, dependencies)

		manager.start(createPluginConfig() as never)
		await manager.dispose()

		expect(manager.getSnapshot("/repo")?.state).toBe("ready")
	})

  test("#given stdio transport #when startup runs #then it initializes Serena directly without ensuring managed HTTP", async () => {
    const facade = createFacade()
    const dependencies = createDependencies()
    const manager = new SerenaServiceManager(facade, dependencies)
    const pluginConfig = {
      ...createPluginConfig(),
      lsp: {
        provider: "serena",
        serena: {
          transport: "stdio",
          serenaCommand: ["serena"],
          projectRoot: "/repo",
        },
      },
    }

    manager.start(pluginConfig as never)
    await manager.dispose()

    expect(dependencies.getStatus).not.toHaveBeenCalled()
    expect(dependencies.ensure).not.toHaveBeenCalled()
    expect(facade.reconfigure).toHaveBeenCalledWith({
      provider: "serena",
      serena: expect.objectContaining({ transport: "stdio", serenaCommand: ["serena"], projectRoot: "/repo" }),
    })
    expect(manager.getSnapshot("/repo")?.state).toBe("ready")
  })

  test("#given stdio requiredTools mismatch #when startup fails #then snapshot preserves mismatch issue code", async () => {
    const facade = createFacade()
    facade.initialize = async () => {
      throw new SerenaCapabilityMismatchError(["find_declaration", "find_referencing_symbols", "get_diagnostics_for_file", "rename_symbol"], ["find_symbol", "get_symbols_overview"])
    }
    const dependencies = createDependencies()
    const manager = new SerenaServiceManager(facade, dependencies)
    const pluginConfig = {
      ...createPluginConfig(),
      lsp: {
        provider: "serena",
        serena: {
          transport: "stdio",
          serenaCommand: ["serena"],
          requiredTools: [...SERENA_SERVICE_FIXED_TOOLS],
          projectRoot: "/repo",
        },
      },
    }

    manager.start(pluginConfig as never)
    await manager.dispose()

    expect(manager.getSnapshot("/repo")).toEqual(expect.objectContaining({
      state: "error",
      issueCode: "required-tools-mismatch",
    }))
    expect(facade.reconfigure).toHaveBeenLastCalledWith({ provider: "builtin" })
  })
})
