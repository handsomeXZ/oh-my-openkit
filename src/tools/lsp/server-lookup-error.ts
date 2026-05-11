import type { ServerLookupResult } from "./types"

export function formatServerLookupError(result: Exclude<ServerLookupResult, { status: "found" }>): string {
  if (result.status === "not_installed") {
    const { server, installHint } = result
    return [
      `LSP server '${server.id}' is configured but NOT INSTALLED.`,
      "",
      `Command not found: ${server.command[0]}`,
      "",
      "To install:",
      `  ${installHint}`,
      "",
      `Supported extensions: ${server.extensions.join(", ")}`,
      "",
      "After installation, the server will be available automatically.",
      "Run 'LspServers' tool to verify installation status.",
    ].join("\n")
  }

  return [
    `No LSP server configured for extension: ${result.extension}`,
    "",
    `Available servers: ${result.availableServers.slice(0, 10).join(", ")}${result.availableServers.length > 10 ? "..." : ""}`,
    "",
    "To add a custom server, configure 'lsp' in oh-my-opencode.json:",
    "  {",
    '    "lsp": {',
    '      "my-server": {',
    '        "command": ["my-lsp", "--stdio"],',
    `        "extensions": ["${result.extension}"]`,
    "      }",
    "    }",
    "  }",
  ].join("\n")
}
