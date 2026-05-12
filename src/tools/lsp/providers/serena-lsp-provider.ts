import type {
  FindReferencesArgs,
  LspDiagnosticsArgs,
  LspPositionArgs,
  LspProvider,
  SymbolsArgs,
} from "../provider-types"
import type {
  Diagnostic,
  DocumentSymbol,
  Location,
  LocationLink,
  PrepareRenameDefaultBehavior,
  PrepareRenameResult,
  RenameResult,
  SymbolInfo,
} from "../types"

import {
  convertToDocumentSymbol,
  convertToSymbolInfo,
  sanitizeDocumentSymbols,
} from "./serena-symbol-formatters"
import { findSerenaDeclaration } from "./serena-declaration"
import { getSerenaFileDiagnostics } from "./serena-diagnostics"
import { getDetailedTopLevelSymbols as loadDetailedTopLevelSymbols } from "./serena-detailed-symbols"
import { parseJsonResult } from "./serena-json-result"
import { prepareSerenaRename, renameSerenaSymbol } from "./serena-rename"
import { findSerenaReferences } from "./serena-references"
import {
  toRelativePath,
} from "./serena-symbol-lookup"
import { SerenaMcpClient } from "./serena-mcp-client"
import type { SerenaLspProviderConfig, SerenaSymbol } from "./serena-symbol-types"
import { filterWorkspaceSymbols } from "./serena-workspace-symbol-filter"

export class SerenaLspProvider implements LspProvider {
  private readonly config: SerenaLspProviderConfig
  private readonly mcpClient = new SerenaMcpClient()

  constructor(config: SerenaLspProviderConfig) {
    this.config = config
  }

  async initialize(): Promise<void> {
    await this.mcpClient.initialize(this.config)
  }

  async dispose(): Promise<void> {
    await this.mcpClient.disconnect()
  }

  private callTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    return this.mcpClient.callTool(toolName, args)
  }

  private async getDetailedTopLevelSymbols(relativePath: string, depth: number): Promise<SerenaSymbol[]> {
    return loadDetailedTopLevelSymbols(relativePath, depth, (toolName, args) => this.callTool(toolName, args))
  }

  private async refreshRenameState(args: { failOnError: boolean; phase: "before" | "after" }): Promise<void> {
    if (typeof this.mcpClient.disconnect !== "function" || typeof this.mcpClient.initialize !== "function") {
      return
    }

    try {
      await this.mcpClient.disconnect()
      await this.mcpClient.initialize(this.config)
    } catch (error) {
      if (args.failOnError) {
        throw new Error(`Failed to refresh Serena state ${args.phase} rename: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }

  async gotoDefinition(args: LspPositionArgs): Promise<Location | Location[] | LocationLink[] | null> {
    return findSerenaDeclaration(this.config, args, (toolName, toolArgs) => this.callTool(toolName, toolArgs))
  }

  async findReferences(args: FindReferencesArgs): Promise<Location[] | null> {
    return findSerenaReferences(
      this.config,
      args,
      (toolName, toolArgs) => this.callTool(toolName, toolArgs),
      (relativePath, depth) => this.getDetailedTopLevelSymbols(relativePath, depth)
    )
  }

  async documentSymbols(filePath: string): Promise<DocumentSymbol[] | SymbolInfo[] | null> {
    const relativePath = toRelativePath(this.config.projectRoot, filePath)
    const symbols = await this.getDetailedTopLevelSymbols(relativePath, 2)
    return sanitizeDocumentSymbols(symbols).map((symbol) => convertToDocumentSymbol(symbol))
  }

  async workspaceSymbols(args: SymbolsArgs): Promise<SymbolInfo[] | null> {
    const result = await this.callTool("find_symbol", {
      name_path_pattern: args.query,
      relative_path: "",
      include_body: false,
      depth: 0,
      substring_matching: true,
    })

    return filterWorkspaceSymbols(parseJsonResult<SerenaSymbol[]>(result, "Serena find_symbol")).map((symbol) =>
      convertToSymbolInfo(this.config.projectRoot, symbol)
    )
  }

  async fileDiagnostics(args: LspDiagnosticsArgs): Promise<Diagnostic[]> {
    return getSerenaFileDiagnostics(this.config.projectRoot, args, (toolName, toolArgs) => this.callTool(toolName, toolArgs))
  }

  async prepareRename(args: LspPositionArgs): Promise<PrepareRenameResult | PrepareRenameDefaultBehavior | null> {
    return prepareSerenaRename(this.config, args, {
      callTool: (toolName, toolArgs) => this.callTool(toolName, toolArgs),
      loadDetailedSymbols: (relativePath, depth) => this.getDetailedTopLevelSymbols(relativePath, depth),
    })
  }

  async rename(args: LspPositionArgs & { newName: string }): Promise<RenameResult> {
    await this.refreshRenameState({ failOnError: true, phase: "before" })

    const result = await renameSerenaSymbol(this.config, args, {
      callTool: (toolName, toolArgs) => this.callTool(toolName, toolArgs),
      loadDetailedSymbols: (relativePath, depth) => this.getDetailedTopLevelSymbols(relativePath, depth),
    })

    if (result?.applied) {
      await this.refreshRenameState({ failOnError: false, phase: "after" })
    }

    return result
  }
}
