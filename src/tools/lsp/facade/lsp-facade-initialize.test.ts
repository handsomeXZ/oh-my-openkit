import { describe, expect, mock, test } from "bun:test"

import { createLspFacade } from "./lsp-facade"
import type { LspProvider } from "./lsp-provider"

function createProvider() {
  return {
    gotoDefinition: mock(async () => null),
    findReferences: mock(async () => []),
    documentSymbols: mock(async () => []),
    workspaceSymbols: mock(async () => []),
    fileDiagnostics: mock(async () => []),
    prepareRename: mock(async () => null),
    rename: mock(async () => null),
    initialize: mock(async () => {}),
    dispose: mock(async () => {}),
  } satisfies LspProvider & { initialize: ReturnType<typeof mock> }
}

describe("lsp-facade initialization", () => {
  test("initializes only the configured Serena provider", async () => {
    const builtinProvider = createProvider()
    const serenaProvider = createProvider()
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

    await facade.initialize()

    expect(serenaProvider.initialize).toHaveBeenCalledTimes(1)
    expect(builtinProvider.initialize).not.toHaveBeenCalled()
  })

  test("skips Serena initialization while builtin is selected", async () => {
    const serenaProvider = createProvider()
    const facade = createLspFacade(
      { provider: "builtin" },
      {
        createSerenaProvider: () => serenaProvider,
      }
    )

    await facade.initialize()

    expect(serenaProvider.initialize).not.toHaveBeenCalled()
  })
})
