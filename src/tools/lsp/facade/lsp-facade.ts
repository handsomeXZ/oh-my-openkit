import { aggregateDiagnosticsForDirectory } from "../directory-diagnostics"
import { isDirectoryPath } from "../file-path-utils"
import { CustomLspProvider, SerenaLspProvider } from "../providers"
import type { Diagnostic } from "../types"
import type { SerenaDiagnosticSeverity } from "../diagnostics-severity"
import { resolveLspRoute, type LspCapability, type LspRouteDecision } from "./lsp-routing"
import type { FindReferencesArgs, LspDiagnosticsArgs, LspPositionArgs, LspProvider } from "./lsp-provider"

export interface SerenaFacadeConfig {
  transport?: "managed-http" | "stdio"
  wrapperCommand?: string[]
  serenaCommand?: string[]
  command?: string[]
  url?: string
  headers?: Record<string, string>
  env?: Record<string, string>
  requiredTools?: string[]
  projectRoot: string
}

export interface LspFacadeConfig {
  provider: "builtin" | "serena"
  serena?: SerenaFacadeConfig
}

type SerenaFacadeProvider = LspProvider & {
  initialize?: () => Promise<void>
}

export interface LspFacadeDependencies {
  createBuiltinProvider?: () => LspProvider
  createSerenaProvider?: (config: SerenaFacadeConfig) => SerenaFacadeProvider
}

export function resolveSerenaCommand(config: SerenaFacadeConfig): string[] | undefined {
  if (config.transport === "stdio") {
    return config.serenaCommand ?? config.command
  }

  return config.serenaCommand ?? config.command
}

class LspFacade {
  private readonly builtinProvider: LspProvider
  private readonly dependencies: LspFacadeDependencies
  private serenaProvider: SerenaFacadeProvider | null = null
  private config: LspFacadeConfig

  constructor(config: LspFacadeConfig, dependencies: LspFacadeDependencies = {}) {
    this.dependencies = dependencies
    this.builtinProvider = dependencies.createBuiltinProvider?.() ?? new CustomLspProvider()
    this.config = { provider: "builtin" }
    this.reconfigure(config)
  }

  private createSerenaProvider(config: SerenaFacadeConfig): SerenaFacadeProvider {
    return this.dependencies.createSerenaProvider?.(config) ?? new SerenaLspProvider({
      transport: config.transport,
      command: resolveSerenaCommand(config),
      serenaCommand: config.serenaCommand,
      wrapperCommand: config.wrapperCommand,
      url: config.url,
      headers: config.headers,
      env: config.env,
      requiredTools: config.requiredTools,
      projectRoot: config.projectRoot,
    })
  }

  private getRoute(capability: LspCapability): LspRouteDecision {
    const route = resolveLspRoute(this.config.provider, capability)

    if (route.provider === "serena" && !this.serenaProvider) {
      return {
        capability,
        provider: "builtin",
        reason: "builtin-fallback",
      }
    }

    return route
  }

  private getProviderForCapability(capability: LspCapability): LspProvider {
    const route = this.getRoute(capability)
    return route.provider === "serena" ? this.serenaProvider! : this.builtinProvider
  }

  reconfigure(config: LspFacadeConfig): void {
    this.config = config
    this.serenaProvider = config.provider === "serena" && config.serena ? this.createSerenaProvider(config.serena) : null
  }

  async initialize(): Promise<void> {
    if (this.config.provider === "serena") {
      await this.serenaProvider?.initialize?.()
    }
  }

  async dispose(): Promise<void> {
    await Promise.allSettled([
      this.serenaProvider?.dispose?.(),
      this.builtinProvider.dispose?.(),
    ])
    this.config = { provider: "builtin" }
    this.serenaProvider = null
  }

  getCurrentProvider(): string {
    return this.config.provider
  }

  getRoutingForCapability(capability: LspCapability): LspRouteDecision {
    return this.getRoute(capability)
  }

  gotoDefinition(args: LspPositionArgs) {
    return this.getProviderForCapability("gotoDefinition").gotoDefinition(args)
  }

  findReferences(args: FindReferencesArgs) {
    return this.getProviderForCapability("findReferences").findReferences(args)
  }

  documentSymbols(filePath: string) {
    return this.getProviderForCapability("documentSymbols").documentSymbols(filePath)
  }

  workspaceSymbols(filePath: string, query: string) {
    return this.getProviderForCapability("workspaceSymbols").workspaceSymbols({ filePath, query })
  }

  prepareRename(args: LspPositionArgs) {
    return this.getProviderForCapability("prepareRename").prepareRename(args)
  }

  rename(args: LspPositionArgs & { newName: string }) {
    return this.getProviderForCapability("rename").rename(args)
  }

  async diagnostics(args: {
    filePath: string
    extension?: string
    severity?: "error" | "warning" | "information" | "hint" | "all"
    startLine?: number
    endLine?: number
    minSeverity?: SerenaDiagnosticSeverity
    maxAnswerChars?: number
  }): Promise<string | Diagnostic[]> {
    const diagnosticsArgs: LspDiagnosticsArgs = {
      filePath: args.filePath,
      startLine: args.startLine,
      endLine: args.endLine,
      minSeverity: args.minSeverity,
      maxAnswerChars: args.maxAnswerChars,
    }

    if (isDirectoryPath(args.filePath)) {
      if (!args.extension) {
        throw new Error(
          `Directory path requires 'extension' parameter.\n\nExample: lsp_diagnostics(filePath="src", extension=".ts")\n\nSupported extensions: .ts, .tsx, .js, .py, .go, etc.`
        )
      }
      const provider = this.getProviderForCapability("diagnostics")
      return aggregateDiagnosticsForDirectory(args.filePath, args.extension, args.severity, undefined, args.minSeverity, (filePath) =>
        provider.fileDiagnostics({ ...diagnosticsArgs, filePath })
      )
    }

    return this.getProviderForCapability("diagnostics").fileDiagnostics(diagnosticsArgs)
  }
}

export const lspFacade = new LspFacade({ provider: "builtin" })

export function createLspFacade(config: LspFacadeConfig, dependencies?: LspFacadeDependencies): LspFacade {
  return new LspFacade(config, dependencies)
}
