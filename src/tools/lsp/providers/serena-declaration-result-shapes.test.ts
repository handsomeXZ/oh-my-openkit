import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { describe, expect, test } from "bun:test"

import { pathToUri } from "../file-path-utils"
import { findSerenaDeclaration } from "./serena-declaration"

async function createUseFile(projectRoot: string, relativeDirectory = "src"): Promise<string> {
  const sourceDirectory = join(projectRoot, relativeDirectory)
  await mkdir(sourceDirectory, { recursive: true })
  const filePath = join(sourceDirectory, "use.ts")
  await writeFile(filePath, "target()\n", "utf8")
  return filePath
}

describe("Serena declaration result shapes", () => {
  test("#given Serena returns multiple declarations #when finding a declaration #then it returns all mapped locations", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "serena-declaration-"))
    const filePath = await createUseFile(projectRoot)

    const location = await findSerenaDeclaration(
      { projectRoot },
      { filePath, line: 1, character: 1 },
      async () => JSON.stringify([
        {
          name: "target",
          name_path: "target",
          kind: "Function",
          relative_path: "src/defs-a.ts",
          body_location: { start_line: 2, end_line: 3 },
        },
        {
          name: "target",
          name_path: "target",
          kind: "Function",
          relative_path: "src/defs-b.ts",
          body_location: { start_line: 5, end_line: 6 },
        },
      ])
    )

    expect(location).toEqual([
      {
        uri: pathToUri(join(projectRoot, "src", "defs-a.ts")),
        range: { start: { line: 2, character: 0 }, end: { line: 2, character: 0 } },
      },
      {
        uri: pathToUri(join(projectRoot, "src", "defs-b.ts")),
        range: { start: { line: 5, character: 0 }, end: { line: 5, character: 0 } },
      },
    ])
  })

  test("#given Serena returns grouped declarations #when finding a declaration #then it recursively maps nested symbols", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "serena-declaration-"))
    const filePath = await createUseFile(projectRoot)

    const location = await findSerenaDeclaration(
      { projectRoot },
      { filePath, line: 1, character: 1 },
      async () => JSON.stringify({
        declarations: {
          Function: [{
            name: "target",
            name_path: "target",
            kind: "Function",
            relative_path: "src/defs.ts",
            location: { relative_path: "src/defs.ts", line: 7, column: 2 },
            body_location: { start_line: 7, end_line: 8 },
          }],
        },
      })
    )

    expect(location).toEqual({
      uri: pathToUri(join(projectRoot, "src", "defs.ts")),
      range: { start: { line: 7, character: 2 }, end: { line: 7, character: 8 } },
    })
  })

  test("#given Serena returns source and intermediate declarations #when finding a declaration #then it preserves source-preferred filtering", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "serena-declaration-"))
    const filePath = await createUseFile(projectRoot, join("Source", "Module"))

    const location = await findSerenaDeclaration(
      { projectRoot },
      { filePath, line: 1, character: 1 },
      async () => JSON.stringify([
        {
          name: "target",
          name_path: "target",
          kind: "Function",
          relative_path: "Intermediate/Build/target.generated.cpp",
          body_location: { start_line: 1, end_line: 2 },
        },
        {
          name: "target",
          name_path: "target",
          kind: "Function",
          relative_path: "Source/Module/target.cpp",
          body_location: { start_line: 3, end_line: 4 },
        },
      ])
    )

    expect(location).toEqual({
      uri: pathToUri(join(projectRoot, "Source", "Module", "target.cpp")),
      range: { start: { line: 3, character: 0 }, end: { line: 3, character: 0 } },
    })
  })
})
