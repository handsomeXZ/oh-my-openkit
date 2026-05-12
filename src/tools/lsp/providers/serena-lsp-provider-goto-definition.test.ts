/// <reference types="bun-types" />

import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { describe, expect, test } from "bun:test"

import { pathToUri } from "../file-path-utils"
import { SerenaLspProvider } from "./serena-lsp-provider"

describe("SerenaLspProvider gotoDefinition", () => {
  test("#given a Serena provider #when gotoDefinition runs #then it delegates to find_declaration", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "serena-provider-definition-"))
    const sourceDirectory = join(projectRoot, "src")
    await mkdir(sourceDirectory, { recursive: true })
    const filePath = join(sourceDirectory, "use.ts")
    await writeFile(filePath, "target()\n", "utf8")
    const calls: { toolName: string; args: Record<string, unknown> }[] = []
    const provider = new SerenaLspProvider({ projectRoot })
    Object.defineProperty(provider, "mcpClient", {
      configurable: true,
      value: {
        callTool: async (toolName: string, args: Record<string, unknown>) => {
          calls.push({ toolName, args })
          return JSON.stringify({
            name: "target",
            name_path: "target",
            kind: "Function",
            relative_path: "src/defs.ts",
            body_location: { start_line: 2, end_line: 3 },
          })
        },
      },
    })

    const location = await provider.gotoDefinition({ filePath, line: 1, character: 1 })

    expect(calls[0]?.toolName).toBe("find_declaration")
    expect(calls[0]?.args).toMatchObject({ relative_path: "src/use.ts" })
    expect(location).toEqual({
      uri: pathToUri(join(projectRoot, "src", "defs.ts")),
      range: {
        start: { line: 2, character: 0 },
        end: { line: 2, character: 0 },
      },
    })
  })

  test("#given Serena returns plain-text output #when gotoDefinition runs #then it surfaces a stable parsing error", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "serena-provider-definition-"))
    const sourceDirectory = join(projectRoot, "src")
    await mkdir(sourceDirectory, { recursive: true })
    const filePath = join(sourceDirectory, "use.ts")
    await writeFile(filePath, "target()\n", "utf8")
    const provider = new SerenaLspProvider({ projectRoot })
    Object.defineProperty(provider, "mcpClient", {
      configurable: true,
      value: {
        callTool: async () => "Error: declaration lookup failed",
      },
    })

    await expect(provider.gotoDefinition({ filePath, line: 1, character: 1 })).rejects.toThrow(
      "Serena find_declaration returned non-JSON text: Error: declaration lookup failed"
    )
  })
})
