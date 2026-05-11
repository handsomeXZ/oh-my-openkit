import { z } from "zod"

export const LspProviderSchema = z.enum(["builtin", "serena"])

export const SerenaTransportSchema = z.enum(["managed-http", "stdio"])

const SerenaCommandSchema = z.array(z.string()).min(1)

export const SerenaLspConfigSchema = z.object({
  /**
   * Serena transport contract.
   * - "managed-http": use a wrapper process that manages Serena over HTTP
   * - "stdio": start Serena directly over stdio
   *
   * Default runtime behavior: "managed-http"
   */
  transport: SerenaTransportSchema.optional(),
  /**
   * Deprecated alias for serenaCommand.
   * Kept for configs created while the Serena wrapper contract was experimental.
   */
  wrapperCommand: SerenaCommandSchema.optional(),
  /**
   * Command to start Serena directly in stdio mode.
   * Default runtime behavior remains provider-defined when omitted.
   */
  serenaCommand: SerenaCommandSchema.optional(),
  /**
   * Legacy stdio-style Serena command.
   * Accepted for backward compatibility and normalized into serenaCommand.
   */
  command: SerenaCommandSchema.optional(),
  /**
   * Environment variables for Serena or its wrapper.
   */
  env: z.record(z.string(), z.string()).optional(),
  /**
   * Required Serena tools for managed wrapper mode.
   */
  requiredTools: z.array(z.string()).optional(),
  /**
   * Project root path for the Serena provider.
   */
  projectRoot: z.string(),
})

export const LspConfigSchema = z.object({
  /**
   * LSP provider to use.
   * - "builtin": Use oh-my-opencode's built-in LSP (default)
   * - "serena": Use serena-lsp MCP for LSP operations
   */
  provider: LspProviderSchema.optional(),
  /**
   * Configuration for serena-lsp provider (only used when provider is "serena")
   */
  serena: SerenaLspConfigSchema.optional(),
})

export type SerenaLspConfigInput = z.infer<typeof SerenaLspConfigSchema>

export type NormalizedSerenaLspConfig = Omit<SerenaLspConfigInput, "transport" | "serenaCommand"> & {
  transport: z.infer<typeof SerenaTransportSchema>
  serenaCommand?: string[]
}

export type NormalizedLspConfig = Omit<z.infer<typeof LspConfigSchema>, "serena"> & {
  serena?: NormalizedSerenaLspConfig
}

export function normalizeSerenaLspConfig(
  input: SerenaLspConfigInput | undefined
): NormalizedSerenaLspConfig | undefined {
  if (!input) {
    return undefined
  }

  const transport =
    input.transport ?? (input.command && !input.serenaCommand && !input.wrapperCommand ? "stdio" : "managed-http")
  const serenaCommand = input.serenaCommand ?? input.wrapperCommand ?? input.command

  return {
    transport,
    wrapperCommand: input.wrapperCommand,
    serenaCommand,
    command: input.command,
    env: input.env,
    requiredTools: input.requiredTools,
    projectRoot: input.projectRoot,
  }
}

export function normalizeLspConfig(input: z.infer<typeof LspConfigSchema>): NormalizedLspConfig {
  return {
    ...input,
    serena: normalizeSerenaLspConfig(input.serena),
  }
}

export type LspProvider = z.infer<typeof LspProviderSchema>
export type LspConfig = z.infer<typeof LspConfigSchema>
