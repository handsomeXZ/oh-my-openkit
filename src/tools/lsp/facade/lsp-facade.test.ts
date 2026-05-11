import { describe, expect, test } from "bun:test"

import { createLspFacade } from "./lsp-facade"
import type { FindReferencesArgs, LspDiagnosticsArgs, LspPositionArgs, LspProvider, SymbolsArgs } from "./lsp-provider"
import type {
  Diagnostic,
  DocumentSymbol,
  Location,
  LocationLink,
  PrepareRenameDefaultBehavior,
  PrepareRenameResult,
  RenameResult,
  SymbolInfo,
} from "../types"

type TrackingCall = {
  method: string
  args: unknown[]
}

class TrackingProvider implements LspProvider {
  readonly calls: TrackingCall[] = []

  constructor(private readonly tag: string) {}

  async gotoDefinition(args: LspPositionArgs): Promise<Location | Location[] | LocationLink[] | null> {
    this.calls.push({ method: "gotoDefinition", args: [args] })
    return { uri: `${this.tag}:definition`, range: zeroRange() }
  }

  async findReferences(args: FindReferencesArgs): Promise<Location[] | null> {
    this.calls.push({ method: "findReferences", args: [args] })
    return [{ uri: `${this.tag}:references`, range: zeroRange() }]
  }

  async documentSymbols(filePath: string): Promise<DocumentSymbol[] | SymbolInfo[] | null> {
    this.calls.push({ method: "documentSymbols", args: [filePath] })
    return [{ name: `${this.tag}:documentSymbols`, kind: 1, range: zeroRange(), selectionRange: zeroRange() }]
  }

  async workspaceSymbols(args: SymbolsArgs): Promise<SymbolInfo[] | null> {
    this.calls.push({ method: "workspaceSymbols", args: [args] })
    return [{ name: `${this.tag}:workspaceSymbols`, kind: 1, location: { uri: `${this.tag}:workspaceSymbols`, range: zeroRange() } }]
  }

  async fileDiagnostics(args: LspDiagnosticsArgs): Promise<Diagnostic[]> {
    this.calls.push({ method: "fileDiagnostics", args: [args] })
    return [{ message: `${this.tag}:diagnostics`, range: zeroRange() }]
  }

  async prepareRename(args: LspPositionArgs): Promise<PrepareRenameResult | PrepareRenameDefaultBehavior | null> {
    this.calls.push({ method: "prepareRename", args: [args] })
    return { range: zeroRange(), placeholder: `${this.tag}:prepareRename` }
  }

  async rename(args: LspPositionArgs & { newName: string }): Promise<RenameResult> {
    this.calls.push({ method: "rename", args: [args] })
    return { changes: { [`${this.tag}:rename`]: [{ range: zeroRange(), newText: args.newName }] } }
  }

  async dispose(): Promise<void> {}
}

function zeroRange() {
  return {
    start: { line: 0, character: 0 },
    end: { line: 0, character: 0 },
  }
}

describe("lsp-facade Serena routing", () => {
  test("serenaReady routes navigation, symbols, references, diagnostics, and rename to Serena", async () => {
    const builtinProvider = new TrackingProvider("builtin")
    const serenaProvider = new TrackingProvider("serena")
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

    const definition = await facade.gotoDefinition({ filePath: "D:/repo/src/file.ts", line: 1, character: 0 })
    const references = await facade.findReferences({
      filePath: "D:/repo/src/file.ts",
      line: 1,
      character: 0,
      includeDeclaration: true,
    })
    const documentSymbols = await facade.documentSymbols("D:/repo/src/file.ts")
    const workspaceSymbols = await facade.workspaceSymbols("D:/repo/src/file.ts", "needle")
    const diagnostics = await facade.diagnostics({ filePath: "D:/repo/src/file.ts" })
    const prepareRename = await facade.prepareRename({ filePath: "D:/repo/src/file.ts", line: 1, character: 0 })
    const rename = await facade.rename({ filePath: "D:/repo/src/file.ts", line: 1, character: 0, newName: "nextName" })

    expect(definition).toEqual({ uri: "serena:definition", range: zeroRange() })
    expect(references).toEqual([{ uri: "serena:references", range: zeroRange() }])
    expect(documentSymbols).toEqual([{ name: "serena:documentSymbols", kind: 1, range: zeroRange(), selectionRange: zeroRange() }])
    expect(workspaceSymbols).toEqual([
      { name: "serena:workspaceSymbols", kind: 1, location: { uri: "serena:workspaceSymbols", range: zeroRange() } },
    ])
    expect(diagnostics).toEqual([{ message: "serena:diagnostics", range: zeroRange() }])
    expect(prepareRename).toEqual({ range: zeroRange(), placeholder: "serena:prepareRename" })
    expect(rename).toEqual({ changes: { "serena:rename": [{ range: zeroRange(), newText: "nextName" }] } })
    expect(serenaProvider.calls.map((call) => call.method)).toEqual([
      "gotoDefinition",
      "findReferences",
      "documentSymbols",
      "workspaceSymbols",
      "fileDiagnostics",
      "prepareRename",
      "rename",
    ])
    expect(builtinProvider.calls).toHaveLength(0)
    expect(facade.getRoutingForCapability("gotoDefinition")).toEqual({
      capability: "gotoDefinition",
      provider: "serena",
      reason: "serena-ready",
    })
    expect(facade.getRoutingForCapability("documentSymbols")).toEqual({
      capability: "documentSymbols",
      provider: "serena",
      reason: "serena-ready",
    })
    expect(facade.getRoutingForCapability("workspaceSymbols")).toEqual({
      capability: "workspaceSymbols",
      provider: "serena",
      reason: "serena-ready",
    })
    expect(facade.getRoutingForCapability("findReferences")).toEqual({
      capability: "findReferences",
      provider: "serena",
      reason: "serena-ready",
    })
    expect(facade.getRoutingForCapability("diagnostics")).toEqual({
      capability: "diagnostics",
      provider: "serena",
      reason: "serena-ready",
    })
    expect(facade.getRoutingForCapability("prepareRename")).toEqual({
      capability: "prepareRename",
      provider: "serena",
      reason: "serena-ready",
    })
    expect(facade.getRoutingForCapability("rename")).toEqual({
      capability: "rename",
      provider: "serena",
      reason: "serena-ready",
    })
  })

  test("#given Serena diagnostics options #when requesting file diagnostics #then facade forwards Serena arguments", async () => {
    const serenaProvider = new TrackingProvider("serena")
    const facade = createLspFacade(
      {
        provider: "serena",
        serena: { projectRoot: "D:/repo" },
      },
      {
        createBuiltinProvider: () => new TrackingProvider("builtin"),
        createSerenaProvider: () => serenaProvider,
      }
    )

    await facade.diagnostics({
      filePath: "D:/repo/src/file.ts",
      startLine: 3,
      endLine: 8,
      minSeverity: 2,
      maxAnswerChars: 1200,
    })

    expect(serenaProvider.calls.at(-1)).toEqual({
      method: "fileDiagnostics",
      args: [{ filePath: "D:/repo/src/file.ts", startLine: 3, endLine: 8, minSeverity: 2, maxAnswerChars: 1200 }],
    })
  })
})
