/// <reference types="bun-types" />

import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { describe, expect, mock, test } from "bun:test"

import { SerenaLspProvider } from "./serena-lsp-provider"

describe("SerenaLspProvider lifecycle contract", () => {
  test("dispose disconnects the underlying MCP client", async () => {
    const provider = new SerenaLspProvider({ projectRoot: "D:/repo" })
    const disconnect = mock(async () => {})
    Object.defineProperty(provider, "mcpClient", {
      value: { disconnect },
      configurable: true,
    })

    await provider.dispose()

    expect(disconnect).toHaveBeenCalledTimes(1)
  })
})

describe("SerenaLspProvider P1 capabilities", () => {
  test("fileDiagnostics maps Serena grouped diagnostics into LSP diagnostics", async () => {
    const provider = new SerenaLspProvider({ projectRoot: "D:/repo" })
    Object.defineProperty(provider, "mcpClient", {
      configurable: true,
      value: {
        callTool: async (toolName: string, args: Record<string, unknown>) => {
          expect(toolName).toBe("get_diagnostics_for_file")
          expect(args).toEqual({ relative_path: "src/file.ts" })
          return JSON.stringify({
            "src/file.ts": {
              error: {
                target: [
                  {
                    message: "Type mismatch",
                    severity: "error",
                    start_line: 2,
                    start_column: 4,
                    end_line: 2,
                    end_column: 10,
                    code: "TS2322",
                    source: "typescript",
                  },
                ],
              },
            },
          })
        },
      },
    })

    const diagnostics = await provider.fileDiagnostics({ filePath: "D:/repo/src/file.ts" })

    expect(diagnostics).toEqual([
      {
        range: {
          start: { line: 2, character: 4 },
          end: { line: 2, character: 10 },
        },
        severity: 1,
        code: "TS2322",
        source: "typescript",
        message: "Type mismatch",
      },
    ])
  })

  test("prepareRename resolves the target symbol selection range", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "serena-provider-"))
    const sourceDirectory = join(projectRoot, "src")
    await mkdir(sourceDirectory, { recursive: true })
    const filePath = join(sourceDirectory, "file.ts")
    await writeFile(filePath, "const target = 1\n", "utf8")
    const provider = new SerenaLspProvider({ projectRoot })
    Object.defineProperty(provider, "mcpClient", {
      configurable: true,
      value: {
        callTool: async (toolName: string) => {
          if (toolName === "get_symbols_overview") {
            return JSON.stringify({ Variable: ["target"] })
          }
          if (toolName === "find_symbol") {
            return JSON.stringify([
              {
                name: "target",
                name_path: "target",
                kind: "Variable",
                relative_path: "src/file.ts",
                location: { relative_path: "src/file.ts", line: 0, column: 6 },
                body_location: { start_line: 0, end_line: 0 },
              },
            ])
          }
          return JSON.stringify([])
        },
      },
    })

    const result = await provider.prepareRename({ filePath, line: 1, character: 8 })

    expect(result).toEqual({
      range: { start: { line: 0, character: 6 }, end: { line: 0, character: 12 } },
      placeholder: "target",
    })
  })

  test("rename calls Serena rename_symbol and returns an already-applied result", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "serena-provider-"))
    const sourceDirectory = join(projectRoot, "src")
    await mkdir(sourceDirectory, { recursive: true })
    const filePath = join(sourceDirectory, "file.ts")
    await writeFile(filePath, "const target = 1\n", "utf8")
    const renameCalls: Record<string, unknown>[] = []
    const provider = new SerenaLspProvider({ projectRoot })
    Object.defineProperty(provider, "mcpClient", {
      configurable: true,
      value: {
        callTool: async (toolName: string, args: Record<string, unknown>) => {
          if (toolName === "get_symbols_overview") {
            return JSON.stringify({ Variable: ["target"] })
          }
          if (toolName === "find_symbol") {
            return JSON.stringify([
              {
                name: "target",
                name_path: "target",
                kind: "Variable",
                relative_path: "src/file.ts",
                location: { relative_path: "src/file.ts", line: 0, column: 6 },
                body_location: { start_line: 0, end_line: 0 },
              },
            ])
          }
          if (toolName === "rename_symbol") {
            renameCalls.push(args)
            return "Successfully renamed target to renamedTarget (2 changes applied)"
          }
          return JSON.stringify([])
        },
      },
    })

    const result = await provider.rename({ filePath, line: 1, character: 8, newName: "renamedTarget" })

    expect(renameCalls).toEqual([{ name_path: "target", relative_path: "src/file.ts", new_name: "renamedTarget" }])
    expect(result).toEqual({ applied: true, message: "Successfully renamed target to renamedTarget (2 changes applied)" })
  })
})
