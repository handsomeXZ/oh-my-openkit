/// <reference types="bun-types" />

import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { describe, expect, test } from "bun:test"

import { SerenaLspProvider } from "./serena-lsp-provider"

describe("SerenaLspProvider rename declaration resolution", () => {
  test("prefers the header declaration when rename starts from a cpp call site", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "serena-rename-header-first-"))
    const sourceDirectory = join(projectRoot, "Source", "VehicleTest_5_7")
    const sourcePath = join(sourceDirectory, "VehicleTest_5_7Pawn.cpp")
    const headerPath = join(sourceDirectory, "VehicleTest_5_7Pawn.h")
    const renameCalls: Record<string, unknown>[] = []

    await mkdir(sourceDirectory, { recursive: true })
    await writeFile(sourcePath, "DoThrottle(ThrottleValue);\n", "utf8")
    await writeFile(headerPath, "void DoThrottle(float ThrottleValue);\n", "utf8")

    const provider = new SerenaLspProvider({ projectRoot })
    Object.defineProperty(provider, "mcpClient", {
      configurable: true,
      value: {
        callTool: async (toolName: string, args: Record<string, unknown>) => {
          if (toolName === "find_declaration") {
            return JSON.stringify([
              {
                name: "DoThrottle(float ThrottleValue)",
                name_path: "AVehicleTest_5_7Pawn/DoThrottle",
                kind: "Method",
                relative_path: "Source/VehicleTest_5_7/VehicleTest_5_7Pawn.h",
                location: { relative_path: "Source/VehicleTest_5_7/VehicleTest_5_7Pawn.h", line: 174, column: 7 },
                body_location: { start_line: 174, end_line: 174 },
              },
              {
                name: "AVehicleTest_5_7Pawn::DoThrottle(float ThrottleValue)",
                name_path: "AVehicleTest_5_7Pawn/DoThrottle",
                kind: "Method",
                relative_path: "Source/VehicleTest_5_7/VehicleTest_5_7Pawn.cpp",
                location: { relative_path: "Source/VehicleTest_5_7/VehicleTest_5_7Pawn.cpp", line: 258, column: 24 },
                body_location: { start_line: 258, end_line: 260 },
              },
            ])
          }

          if (toolName === "rename_symbol") {
            renameCalls.push(args)
            return "Successfully renamed DoThrottle to DoThrottle_LspProbe (3 changes applied)"
          }

          return JSON.stringify([])
        },
        disconnect: async () => {},
        initialize: async () => {},
      },
    })

    const result = await provider.rename({ filePath: sourcePath, line: 1, character: 2, newName: "DoThrottle_LspProbe" })

    expect(renameCalls).toEqual([
      {
        name_path: "AVehicleTest_5_7Pawn/DoThrottle",
        relative_path: "Source/VehicleTest_5_7/VehicleTest_5_7Pawn.h",
        new_name: "DoThrottle_LspProbe",
      },
    ])
    expect(result).toEqual({
      applied: true,
      message: "Successfully renamed DoThrottle to DoThrottle_LspProbe (3 changes applied)",
    })
  })
})
