/// <reference types="bun-types" />

import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { describe, expect, test } from "bun:test"

import { pathToUri } from "../file-path-utils"
import { SerenaLspProvider } from "./serena-lsp-provider"

describe("SerenaLspProvider reference formatting", () => {
  test("findReferences preserves file paths from grouped Serena reference results", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "VehicleTest_5_7-"))
    const sourceDirectory = join(projectRoot, "Source", "VehicleTest")
    await mkdir(sourceDirectory, { recursive: true })
    const filePath = join(sourceDirectory, "Vehicle.cpp")
    await writeFile(filePath, "void AVehicle::Tick(float DeltaTime) {}\n", "utf8")
    const provider = new SerenaLspProvider({ projectRoot })
    Object.defineProperty(provider, "mcpClient", {
      configurable: true,
      value: {
        callTool: async (toolName: string, args: Record<string, unknown>) => {
          if (toolName === "get_symbols_overview") {
            return JSON.stringify({ Method: ["Tick"] })
          }
          if (toolName === "find_symbol" && args.relative_path === "Source/VehicleTest/Vehicle.cpp") {
            return JSON.stringify([
              {
                name: "Tick",
                name_path: "AVehicle/Tick",
                kind: "Method",
                relative_path: "Source/VehicleTest/Vehicle.cpp",
                location: { relative_path: "Source/VehicleTest/Vehicle.cpp", line: 0, column: 16 },
                body_location: { start_line: 0, end_line: 0 },
              },
            ])
          }
          if (toolName === "find_referencing_symbols") {
            return JSON.stringify({
              "Source/VehicleTest/VehicleController.cpp": {
                Method: [
                  {
                    name: "UpdateVehicle",
                    name_path: "AVehicleController::UpdateVehicle",
                    kind: "Method",
                    location: { line: 12, column: 8 },
                    body_location: { start_line: 12, end_line: 20 },
                  },
                ],
              },
            })
          }
          return JSON.stringify([])
        },
      },
    })

    const references = await provider.findReferences({ filePath, line: 1, character: 16 })

    expect(references?.map((location) => location.uri)).toEqual([
      pathToUri(`${projectRoot}/Source/VehicleTest/VehicleController.cpp`),
    ])
  })

  test("findReferences preserves multiple references inside the same containing symbol", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "serena-provider-"))
    const sourceDirectory = join(projectRoot, "src")
    await mkdir(sourceDirectory, { recursive: true })
    const filePath = join(sourceDirectory, "file.ts")
    await writeFile(filePath, "function target() {}\n", "utf8")
    const provider = new SerenaLspProvider({ projectRoot })
    Object.defineProperty(provider, "mcpClient", {
      configurable: true,
      value: {
        callTool: async (toolName: string, args: Record<string, unknown>) => {
          if (toolName === "get_symbols_overview") {
            return JSON.stringify({ Function: ["target"] })
          }
          if (toolName === "find_symbol" && args.relative_path === "src/file.ts") {
            return JSON.stringify([
              {
                name: "target",
                name_path: "target",
                kind: "Function",
                relative_path: "src/file.ts",
                location: { relative_path: "src/file.ts", line: 0, column: 9 },
                body_location: { start_line: 0, end_line: 0 },
              },
            ])
          }
          if (toolName === "find_referencing_symbols") {
            return JSON.stringify({
              "src/ref.ts": {
                Function: [
                  { name_path: "useTarget", kind: "Function", body_location: { start_line: 10, end_line: 20 }, content_around_reference: "... 11:\n > 12:  target()\n... 13:" },
                  { name_path: "useTarget", kind: "Function", body_location: { start_line: 10, end_line: 20 }, content_around_reference: "... 15:\n > 16:  target()\n... 17:" },
                ],
              },
            })
          }
          return JSON.stringify([])
        },
      },
    })

    const references = await provider.findReferences({ filePath, line: 1, character: 10 })

    expect(references).toEqual([
      {
        uri: pathToUri(`${projectRoot}/src/ref.ts`),
        range: { start: { line: 12, character: 0 }, end: { line: 12, character: 0 } },
      },
      {
        uri: pathToUri(`${projectRoot}/src/ref.ts`),
        range: { start: { line: 16, character: 0 }, end: { line: 16, character: 0 } },
      },
    ])
  })
})
