import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { describe, expect, it } from "bun:test"

import { appendLspStderrLog, resolveWorkspaceRelativeLogPath } from "./stderr-log-writer"

describe("stderr log writer", () => {
  it("resolves workspace-relative log paths inside the workspace", () => {
    const root = mkdtempSync(join(tmpdir(), "lsp-stderr-writer-path-"))

    try {
      const resolved = resolveWorkspaceRelativeLogPath(root, ".logs/clangd.log")
      expect(resolved).toBe(join(root, ".logs", "clangd.log"))
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("rejects absolute log paths", () => {
    const root = mkdtempSync(join(tmpdir(), "lsp-stderr-writer-abs-"))

    try {
      const absolutePath = join(root, "outside.log")
      expect(() => resolveWorkspaceRelativeLogPath(root, absolutePath)).toThrow("workspace-relative")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("rejects traversal outside the workspace", () => {
    const root = mkdtempSync(join(tmpdir(), "lsp-stderr-writer-traversal-"))

    try {
      expect(() => resolveWorkspaceRelativeLogPath(root, "../outside.log")).toThrow("stay within the workspace")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("appends stderr text to the resolved workspace log file", () => {
    const root = mkdtempSync(join(tmpdir(), "lsp-stderr-writer-append-"))

    try {
      appendLspStderrLog(root, ".logs/clangd.log", "first line\n")
      appendLspStderrLog(root, ".logs/clangd.log", "second line\n")

      expect(readFileSync(join(root, ".logs", "clangd.log"), "utf-8")).toBe("first line\nsecond line\n")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
