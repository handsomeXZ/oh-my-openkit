import { describe, expect, mock, test } from "bun:test"

import { SerenaServiceManager } from "./manager"
import {
  createDeferredPromise,
  createDependencies,
  createFacade,
  createPluginConfig,
  createStatus,
  flushMicrotasks,
} from "./manager-test-utils"

describe("SerenaServiceManager concurrent lifecycle", () => {
  test("#concurrent start calls dedupe one in-flight startup per projectRoot", async () => {
    const deferred = createDeferredPromise<ReturnType<typeof createStatus>>()
    const facade = createFacade()
    const dependencies = createDependencies({
      getStatus: mock(async () => createStatus()),
      ensure: mock(async () => deferred.promise),
    })
    const manager = new SerenaServiceManager(facade, dependencies)

    manager.start(createPluginConfig() as never)
    manager.start(createPluginConfig() as never)
    await flushMicrotasks()

    expect(dependencies.getStatus).toHaveBeenCalledTimes(1)
    expect(dependencies.ensure).toHaveBeenCalledTimes(1)

    deferred.resolve(createStatus({ state: "mcp-ready", mcpUrl: "http://127.0.0.1:9001/mcp" }))
    await manager.dispose()

    expect(facade.initialize).toHaveBeenCalledTimes(1)
    expect(manager.getSnapshot("/repo")).toEqual(expect.objectContaining({ state: "ready" }))
  })
})
