import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

declare const require: (name: string) => any
const { beforeEach, describe, expect, it, mock } = require("bun:test")

mock.module("vscode-jsonrpc/node", () => ({
  createMessageConnection: () => {
    throw new Error("not used in unit test")
  },
  StreamMessageReader: function StreamMessageReader() {},
  StreamMessageWriter: function StreamMessageWriter() {},
}))

import { LSPClientTransport } from "./lsp-client-transport"
import type { UnifiedProcess } from "./lsp-process"
import type { ResolvedServer } from "./types"
import { _resetLspProgressToastManagerForTesting, initLspProgressToastManager } from "../../features/lsp-progress-toast/manager"

class TestLspClientTransport extends LSPClientTransport {
  setProcess(proc: UnifiedProcess): void {
    this.proc = proc
  }

  beginStderrReading(): void {
    this.startStderrReading()
  }

  getStderrChunks(): string[] {
    return [...this.stderrBuffer]
  }

  notifyProgress(params: { token?: string | number; value?: Record<string, unknown> }): void {
    this.handleWorkDoneProgress(params)
  }

  registerProgressToken(token: string | number): void {
    this.workDoneTokens.add(token)
  }
}

function createReader(chunks: string[]) {
  let index = 0

  return {
    async read(): Promise<{ done: boolean; value: Uint8Array | undefined }> {
      if (index >= chunks.length) {
        return { done: true, value: undefined }
      }

      const value = new TextEncoder().encode(chunks[index])
      index++
      return { done: false, value }
    },
  }
}

function createProcess(stderrChunks: string[]): UnifiedProcess {
  return {
    stdin: { write() {} },
    stdout: { getReader: () => createReader([]) },
    stderr: { getReader: () => createReader(stderrChunks) },
    exitCode: null,
    exited: Promise.resolve(0),
    kill() {},
  }
}

async function waitForReaderFlush(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe("LSPClientTransport stderr logging", () => {
  let mockToast: ReturnType<typeof mock>

  beforeEach(() => {
    mockToast = mock(() => Promise.resolve())
    _resetLspProgressToastManagerForTesting()
    initLspProgressToastManager({
      tui: {
        showToast: mockToast,
      },
    } as never)
  })

  it("writes stderr chunks to a workspace-relative log file when configured", async () => {
    const root = mkdtempSync(join(tmpdir(), "lsp-stderr-log-test-"))
    const server: ResolvedServer = {
      id: "clangd",
      command: ["clangd", "--log=verbose"],
      extensions: [".c"],
      priority: 0,
      stderrLogFile: ".logs/clangd.log",
    }

    const transport = new TestLspClientTransport(root, server)
    transport.setProcess(createProcess(["first line\n", "second line\n"]))

    try {
      transport.beginStderrReading()
      await waitForReaderFlush()

      expect(readFileSync(join(root, ".logs", "clangd.log"), "utf-8")).toBe("first line\nsecond line\n")
      expect(transport.getStderrChunks()).toEqual(["first line\n", "second line\n"])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("keeps stderr buffering as a no-op when no log file is configured", async () => {
    const root = mkdtempSync(join(tmpdir(), "lsp-stderr-buffer-test-"))
    const server: ResolvedServer = {
      id: "clangd",
      command: ["clangd"],
      extensions: [".c"],
      priority: 0,
    }

    const transport = new TestLspClientTransport(root, server)
    transport.setProcess(createProcess(["buffer only\n"]))

    try {
      transport.beginStderrReading()
      await waitForReaderFlush()

      expect(transport.getStderrChunks()).toEqual(["buffer only\n"])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("forwards clangd work-done progress updates to the toast manager", () => {
    const root = mkdtempSync(join(tmpdir(), "lsp-progress-test-"))
    const server: ResolvedServer = {
      id: "clangd",
      command: ["clangd"],
      extensions: [".cpp"],
      priority: 0,
    }

    const transport = new TestLspClientTransport(root, server)
    try {
      transport.notifyProgress({
        token: "index",
        value: {
          kind: "begin",
          title: "Background indexing",
          message: "Scanning project",
          percentage: 5,
        },
      })
      transport.notifyProgress({
        token: "index",
        value: {
          kind: "end",
          message: "Done",
        },
      })

      expect(mockToast).toHaveBeenCalledTimes(2)
      expect(mockToast.mock.calls[0][0].body.title).toBe("LSP Index Started")
      expect(mockToast.mock.calls[1][0].body.title).toBe("LSP Index Ready")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("clears tracked progress on stop when no end notification arrives", async () => {
    const root = mkdtempSync(join(tmpdir(), "lsp-progress-stop-test-"))
    const server: ResolvedServer = {
      id: "clangd",
      command: ["clangd"],
      extensions: [".cpp"],
      priority: 0,
    }

    const transport = new TestLspClientTransport(root, server)
    transport.setProcess(createProcess([]))

    try {
      transport.notifyProgress({
        token: "index",
        value: {
          kind: "begin",
          title: "Background indexing",
          message: "Scanning project",
        },
      })

      expect(mockToast).toHaveBeenCalledTimes(1)
      await transport.stop()
      expect(mockToast).toHaveBeenCalledTimes(1)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
