import { resolve } from "path"

import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool"

import { DEFAULT_MAX_DIAGNOSTICS } from "./constants"
import {
  diagnosticMatchesSeverityThreshold,
  resolveSerenaMinSeverity,
  toSerenaDiagnosticSeverity,
} from "./diagnostics-severity"
import { lspFacade } from "./facade/lsp-facade"
import { formatDiagnostic } from "./lsp-formatters"
import { isDirectoryPath } from "./file-path-utils"

export const lsp_diagnostics: ToolDefinition = tool({
  description:
    'Get errors, warnings, hints from language server BEFORE running build. Use filePath for a single file, or filePath with extension for a directory. Do NOT pass both filePath and directory — use filePath for everything.',
  args: {
    filePath: tool.schema
      .string()
      .optional()
      .describe("File or directory path to check diagnostics for"),
    directory: tool.schema
      .string()
      .optional()
      .describe("Alias for filePath when checking a directory. Do NOT provide both filePath and directory."),
    severity: tool.schema
      .enum(["error", "warning", "information", "hint", "all"])
      .optional()
      .describe("Minimum severity threshold. warning includes errors and warnings, hint/all includes every diagnostic."),
    extension: tool.schema
      .string()
      .optional()
      .describe("Required if target is a directory. E.g., '.ts', '.py', '.go', '.java'"),
    startLine: tool.schema
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Optional 0-based start line passed through to serena-lsp diagnostics"),
    endLine: tool.schema
      .number()
      .int()
      .min(-1)
      .optional()
      .describe("Optional 0-based end line passed through to serena-lsp diagnostics. Use -1 for end of file."),
    maxAnswerChars: tool.schema
      .number()
      .int()
      .min(-1)
      .optional()
      .describe("Optional serena-lsp result character limit. Use -1 for no explicit limit."),
    minSeverity: tool.schema
      .number()
      .int()
      .min(1)
      .max(4)
      .optional()
      .describe("Optional raw serena-lsp severity threshold: 1 error, 2 warning, 3 information, 4 hint."),
  },
  execute: async (args, _context): Promise<string> => {
    try {
      const targetPath = args.filePath ?? args.directory
      if (!targetPath) {
        throw new Error("Provide either 'filePath' or 'directory' parameter.")
      }
      if (args.filePath && args.directory) {
        throw new Error("Provide only one of 'filePath' or 'directory', not both.")
      }

      const minSeverity = resolveSerenaMinSeverity(args.severity, toSerenaDiagnosticSeverity(args.minSeverity))
      const normalizedArgs = {
        ...args,
        filePath: targetPath,
        directory: undefined,
        minSeverity,
      }

      if (isDirectoryPath(resolve(targetPath))) {
        if (!args.extension) {
          throw new Error(
            `Directory path requires 'extension' parameter.\n\n` +
              `Example: lsp_diagnostics(filePath="src", extension=".ts")\n\n` +
              `Supported extensions: .ts, .tsx, .js, .py, .go, etc.`
          )
        }
        const directoryOutput = await lspFacade.diagnostics(normalizedArgs)
        return typeof directoryOutput === "string" ? directoryOutput : "No diagnostics found"
      }

      const diagnosticsOutput = await lspFacade.diagnostics(normalizedArgs)
      const diagnostics = Array.isArray(diagnosticsOutput)
        ? diagnosticsOutput.filter((diagnostic) => diagnosticMatchesSeverityThreshold(diagnostic.severity, minSeverity))
        : []

      if (diagnostics.length === 0) {
        return "No diagnostics found"
      }

      const total = diagnostics.length
      const truncated = total > DEFAULT_MAX_DIAGNOSTICS
      const limited = truncated ? diagnostics.slice(0, DEFAULT_MAX_DIAGNOSTICS) : diagnostics
      const lines = limited.map(formatDiagnostic)
      if (truncated) {
        lines.unshift(`Found ${total} diagnostics (showing first ${DEFAULT_MAX_DIAGNOSTICS}):`)
      }
      return lines.join("\n")
    } catch (e) {
      return `Error: ${e instanceof Error ? e.message : String(e)}`
    }
  },
})
