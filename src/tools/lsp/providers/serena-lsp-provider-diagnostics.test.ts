import { describe, expect, test } from "bun:test"

import { SerenaLspProvider } from "./serena-lsp-provider"

describe("SerenaLspProvider diagnostics", () => {
  test("#given Serena grouped diagnostics #when fileDiagnostics runs #then maps to LSP diagnostics", async () => {
    const provider = new SerenaLspProvider({ projectRoot: "D:/repo" }) as SerenaLspProvider & {
      mcpClient: { callTool: (toolName: string, args: Record<string, unknown>) => Promise<unknown> }
    }
    Object.defineProperty(provider, "mcpClient", {
      configurable: true,
      value: {
        callTool: async (toolName: string, args: Record<string, unknown>) => {
          expect(toolName).toBe("get_diagnostics_for_file")
          expect(args).toEqual({ relative_path: "src/file.ts" })
          return JSON.stringify({
            "src/file.ts": {
              error: {
                target: [
                  {
                    message: "Type mismatch",
                    severity: "error",
                    start_line: 2,
                    start_column: 4,
                    end_line: 2,
                    end_column: 10,
                    code: "TS2322",
                    source: "typescript",
                  },
                ],
              },
            },
          })
        },
      },
    })

    await expect(provider.fileDiagnostics({ filePath: "D:/repo/src/file.ts" })).resolves.toEqual([
      {
        range: {
          start: { line: 2, character: 4 },
          end: { line: 2, character: 10 },
        },
        severity: 1,
        code: "TS2322",
        source: "typescript",
        message: "Type mismatch",
      },
    ])
  })

  test("#given Serena diagnostics options #when fileDiagnostics runs #then passes native Serena arguments", async () => {
    const provider = new SerenaLspProvider({ projectRoot: "D:/repo" }) as SerenaLspProvider & {
      mcpClient: { callTool: (toolName: string, args: Record<string, unknown>) => Promise<unknown> }
    }
    Object.defineProperty(provider, "mcpClient", {
      configurable: true,
      value: {
        callTool: async (toolName: string, args: Record<string, unknown>) => {
          expect(toolName).toBe("get_diagnostics_for_file")
          expect(args).toEqual({
            relative_path: "src/file.ts",
            start_line: 4,
            end_line: 12,
            min_severity: 2,
            max_answer_chars: 500,
          })
          return JSON.stringify({})
        },
      },
    })

    await expect(provider.fileDiagnostics({
      filePath: "D:/repo/src/file.ts",
      startLine: 4,
      endLine: 12,
      minSeverity: 2,
      maxAnswerChars: 500,
    })).resolves.toEqual([])
  })
})
