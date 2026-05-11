/// <reference types="bun-types" />

import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { describe, expect, test } from "bun:test"

import { pathToUri } from "../file-path-utils"
import { createDeclarationQuery, createDeclarationRegex, findSerenaDeclaration } from "./serena-declaration"

describe("Serena declaration lookup", () => {
  test("#given a cursor on a symbol usage #when creating the declaration regex #then it captures only that symbol on that line", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "serena-declaration-"))
    const sourceDirectory = join(projectRoot, "src")
    await mkdir(sourceDirectory, { recursive: true })
    const filePath = join(sourceDirectory, "file.ts")
    await writeFile(filePath, "const value = target.call()\nconst other = target\n", "utf8")

    const regex = await createDeclarationRegex({ filePath, line: 2, character: 15 })

    expect(regex).toBe("\\A(?:[^\\n]*\\r?\\n){1}const other = (target)")
  })

  test("#given a cursor on a C++ qualified member pointer #when creating the declaration query #then it captures the member name", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "serena-declaration-"))
    const sourceDirectory = join(projectRoot, "Source", "VehicleTest_5_7")
    await mkdir(sourceDirectory, { recursive: true })
    const filePath = join(sourceDirectory, "VehicleTest_5_7Pawn.cpp")
    await writeFile(
      filePath,
      "GetWorld()->GetTimerManager().SetTimer(FlipCheckTimer, this, &AVehicleTest_5_7Pawn::FlippedCheck, FlipCheckTime, true);\n",
      "utf8"
    )

    const query = await createDeclarationQuery({ filePath, line: 1, character: 86 })

    expect(query).toEqual({
      regex:
        "\\A(?:[^\\n]*\\r?\\n){0}GetWorld\\(\\)->GetTimerManager\\(\\)\\.SetTimer\\(FlipCheckTimer, this, &AVehicleTest_5_7Pawn::(FlippedCheck), FlipCheckTime, true\\);",
      token: "FlippedCheck",
    })
  })

  test("#given Serena returns a declaration symbol with a location #when finding a declaration #then it maps the symbol to an exact LSP location", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "serena-declaration-"))
    const sourceDirectory = join(projectRoot, "src")
    await mkdir(sourceDirectory, { recursive: true })
    const filePath = join(sourceDirectory, "use.ts")
    await writeFile(filePath, "import { target } from './defs'\ntarget()\n", "utf8")
    const calls: { toolName: string; args: Record<string, unknown> }[] = []

    const location = await findSerenaDeclaration(
      { projectRoot },
      { filePath, line: 2, character: 1 },
      async (toolName, args) => {
        calls.push({ toolName, args })
        return JSON.stringify({
          name: "target",
          name_path: "target",
          kind: "Function",
          relative_path: "src/defs.ts",
          location: { relative_path: "src/defs.ts", line: 4, column: 16 },
          body_location: { start_line: 4, end_line: 6 },
        })
      }
    )

    expect(calls).toEqual([
      {
        toolName: "find_declaration",
        args: {
          relative_path: "src/use.ts",
          regex: "\\A(?:[^\\n]*\\r?\\n){1}(target)\\(\\)",
          include_body: false,
          include_info: false,
        },
      },
    ])
    expect(location).toEqual({
      uri: pathToUri(`${projectRoot}/src/defs.ts`),
      range: {
        start: { line: 4, character: 16 },
        end: { line: 4, character: 22 },
      },
    })
  })

  test("#given Serena returns a class and a C++ member declaration #when finding a declaration #then it prefers the requested member", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "serena-declaration-"))
    const sourceDirectory = join(projectRoot, "Source", "VehicleTest_5_7")
    await mkdir(sourceDirectory, { recursive: true })
    const filePath = join(sourceDirectory, "VehicleTest_5_7Pawn.cpp")
    await writeFile(
      filePath,
      "GetWorld()->GetTimerManager().SetTimer(FlipCheckTimer, this, &AVehicleTest_5_7Pawn::FlippedCheck, FlipCheckTime, true);\n",
      "utf8"
    )

    const location = await findSerenaDeclaration(
      { projectRoot },
      { filePath, line: 1, character: 86 },
      async () => JSON.stringify([
        {
          name: "AVehicleTest_5_7Pawn",
          name_path: "AVehicleTest_5_7Pawn",
          kind: "Class",
          relative_path: "Source/VehicleTest_5_7/VehicleTest_5_7Pawn.h",
          body_location: { start_line: 22, end_line: 205 },
        },
        {
          name: "FlippedCheck",
          name_path: "AVehicleTest_5_7Pawn/FlippedCheck",
          kind: "Method",
          relative_path: "Source/VehicleTest_5_7/VehicleTest_5_7Pawn.h",
          body_location: { start_line: 192, end_line: 193 },
        },
      ])
    )

    expect(location).toEqual({
      uri: pathToUri(`${projectRoot}/Source/VehicleTest_5_7/VehicleTest_5_7Pawn.h`),
      range: {
        start: { line: 192, character: 0 },
        end: { line: 192, character: 0 },
      },
    })
  })

  test("#given Serena returns only body_location #when finding a declaration #then it returns an explicit line-level fallback", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "serena-declaration-"))
    const sourceDirectory = join(projectRoot, "src")
    await mkdir(sourceDirectory, { recursive: true })
    const filePath = join(sourceDirectory, "use.ts")
    await writeFile(filePath, "target()\n", "utf8")

    const location = await findSerenaDeclaration(
      { projectRoot },
      { filePath, line: 1, character: 1 },
      async () => JSON.stringify({
        name: "target",
        name_path: "target",
        kind: "Function",
        relative_path: "src/defs.ts",
        body_location: { start_line: 4, end_line: 6 },
      })
    )

    expect(location).toEqual({
      uri: pathToUri(`${projectRoot}/src/defs.ts`),
      range: {
        start: { line: 4, character: 0 },
        end: { line: 4, character: 0 },
      },
    })
  })

  test("#given Serena returns a declaration without usable location fields #when finding a declaration #then it returns null", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "serena-declaration-"))
    const sourceDirectory = join(projectRoot, "src")
    await mkdir(sourceDirectory, { recursive: true })
    const filePath = join(sourceDirectory, "use.ts")
    await writeFile(filePath, "target()\n", "utf8")

    const location = await findSerenaDeclaration(
      { projectRoot },
      { filePath, line: 1, character: 1 },
      async () => JSON.stringify({ name: "target", name_path: "target", kind: "Function" })
    )

    expect(location).toBeNull()
  })
})
