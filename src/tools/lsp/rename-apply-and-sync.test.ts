/// <reference types="bun-types" />

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { beforeEach, describe, expect, mock, test } from "bun:test"

const openFileCalls: string[] = []
let managedClientError: Error | null = null

mock.module("./managed-client", () => ({
  withManagedClient: async (
    filePath: string,
    fn: (client: { openFile: (innerFilePath: string) => Promise<void> }, absPath: string) => Promise<unknown>
  ) => {
    if (managedClientError) {
      throw managedClientError
    }

    return fn(
      {
        openFile: async (innerFilePath: string) => {
          openFileCalls.push(innerFilePath)
        },
      },
      filePath
    )
  },
}))

import { pathToUri } from "./file-path-utils"
import { applyRenameAndSync } from "./rename-apply-and-sync"

describe("applyRenameAndSync", () => {
  beforeEach(() => {
    openFileCalls.length = 0
    managedClientError = null
  })

  test("syncs each modified builtin file back into the managed LSP client", async () => {
    const dir = mkdtempSync(join(tmpdir(), "rename-apply-sync-"))
    const headerPath = join(dir, "VehicleTest_5_7Pawn.h")
    const sourcePath = join(dir, "VehicleTest_5_7Pawn.cpp")

    try {
      writeFileSync(headerPath, "void DoLookAround(float YawDelta);\n")
      writeFileSync(sourcePath, "DoLookAround(Value.Get<float>());\n")

      const result = await applyRenameAndSync({
        edit: {
          changes: {
            [pathToUri(headerPath)]: [
              {
                range: {
                  start: { line: 0, character: 5 },
                  end: { line: 0, character: 17 },
                },
                newText: "DoLookAroundLspTest",
              },
            ],
            [pathToUri(sourcePath)]: [
              {
                range: {
                  start: { line: 0, character: 0 },
                  end: { line: 0, character: 12 },
                },
                newText: "DoLookAroundLspTest",
              },
            ],
          },
        },
        entryFilePath: headerPath,
        routeProvider: "builtin",
      })

      expect(result.success).toBe(true)
      expect(openFileCalls).toEqual([headerPath, sourcePath])
      expect(readFileSync(headerPath, "utf8")).toContain("DoLookAroundLspTest")
      expect(readFileSync(sourcePath, "utf8")).toContain("DoLookAroundLspTest")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("does not sync Serena applied rename results through the builtin client", async () => {
    const result = await applyRenameAndSync({
      edit: { applied: true, message: "Successfully renamed DoLookAround to DoLookAroundLspTest (4 changes applied)" },
      entryFilePath: "D:/repo/Source/VehicleTest_5_7/VehicleTest_5_7Pawn.h",
      routeProvider: "serena",
    })

    expect(result).toEqual({
      success: true,
      filesModified: [],
      totalEdits: 0,
      errors: [],
      message: "Successfully renamed DoLookAround to DoLookAroundLspTest (4 changes applied)",
    })
    expect(openFileCalls).toEqual([])
  })

  test("surfaces managed-client sync failures after applying builtin edits", async () => {
    const dir = mkdtempSync(join(tmpdir(), "rename-apply-sync-error-"))
    const filePath = join(dir, "file.ts")

    try {
      writeFileSync(filePath, "const target = 1\n")
      managedClientError = new Error("client unavailable")

      const result = await applyRenameAndSync({
        edit: {
          changes: {
            [pathToUri(filePath)]: [
              {
                range: {
                  start: { line: 0, character: 6 },
                  end: { line: 0, character: 12 },
                },
                newText: "renamedTarget",
              },
            ],
          },
        },
        entryFilePath: filePath,
        routeProvider: "builtin",
      })

      expect(result.success).toBe(false)
      expect(result.errors).toEqual(["Post-rename LSP sync failed: client unavailable"])
      expect(readFileSync(filePath, "utf8")).toContain("renamedTarget")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
