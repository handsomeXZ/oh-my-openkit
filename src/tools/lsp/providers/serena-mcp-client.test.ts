import { describe, expect, test } from "bun:test"
import type { Client } from "@modelcontextprotocol/sdk/client/index.js"
import type { Tool } from "@modelcontextprotocol/sdk/types.js"
import { SERENA_LSP_REQUIRED_TOOLS } from "../../../shared/serena-lsp-required-tools"
import { SerenaCapabilityMismatchError, SerenaMcpClient } from "./serena-mcp-client"
import type { SerenaMcpConfig } from "./serena-symbol-types"

type FakeClientState = {
  connectedTransport: unknown[]
  listedTools: Tool[]
  closed: number
}

function createFakeClient(state: FakeClientState): Client {
  return {
    connect: async (transport: unknown) => {
      state.connectedTransport.push(transport)
    },
    close: async () => {
      state.closed += 1
    },
    listTools: async () => ({ tools: state.listedTools }),
    callTool: async () => ({ content: [] }),
  } as unknown as Client
}

function createRequiredToolRecords(): Tool[] {
  return SERENA_LSP_REQUIRED_TOOLS.map((name) => ({ name, description: "", inputSchema: { type: "object" } }))
}

describe("SerenaMcpClient", () => {
  test("uses HTTP MCP config for managed-http transport", async () => {
    const clientState: FakeClientState = {
      connectedTransport: [],
      listedTools: createRequiredToolRecords(),
      closed: 0,
    }
    const fakeTransport = {
      close: async () => {},
    }
    let receivedConfig: SerenaMcpConfig | null = null

    const client = new SerenaMcpClient({
      createClient: () => createFakeClient(clientState),
      createTransport: (config) => {
        receivedConfig = config
        return fakeTransport as never
      },
    })

    await client.initialize({
      transport: "managed-http",
      url: "https://serena.example.com/mcp?token=secret",
      headers: { Authorization: "Bearer token" },
      projectRoot: "D:/repo",
    })

    expect(receivedConfig).toEqual({
      type: "http",
      url: "https://serena.example.com/mcp?token=secret",
      headers: { Authorization: "Bearer token" },
    })
    expect(clientState.connectedTransport).toHaveLength(1)
    expect(clientState.closed).toBe(0)
  })

  test("throws deterministic capability mismatch when required tools are missing", async () => {
    const clientState: FakeClientState = {
      connectedTransport: [],
      listedTools: [{ name: "find_symbol", description: "", inputSchema: { type: "object" } }],
      closed: 0,
    }
    let transportClosed = 0

    const client = new SerenaMcpClient({
      createClient: () => createFakeClient(clientState),
      createTransport: () => ({
        close: async () => {
          transportClosed += 1
        },
      }) as never,
    })

    const result = client.initialize({
      projectRoot: "D:/repo",
      requiredTools: ["get_symbols_overview", "find_symbol", "get_symbols_overview"],
    })

    await expect(result).rejects.toBeInstanceOf(SerenaCapabilityMismatchError)
    await expect(result).rejects.toMatchObject({
      message: "Serena MCP capability mismatch: missing required tools [find_declaration, find_referencing_symbols, get_diagnostics_for_file, get_symbols_overview, rename_symbol]; available tools [find_symbol]",
      missingTools: ["find_declaration", "find_referencing_symbols", "get_diagnostics_for_file", "get_symbols_overview", "rename_symbol"],
      availableTools: ["find_symbol"],
    })
    expect(clientState.closed).toBe(1)
    expect(transportClosed).toBe(1)
  })

  test("uses wrapperCommand as deprecated Serena command prefix when managed-http has no url", async () => {
    const clientState: FakeClientState = {
      connectedTransport: [],
      listedTools: createRequiredToolRecords(),
      closed: 0,
    }
    const fakeTransport = {
      close: async () => {},
    }
    let receivedConfig: SerenaMcpConfig | null = null

    const client = new SerenaMcpClient({
      createClient: () => createFakeClient(clientState),
      createTransport: (config) => {
        receivedConfig = config
        return fakeTransport as never
      },
    })

    await client.initialize({
      transport: "managed-http",
      wrapperCommand: ["serena"],
      projectRoot: "D:/repo",
    })

    expect(receivedConfig).toEqual({
      type: "stdio",
      command: ["serena", "start-mcp-server", "--context", "claude-code", "--project", "D:/repo"],
      env: undefined,
    })
    expect(clientState.connectedTransport).toHaveLength(1)
    expect(clientState.closed).toBe(0)
  })

  test("preserves an explicit stdio start-mcp-server command", async () => {
    const clientState: FakeClientState = {
      connectedTransport: [],
      listedTools: createRequiredToolRecords(),
      closed: 0,
    }
    let receivedConfig: SerenaMcpConfig | null = null

    const client = new SerenaMcpClient({
      createClient: () => createFakeClient(clientState),
      createTransport: (config) => {
        receivedConfig = config
        return { close: async () => {} } as never
      },
    })

    await client.initialize({
      transport: "stdio",
      serenaCommand: ["uvx", "serena", "start-mcp-server", "--context", "claude-code"],
      projectRoot: "D:/repo",
    })

    expect(receivedConfig).toEqual({
      type: "stdio",
      command: ["uvx", "serena", "start-mcp-server", "--context", "claude-code"],
      env: undefined,
    })
  })

  test("requires the Serena LSP tool contract even when config omits requiredTools", async () => {
    const clientState: FakeClientState = {
      connectedTransport: [],
      listedTools: [{ name: "find_symbol", description: "", inputSchema: { type: "object" } }],
      closed: 0,
    }
    const client = new SerenaMcpClient({
      createClient: () => createFakeClient(clientState),
      createTransport: () => ({ close: async () => {} }) as never,
    })

    const result = client.initialize({ projectRoot: "D:/repo" })

    await expect(result).rejects.toMatchObject({
      missingTools: ["find_declaration", "find_referencing_symbols", "get_diagnostics_for_file", "get_symbols_overview", "rename_symbol"],
    })
  })
})
