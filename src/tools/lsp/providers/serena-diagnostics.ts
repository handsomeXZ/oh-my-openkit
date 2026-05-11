import type { Diagnostic, Position, Range } from "../types"
import type { LspDiagnosticsArgs } from "../provider-types"

import { parseJsonResult } from "./serena-symbol-lookup"
import { createSerenaDiagnosticsArgs } from "./serena-diagnostics-args"

type CallSerenaTool = (toolName: string, args: Record<string, unknown>) => Promise<unknown>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function toNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function toStringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined
}

function toSeverity(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }

  if (typeof value !== "string") {
    return undefined
  }

  const severityMap: Record<string, number> = {
    error: 1,
    warning: 2,
    information: 3,
    info: 3,
    hint: 4,
  }
  return severityMap[value.toLowerCase()]
}

function toPosition(value: unknown, fallbackLine: number, fallbackCharacter: number): Position {
  if (!isRecord(value)) {
    return { line: fallbackLine, character: fallbackCharacter }
  }

  return {
    line: toNumber(value.line, fallbackLine),
    character: toNumber(value.character ?? value.column, fallbackCharacter),
  }
}

function toRange(record: Record<string, unknown>): Range {
  if (isRecord(record.range)) {
    return {
      start: toPosition(record.range.start, 0, 0),
      end: toPosition(record.range.end, toNumber(record.range.start_line, 0), 0),
    }
  }

  const startLine = toNumber(record.start_line ?? record.line, 0)
  const startCharacter = toNumber(record.start_column ?? record.column, 0)
  return {
    start: { line: startLine, character: startCharacter },
    end: {
      line: toNumber(record.end_line, startLine),
      character: toNumber(record.end_column, startCharacter),
    },
  }
}

function diagnosticFromRecord(record: Record<string, unknown>): Diagnostic | null {
  const message = toStringValue(record.message ?? record.diagnostic_message ?? record.text)
  if (!message) {
    return null
  }

  return {
    range: toRange(record),
    severity: toSeverity(record.severity),
    code: typeof record.code === "string" || typeof record.code === "number" ? record.code : undefined,
    source: toStringValue(record.source ?? record.name_path),
    message,
  }
}

function collectDiagnostics(value: unknown, diagnostics: Diagnostic[]): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectDiagnostics(item, diagnostics)
    }
    return
  }

  if (!isRecord(value)) {
    return
  }

  const diagnostic = diagnosticFromRecord(value)
  if (diagnostic) {
    diagnostics.push(diagnostic)
    return
  }

  for (const child of Object.values(value)) {
    collectDiagnostics(child, diagnostics)
  }
}

export async function getSerenaFileDiagnostics(
  projectRoot: string,
  args: LspDiagnosticsArgs,
  callTool: CallSerenaTool
): Promise<Diagnostic[]> {
  const result = await callTool("get_diagnostics_for_file", createSerenaDiagnosticsArgs(projectRoot, args))
  const parsedResult = parseJsonResult<unknown>(result)
  const diagnostics: Diagnostic[] = []
  collectDiagnostics(parsedResult, diagnostics)
  return diagnostics
}
