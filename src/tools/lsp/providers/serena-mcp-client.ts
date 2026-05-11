import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"

import { resolveSerenaLspRequiredTools } from "../../../shared/serena-lsp-required-tools"
import type { SerenaLspProviderConfig, SerenaMcpConfig } from "./serena-symbol-types"

type SerenaClientTransport = StdioClientTransport | StreamableHTTPClientTransport

interface SerenaMcpClientDependencies {
  createClient: () => Client
  createTransport: (config: SerenaMcpConfig) => SerenaClientTransport
}

const defaultDependencies: SerenaMcpClientDependencies = {
  createClient: () => new Client({ name: "oh-my-opencode", version: "1.0.0" }, { capabilities: {} }),
  createTransport: (config) => {
    if (config.type === "http") {
      return new StreamableHTTPClientTransport(new URL(config.url), {
        requestInit: config.headers ? { headers: config.headers } : undefined,
      })
    }

    return new StdioClientTransport({
      command: config.command[0],
      args: config.command.slice(1),
      env: config.env,
    })
  },
}

export class SerenaCapabilityMismatchError extends Error {
  readonly missingTools: string[]
  readonly availableTools: string[]

  constructor(missingTools: string[], availableTools: string[]) {
    const missing = [...missingTools].sort()
    const available = [...availableTools].sort()
    super(
      `Serena MCP capability mismatch: missing required tools [${missing.join(", ")}]; ` +
      `available tools [${available.join(", ") || "none"}]`
    )
    this.name = "SerenaCapabilityMismatchError"
    this.missingTools = missing
    this.availableTools = available
  }
}

function redactUrl(urlStr: string): string {
  try {
    const url = new URL(urlStr)
    for (const key of url.searchParams.keys()) {
      if (
        key.toLowerCase().includes("key") ||
        key.toLowerCase().includes("token") ||
        key.toLowerCase().includes("secret")
      ) {
        url.searchParams.set(key, "***REDACTED***")
      }
    }
    return url.toString()
  } catch {
    return urlStr
  }
}

function buildDefaultSerenaCommand(projectRoot: string): string[] {
  return buildSerenaStdioCommand([
    "uvx",
    "--from",
    "git+https://github.com/oraios/serena",
    "serena",
  ], projectRoot)
}

function buildSerenaStdioCommand(command: string[], projectRoot: string): string[] {
  if (command.includes("start-mcp-server")) {
    return command
  }

  return [
    ...command,
    "start-mcp-server",
    "--context",
    "claude-code",
    "--project",
    projectRoot,
  ]
}

function createMcpConfig(config: SerenaLspProviderConfig): SerenaMcpConfig {
  const fallbackCommand = config.serenaCommand ?? config.wrapperCommand ?? config.command

  if (config.transport === "managed-http" && config.url) {
    try {
      new URL(config.url)
    } catch {
      throw new Error(`Serena MCP has invalid URL: ${redactUrl(config.url)}`)
    }

    return {
      type: "http",
      url: config.url,
      headers: config.headers,
    }
  }

  const command = fallbackCommand ?? buildDefaultSerenaCommand(config.projectRoot)
  return {
    type: "stdio",
    command: buildSerenaStdioCommand(command, config.projectRoot),
    env: config.env,
  }
}

export class SerenaMcpClient {
  private client: Client | null = null
  private transport: SerenaClientTransport | null = null

  constructor(private readonly dependencies: SerenaMcpClientDependencies = defaultDependencies) {}

  async initialize(config: SerenaLspProviderConfig): Promise<void> {
    if (this.client) {
      return
    }

    const mcpConfig = createMcpConfig(config)
    const client = this.dependencies.createClient()
    const transport = this.dependencies.createTransport(mcpConfig)

    try {
      await client.connect(transport)
      await this.validateRequiredTools(client, resolveSerenaLspRequiredTools(config.requiredTools))
      this.client = client
      this.transport = transport
    } catch (error) {
      try {
        await client.close()
      } catch {
        // Client may not have fully connected
      }

      try {
        await transport.close()
      } catch {
        // Transport may already be closed
      }

      if (error instanceof SerenaCapabilityMismatchError) {
        throw error
      }

      const errorMessage = error instanceof Error ? error.message : String(error)
      if (mcpConfig.type === "http") {
        throw new Error(
          `Failed to connect to Serena MCP over HTTP.\n\n` +
          `URL: ${redactUrl(mcpConfig.url)}\n` +
          `Reason: ${errorMessage}`
        )
      }

      throw new Error(`Failed to connect to Serena MCP over stdio.\n\nReason: ${errorMessage}`)
    }
  }

  private async validateRequiredTools(client: Client, requiredTools: string[]): Promise<void> {
    if (requiredTools.length === 0) {
      return
    }

    const uniqueRequiredTools = [...new Set(requiredTools)].sort()
    const result = await client.listTools()
    const availableTools = result.tools.map((tool) => tool.name).sort()
    const availableSet = new Set(availableTools)
    const missingTools = uniqueRequiredTools.filter((toolName) => !availableSet.has(toolName))

    if (missingTools.length > 0) {
      throw new SerenaCapabilityMismatchError(missingTools, availableTools)
    }
  }

  async callTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    if (!this.client) {
      throw new Error("SerenaMcpClient not initialized")
    }

    const result = await this.client.callTool({
      name: toolName,
      arguments: args,
    })

    if (typeof result.content === "string") {
      return result.content
    }

    if (Array.isArray(result.content) && result.content.length > 0) {
      const firstContent = result.content[0]
      if (firstContent && typeof firstContent === "object" && "text" in firstContent) {
        return firstContent.text
      }
    }

    return result.content
  }

  async disconnect(): Promise<void> {
    const client = this.client
    const transport = this.transport

    this.client = null
    this.transport = null

    if (client) {
      await client.close().catch(() => {})
    }

    if (transport) {
      await transport.close().catch(() => {})
    }
  }
}
