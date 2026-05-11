/// <reference types="bun-types" />

import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { beforeEach, describe, expect, mock, test } from "bun:test"

import { pathToUri } from "../file-path-utils"
import type { Location } from "../types"

type DefinitionResult = Location | Location[] | null

const definitionCalls: number[] = []
let definitionResponses: DefinitionResult[] = []

mock.module("../managed-client", () => ({
  withManagedClient: async (
    filePath: string,
    fn: (client: { definition: (innerFilePath: string, line: number, character: number) => Promise<DefinitionResult> }, absPath: string) => Promise<unknown>
  ) =>
    fn(
      {
        definition: async (_innerFilePath: string, _line: number, character: number) => {
          definitionCalls.push(character)
          return definitionResponses.shift() ?? null
        },
      },
      filePath
    ),
}))

import { CustomLspProvider } from "./custom-lsp-provider"

describe("CustomLspProvider gotoDefinition", () => {
  beforeEach(() => {
    definitionCalls.length = 0
    definitionResponses = []
  })

  test("#given a boundary cursor that misses initially #when gotoDefinition runs #then it retries on the previous identifier character", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "custom-lsp-provider-"))
    const sourceDirectory = join(projectRoot, "Source", "VehicleTest_5_7")
    await mkdir(sourceDirectory, { recursive: true })
    const filePath = join(sourceDirectory, "VehicleTest_5_7Pawn.cpp")
    await writeFile(filePath, "DoResetVehicle();\n", "utf8")

    definitionResponses = [
      null,
      {
        uri: pathToUri(`${projectRoot}/Source/VehicleTest_5_7/VehicleTest_5_7Pawn.cpp`),
        range: {
          start: { line: 258, character: 0 },
          end: { line: 258, character: 14 },
        },
      },
    ]

    const provider = new CustomLspProvider()
    const location = await provider.gotoDefinition({ filePath, line: 1, character: 14 })

    expect(definitionCalls).toEqual([14, 13])
    expect(location).toEqual({
      uri: pathToUri(`${projectRoot}/Source/VehicleTest_5_7/VehicleTest_5_7Pawn.cpp`),
      range: {
        start: { line: 258, character: 0 },
        end: { line: 258, character: 14 },
      },
    })
  })

  test("#given a non-retryable cursor position #when gotoDefinition runs #then it does not probe negative or unrelated characters", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "custom-lsp-provider-"))
    const sourceDirectory = join(projectRoot, "src")
    await mkdir(sourceDirectory, { recursive: true })
    const filePath = join(sourceDirectory, "file.ts")
    await writeFile(filePath, "(target)\n", "utf8")

    definitionResponses = [null]

    const provider = new CustomLspProvider()
    const location = await provider.gotoDefinition({ filePath, line: 1, character: 0 })

    expect(definitionCalls).toEqual([0])
    expect(location).toBeNull()
  })
})
