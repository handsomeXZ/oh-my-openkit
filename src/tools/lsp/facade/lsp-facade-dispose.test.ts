import { describe, expect, mock, test } from "bun:test"

import { createLspFacade } from "./lsp-facade"
import type { LspProvider } from "./lsp-provider"

function zeroRange() {
  return {
    start: { line: 0, character: 0 },
    end: { line: 0, character: 0 },
  }
}

function createTrackingProvider(tag: string) {
  return {
    gotoDefinition: mock(async () => ({ uri: `${tag}:definition`, range: zeroRange() })),
    findReferences: mock(async () => []),
    documentSymbols: mock(async () => []),
    workspaceSymbols: mock(async () => []),
    fileDiagnostics: mock(async () => []),
    prepareRename: mock(async () => null),
    rename: mock(async () => null),
    dispose: mock(async () => {}),
  } satisfies LspProvider & { dispose: ReturnType<typeof mock> }
}

describe("lsp-facade lifecycle fallback", () => {
  test("supported Serena capabilities fall back to builtin when no Serena instance is configured", async () => {
    const builtinProvider = createTrackingProvider("builtin")
    const facade = createLspFacade(
      { provider: "serena" },
      {
        createBuiltinProvider: () => builtinProvider,
      }
    )

    const definition = await facade.gotoDefinition({ filePath: "D:/repo/src/file.ts", line: 1, character: 0 })

    expect(definition).toEqual({ uri: "builtin:definition", range: zeroRange() })
    expect(builtinProvider.gotoDefinition).toHaveBeenCalledTimes(1)
    expect(facade.getRoutingForCapability("gotoDefinition")).toEqual({
      capability: "gotoDefinition",
      provider: "builtin",
      reason: "builtin-fallback",
    })
  })

  test("dispose tears down active providers and resets future routing to builtin", async () => {
    const builtinProvider = createTrackingProvider("builtin")
    const serenaProvider = createTrackingProvider("serena")
    const facade = createLspFacade(
      {
        provider: "serena",
        serena: { projectRoot: "D:/repo" },
      },
      {
        createBuiltinProvider: () => builtinProvider,
        createSerenaProvider: () => serenaProvider,
      }
    )

    await facade.dispose()

    expect(serenaProvider.dispose).toHaveBeenCalledTimes(1)
    expect(builtinProvider.dispose).toHaveBeenCalledTimes(1)
    expect(facade.getCurrentProvider()).toBe("builtin")

    const definition = await facade.gotoDefinition({ filePath: "D:/repo/src/file.ts", line: 1, character: 0 })

    expect(definition).toEqual({ uri: "builtin:definition", range: zeroRange() })
    expect(builtinProvider.gotoDefinition).toHaveBeenCalledTimes(1)
    expect(facade.getRoutingForCapability("gotoDefinition")).toEqual({
      capability: "gotoDefinition",
      provider: "builtin",
      reason: "builtin-default",
    })
  })
})
