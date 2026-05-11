/// <reference types="bun-types" />

import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { describe, expect, test } from "bun:test"

import { pathToUri } from "../file-path-utils"
import { SerenaLspProvider } from "./serena-lsp-provider"

describe("SerenaLspProvider findReferences", () => {
  test("findReferences resolves the cursor symbol and calls Serena referencing symbols", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "serena-provider-"))
    const sourceDirectory = join(projectRoot, "src")
    await mkdir(sourceDirectory, { recursive: true })
    const filePath = join(sourceDirectory, "file.ts")
    await writeFile(filePath, "const target = 1\n", "utf8")

    const calls: { toolName: string; args: Record<string, unknown> }[] = []
    const provider = new SerenaLspProvider({ projectRoot })
    Object.defineProperty(provider, "mcpClient", {
      configurable: true,
      value: {
        callTool: async (toolName: string, args: Record<string, unknown>) => {
          calls.push({ toolName, args })
          if (toolName === "get_symbols_overview") {
            return JSON.stringify({ Function: ["target"] })
          }
          if (toolName === "find_symbol") {
            return JSON.stringify([
              {
                name: "target",
                name_path: "target",
                kind: "Function",
                relative_path: "src/file.ts",
                location: { relative_path: "src/file.ts", line: 0, column: 6 },
                body_location: { start_line: 0, end_line: 0 },
              },
            ])
          }
          if (toolName === "find_referencing_symbols") {
            return JSON.stringify({
              "src/ref.ts": {
                Function: [
                  {
                    name: "useTarget",
                    name_path: "useTarget",
                    kind: "Function",
                    relative_path: "src/ref.ts",
                    location: { relative_path: "src/ref.ts", line: 4, column: 10 },
                    body_location: { start_line: 4, end_line: 6 },
                  },
                ],
              },
            })
          }
          return JSON.stringify([])
        },
      },
    })

    const references = await provider.findReferences({ filePath, line: 1, character: 8, includeDeclaration: true })

    expect(calls[calls.length - 1]).toEqual({
      toolName: "find_referencing_symbols",
      args: { name_path: "target", relative_path: "src/file.ts" },
    })
    expect(references?.map((location) => location.uri)).toEqual([
      pathToUri(`${projectRoot}/src/file.ts`),
      pathToUri(`${projectRoot}/src/ref.ts`),
    ])
  })

  test("findReferences resolves usage sites through definition lookup instead of container symbols", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "serena-provider-"))
    const sourceDirectory = join(projectRoot, "src")
    await mkdir(sourceDirectory, { recursive: true })
    const filePath = join(sourceDirectory, "use.ts")
    await writeFile(filePath, "function useTarget() {\n  return target()\n}\n", "utf8")

    const referencingCalls: Record<string, unknown>[] = []
    const provider = new SerenaLspProvider({ projectRoot })
    Object.defineProperty(provider, "mcpClient", {
      configurable: true,
      value: {
        callTool: async (toolName: string, args: Record<string, unknown>) => {
          if (toolName === "get_symbols_overview") {
            return JSON.stringify({ Function: ["useTarget"] })
          }
          if (toolName === "find_symbol" && args.relative_path === "src/use.ts") {
            return JSON.stringify([
              {
                name: "useTarget",
                name_path: "useTarget",
                kind: "Function",
                relative_path: "src/use.ts",
                location: { relative_path: "src/use.ts", line: 0, column: 9 },
                body_location: { start_line: 0, end_line: 2 },
              },
            ])
          }
          if (toolName === "find_symbol" && args.name_path_pattern === "target") {
            return JSON.stringify([
              {
                name: "target",
                name_path: "target",
                kind: "Function",
                relative_path: "src/defs.ts",
                location: { relative_path: "src/defs.ts", line: 0, column: 16 },
                body_location: { start_line: 0, end_line: 0 },
              },
            ])
          }
          if (toolName === "find_referencing_symbols") {
            referencingCalls.push(args)
            return JSON.stringify([])
          }
          return JSON.stringify([])
        },
      },
    })

    await provider.findReferences({ filePath, line: 2, character: 9 })

    expect(referencingCalls).toEqual([
      { name_path: "target", relative_path: "src/defs.ts" },
    ])
  })
})
