# src/tools/lsp/ — LSP Tool Implementations

**Generated:** 2026-03-06

## OVERVIEW

33 files. Full LSP (Language Server Protocol) client stack exposed as 6 tools. Custom implementation that manages server processes, opens files, and forwards requests — does NOT delegate to OpenCode's built-in LSP.

## TOOL EXPOSURE

| Tool | File | What It Does |
|------|------|--------------|
| `lsp_goto_definition` | `goto-definition-tool.ts` | Jump to symbol definition |
| `lsp_find_references` | `find-references-tool.ts` | All usages of a symbol |
| `lsp_symbols` | `symbols-tool.ts` | Document outline or workspace symbol search |
| `lsp_diagnostics` | `diagnostics-tool.ts` | Errors/warnings from language server |
| `lsp_prepare_rename` | `rename-tools.ts` | Validate rename before applying |
| `lsp_rename` | `rename-tools.ts` | Apply safe rename across workspace |

All 6 are direct `ToolDefinition` objects (not factory functions) — registered directly in `tool-registry.ts`.

## ARCHITECTURE

```
tools.ts (6 ToolDefinition exports)
  ↓ uses
LspClientWrapper (lsp-client-wrapper.ts)
  ↓ wraps
LSPClient (lsp-client.ts) extends LSPClientConnection (lsp-client-connection.ts)
  ↓ communicates via
LSPClientTransport (lsp-client-transport.ts)
  ↓ talks to
LSPProcess (lsp-process.ts) — spawns server binary
```

## KEY FILES

| File | Purpose |
|------|---------|
| `lsp-client-wrapper.ts` | High-level entry: resolves server, opens file, runs request |
| `lsp-client.ts` | `LSPClient` — file tracking, document sync (`didOpen`/`didChange`) |
| `lsp-client-connection.ts` | JSON-RPC request/response/notification layer |
| `lsp-client-transport.ts` | stdin/stdout byte-stream framing |
| `lsp-process.ts` | Spawn + cleanup of LSP server process |
| `lsp-manager-process-cleanup.ts` | Reap orphan LSP processes on exit |
| `lsp-manager-temp-directory-cleanup.ts` | Clean temp dirs used by some servers |
| `server-definitions.ts` | 40+ builtin servers synced from OpenCode's `server.ts` |
| `server-config-loader.ts` | Load custom server config from `.opencode/lsp.json` |
| `server-resolution.ts` | Resolve which server handles a file extension |
| `server-installation.ts` | Detect missing binaries, surface install hints |
| `language-mappings.ts` | Extension → language ID mapping |
| `lsp-formatters.ts` | Format LSP responses into human-readable strings |
| `workspace-edit.ts` | Apply `WorkspaceEdit` results to disk (for rename) |
| `types.ts` | `LSPServerConfig`, `Position`, `Range`, `Location`, `Diagnostic` etc. |

## SERVER RESOLUTION

```
file.ts → extension (.ts) → language-mappings → server ID (typescript)
  → server-resolution: check user config (.opencode/lsp.json) → fall back to server-definitions.ts
  → server-installation: verify binary exists (warn with install hint if not)
  → LSPProcess.spawn(command[])
```

## NOTES

- File must be opened via `didOpen` before any LSP request — `LSPClient.openFile()` handles this
- 1s delay after `didOpen` for server initialization before sending requests
- `lsp_servers` tool was removed — duplicates OpenCode's built-in `LspServers` tool
- Synced with OpenCode's `server.ts` — when adding servers, check upstream first

## OWNERSHIP BOUNDARY

Keep future changes split by merge risk:

- **Sync zone**: `lsp-client.ts`, `lsp-client-connection.ts`, `lsp-client-transport.ts`, `lsp-process.ts`, `lsp-server.ts`, `workspace-edit.ts`, `server-definitions.ts`, `language-mappings.ts`
  - Prefer upstream-compatible protocol/runtime changes only
  - Avoid local product policy unless absolutely necessary
- **Local adapter zone**: `facade/`, `providers/`, `file-path-utils.ts`, `workspace-root-policy.ts`, `server-lookup-error.ts`, `server-config-loader.ts`, `directory-diagnostics.ts`
  - Put local workspace-root policy, diagnostics orchestration, formatting, and future customization here
  - Keep public `lsp_*` tools stable and route behavior through these adapters first

Rule of thumb: if a change is about protocol/process correctness, touch sync zone; if it is about repo-specific behavior, fallback policy, or extension points, touch local adapter zone.
