/// <reference types="bun-types" />

import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { describe, expect, test } from "bun:test"

import { SerenaLspProvider } from "./serena-lsp-provider"

describe("SerenaLspProvider rename round-trip refresh", () => {
  test("refreshes Serena state before and after cross-file rename so local edits and immediate rename-back still update all locations", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "serena-roundtrip-"))
    const sourceDirectory = join(projectRoot, "Source", "VehicleTest_5_7")
    const headerPath = join(sourceDirectory, "VehicleTest_5_7Pawn.h")
    const sourcePath = join(sourceDirectory, "VehicleTest_5_7Pawn.cpp")
    const headerRelativePath = "Source/VehicleTest_5_7/VehicleTest_5_7Pawn.h"
    let currentName = "DoLookAround"
    let staleCrossFileState = true
    let disconnectCalls = 0
    let initializeCalls = 0
    const lifecycleCalls: string[] = []

    await mkdir(sourceDirectory, { recursive: true })
    await writeFile(headerPath, "void DoLookAround(float YawDelta);\n", "utf8")
    await writeFile(sourcePath, "DoLookAround(Value.Get<float>());\n", "utf8")

    const provider = new SerenaLspProvider({ projectRoot })
    Object.defineProperty(provider, "mcpClient", {
      configurable: true,
      value: {
        callTool: async (toolName: string, args: Record<string, unknown>) => {
          if (toolName === "get_symbols_overview") {
            return JSON.stringify({ Method: [currentName] })
          }

          if (toolName === "find_symbol") {
            return JSON.stringify([
              {
                name: currentName,
                name_path: `AVehicleTest_5_7Pawn/${currentName}`,
                kind: "Method",
                relative_path: headerRelativePath,
                location: { relative_path: headerRelativePath, line: 0, column: 5 },
                body_location: { start_line: 0, end_line: 0 },
              },
            ])
          }

          if (toolName === "rename_symbol") {
            const appliedChanges = staleCrossFileState ? 1 : 4
            currentName = String(args.new_name)
            staleCrossFileState = true
            lifecycleCalls.push(`rename:${currentName}:${appliedChanges}`)
            return `Successfully renamed '${String(args.name_path)}' to '${currentName}' (${appliedChanges} changes applied)`
          }

          return JSON.stringify([])
        },
        disconnect: async () => {
          disconnectCalls += 1
          lifecycleCalls.push("disconnect")
        },
        initialize: async () => {
          initializeCalls += 1
          staleCrossFileState = false
          lifecycleCalls.push("initialize")
        },
      },
    })

    const firstRename = await provider.rename({ filePath: headerPath, line: 1, character: 8, newName: "DoLookAroundLspTest" })
    const secondRename = await provider.rename({ filePath: headerPath, line: 1, character: 8, newName: "DoLookAround" })

    expect(firstRename).toEqual({
      applied: true,
      message: "Successfully renamed 'AVehicleTest_5_7Pawn/DoLookAround' to 'DoLookAroundLspTest' (4 changes applied)",
    })
    expect(secondRename).toEqual({
      applied: true,
      message: "Successfully renamed 'AVehicleTest_5_7Pawn/DoLookAroundLspTest' to 'DoLookAround' (4 changes applied)",
    })
    expect(disconnectCalls).toBe(4)
    expect(initializeCalls).toBe(4)
    expect(lifecycleCalls).toEqual([
      "disconnect",
      "initialize",
      "rename:DoLookAroundLspTest:4",
      "disconnect",
      "initialize",
      "disconnect",
      "initialize",
      "rename:DoLookAround:4",
      "disconnect",
      "initialize",
    ])
  })

  test("fails closed when Serena cannot refresh stale state before rename", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "serena-rename-refresh-error-"))
    const sourceDirectory = join(projectRoot, "Source", "VehicleTest_5_7")
    const headerPath = join(sourceDirectory, "VehicleTest_5_7Pawn.h")
    let renameCalls = 0
    let initializeCalls = 0

    await mkdir(sourceDirectory, { recursive: true })
    await writeFile(headerPath, "void DoLookAround(float YawDelta);\n", "utf8")

    const provider = new SerenaLspProvider({ projectRoot })
    Object.defineProperty(provider, "mcpClient", {
      configurable: true,
      value: {
        callTool: async (toolName: string) => {
          if (toolName === "rename_symbol") {
            renameCalls += 1
          }

          return JSON.stringify([])
        },
        disconnect: async () => {
          throw new Error("stale Serena session")
        },
        initialize: async () => {
          initializeCalls += 1
        },
      },
    })

    await expect(provider.rename({ filePath: headerPath, line: 1, character: 8, newName: "DoLookAroundLspTest" })).rejects.toThrow(
      "Failed to refresh Serena state before rename: stale Serena session"
    )
    expect(renameCalls).toBe(0)
    expect(initializeCalls).toBe(0)
  })
})
