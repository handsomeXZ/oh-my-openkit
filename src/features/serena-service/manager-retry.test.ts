import { describe, expect, mock, test } from "bun:test"
import { normalizeSerenaProjectRoot } from "../../cli/serena-service/project-root"

import { SerenaServiceManager } from "./manager"
import { createDependencies, createFacade, createPluginConfig, createStatus } from "./manager-test-utils"

describe("SerenaServiceManager retry lifecycle", () => {
  test("#retry polls after ensure and retries attach until a stable mcpUrl becomes ready", async () => {
    const facade = createFacade()
    let initializeAttempts = 0
    facade.initialize = mock(async () => {
      initializeAttempts += 1
      if (initializeAttempts === 1) {
        throw new Error("connect ECONNREFUSED")
      }
    })
    let statusCall = 0
    const getStatus = mock(async () => {
      statusCall += 1
      if (statusCall === 1) {
        return createStatus({ state: "mcp-ready", mcpUrl: "http://127.0.0.1:9001/mcp" })
      }
      if (statusCall === 2) {
        return createStatus({ state: "mcp-ready", mcpUrl: "http://127.0.0.1:9002/mcp" })
      }
      return createStatus({ state: "mcp-ready", mcpUrl: "http://127.0.0.1:9002/mcp" })
    })
    const dependencies = createDependencies({
      getStatus,
      ensure: mock(async () => createStatus({ state: "starting" })),
      wait: mock(async () => {}),
    })
    const manager = new SerenaServiceManager(facade, dependencies)

    manager.start(createPluginConfig() as never)
    await manager.dispose()

    expect(dependencies.ensure).toHaveBeenCalledTimes(1)
    expect(dependencies.wait).toHaveBeenCalledTimes(1)
    expect(facade.initialize).toHaveBeenCalledTimes(2)
    expect(manager.getSnapshot("/repo")).toEqual(expect.objectContaining({ state: "ready", mcpUrl: "http://127.0.0.1:9002/mcp" }))
  })

  test("#retry turns connection mismatch into a deterministic degraded snapshot after retry budget exhaustion", async () => {
    const facade = createFacade()
    facade.initialize = mock(async () => {
      throw new Error("socket closed")
    })
    let statusCall = 0
    const getStatus = mock(async () => {
      statusCall += 1
      if (statusCall === 1) {
        return createStatus({ state: "mcp-ready", mcpUrl: "http://127.0.0.1:9001/mcp" })
      }
      return createStatus({ state: "starting", mcpUrl: "http://127.0.0.1:9002/mcp" })
    })
    const dependencies = createDependencies({
      getStatus,
      ensure: mock(async () => createStatus({ state: "starting" })),
      wait: mock(async () => {}),
      retryAttempts: 2,
    })
    const manager = new SerenaServiceManager(facade, dependencies)

    manager.start(createPluginConfig() as never)
    await manager.dispose()

    expect(manager.getSnapshot("/repo")).toEqual(expect.objectContaining({
      state: "degraded",
      issueCode: "connection-mismatch",
    }))
  })

  test("#retry reports projectRoot mismatch as degraded instead of attaching to the wrong service", async () => {
    const facade = createFacade()
    const dependencies = createDependencies({
      getStatus: mock(async () => createStatus()),
      ensure: mock(async () => createStatus({ state: "mcp-ready", mcpUrl: "http://127.0.0.1:9001/mcp", projectRoot: "/other" })),
    })
    const manager = new SerenaServiceManager(facade, dependencies)

    manager.start(createPluginConfig() as never)
    await manager.dispose()

    expect(facade.initialize).not.toHaveBeenCalled()
    expect(manager.getSnapshot("/repo")).toEqual(expect.objectContaining({
      state: "degraded",
      issueCode: "status-project-root-mismatch",
    }))
  })

	test("#retry treats equivalent Windows project roots as the same project instead of degrading on slash differences", async () => {
		const facade = createFacade()
		const dependencies = createDependencies({
			getStatus: mock(async () => createStatus({ state: "stopped", pid: null })),
			ensure: mock(async () =>
				createStatus({
					state: "mcp-ready",
					mcpUrl: "http://127.0.0.1:9001/mcp",
					projectRoot: normalizeSerenaProjectRoot("D:\\UE\\Project\\VehicleTest_5_7"),
				})
			),
		})
		const manager = new SerenaServiceManager(facade, dependencies)

		manager.start(createPluginConfig("D:/UE/Project/VehicleTest_5_7") as never)
		await manager.dispose()

		expect(manager.getSnapshot("D:/UE/Project/VehicleTest_5_7")).toEqual(
			expect.objectContaining({
				state: "ready",
			})
		)
	})
})
