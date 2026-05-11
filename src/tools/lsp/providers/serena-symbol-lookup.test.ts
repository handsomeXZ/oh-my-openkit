import { describe, expect, test } from "bun:test"

import { toRelativePath } from "./serena-symbol-lookup"

describe("Serena symbol path lookup", () => {
  test("converts Windows paths to Serena relative paths", () => {
    expect(toRelativePath("D:\\repo", "D:\\repo\\src\\file.ts")).toBe("src/file.ts")
  })

  test("converts POSIX paths to Serena relative paths", () => {
    expect(toRelativePath("/repo", "/repo/src/file.ts")).toBe("src/file.ts")
  })

  test("leaves external paths unchanged", () => {
    expect(toRelativePath("/repo", "/other/src/file.ts")).toBe("/other/src/file.ts")
  })
})
