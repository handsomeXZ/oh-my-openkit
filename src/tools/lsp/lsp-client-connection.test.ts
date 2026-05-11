declare const require: (name: string) => any
const { describe, test, expect } = require("bun:test")

import { LSPClientConnection } from "./lsp-client-connection"
import type { ResolvedServer } from "./types"

class TestLspClientConnection extends LSPClientConnection {
  public requests: Array<{ method: string; params: unknown }> = []
  public notifications: Array<{ method: string; params: unknown }> = []

  protected override async sendRequest<T>(method: string, params?: unknown): Promise<T> {
    this.requests.push({ method, params })
    return undefined as T
  }

  protected override sendNotification(method: string, params?: unknown): void {
    this.notifications.push({ method, params })
  }
}

describe("LSPClientConnection initialize capabilities", () => {
  test("advertises workDoneProgress support", async () => {
    const server: ResolvedServer = {
      id: "clangd",
      command: ["clangd"],
      extensions: [".cpp"],
      priority: 0,
    }

    const connection = new TestLspClientConnection("/workspace", server)
    await connection.initialize()

    expect(connection.requests).toHaveLength(1)
    expect(connection.requests[0].method).toBe("initialize")
    const initializeParams = connection.requests[0].params as {
      capabilities?: { window?: { workDoneProgress?: boolean } }
    }
    expect(initializeParams.capabilities?.window?.workDoneProgress).toBe(true)
  })
})
