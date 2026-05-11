import { describe, expect, test } from "bun:test"

import { filterWorkspaceSymbols } from "./serena-workspace-symbol-filter"
import type { SerenaSymbol } from "./serena-symbol-types"

function createSymbol(namePath: string, relativePath: string): SerenaSymbol {
  return {
    name_path: namePath,
    kind: "Class",
    relative_path: relativePath,
    body_location: { start_line: 1, end_line: 2 },
  }
}

describe("Serena workspace symbol filtering", () => {
  test("prefers source symbols and drops generated Unreal helper symbols", () => {
    const symbols = [
      createSymbol("Vehicle", "Source/Game/Vehicle.h"),
      createSymbol("Vehicle", "Source\\Game\\Vehicle.h"),
      createSymbol("Vehicle/GENERATED_BODY/Helper", "Source/Game/Vehicle.generated.h"),
      createSymbol("Z_Construct_UClass_AVehicle", "Source/Game/Vehicle.gen.cpp"),
      createSymbol("Vehicle", "Intermediate/Build/Vehicle.h"),
    ]

    expect(filterWorkspaceSymbols(symbols)).toEqual([
      createSymbol("Vehicle", "Source/Game/Vehicle.h"),
    ])
  })

  test("falls back to non-intermediate symbols when no source symbol exists", () => {
    const symbols = [
      createSymbol("Tool", "Plugins/Tool/Tool.ts"),
      createSymbol("Tool", "Plugins/Tool/Tool.ts"),
      createSymbol("Tool", "Intermediate/Tool.ts"),
    ]

    expect(filterWorkspaceSymbols(symbols)).toEqual([
      createSymbol("Tool", "Plugins/Tool/Tool.ts"),
    ])
  })
})
