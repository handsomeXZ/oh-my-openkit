/// <reference types="bun-types" />

import { describe, expect, test } from "bun:test"

import { pathToUri } from "./file-path-utils"
import { formatApplyResult, formatLocation } from "./lsp-formatters"

describe("formatApplyResult", () => {
  test("#given an already-applied provider rename result #when formatted #then it marks the message as a Serena summary", () => {
    expect(formatApplyResult({
      success: true,
      filesModified: [],
      totalEdits: 0,
      errors: [],
      message: "Successfully renamed target to renamedTarget (2 changes applied)",
    })).toBe("Serena reported: Successfully renamed target to renamedTarget (2 changes applied)")
  })
})

describe("formatLocation", () => {
  test("#given a standard Windows file URI #when formatted #then it preserves the full drive path", () => {
    expect(formatLocation({
      uri: pathToUri("D:/UE/Project/VehicleTest_5_7/Source/Vehicle.cpp"),
      range: { start: { line: 79, character: 0 }, end: { line: 79, character: 6 } },
    })).toBe("D:\\UE\\Project\\VehicleTest_5_7\\Source\\Vehicle.cpp:80:0")
  })

  test("#given a legacy Windows file URI #when formatted #then it preserves the full drive path", () => {
    expect(formatLocation({
      uri: "file://D:/UE/Project/VehicleTest_5_7/Source/Vehicle.cpp",
      range: { start: { line: 79, character: 0 }, end: { line: 79, character: 6 } },
    })).toBe("D:\\UE\\Project\\VehicleTest_5_7\\Source\\Vehicle.cpp:80:0")
  })
})
