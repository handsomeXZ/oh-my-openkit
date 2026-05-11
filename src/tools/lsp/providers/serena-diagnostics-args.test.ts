import { describe, expect, test } from "bun:test"

import { createSerenaDiagnosticsArgs } from "./serena-diagnostics-args"

describe("Serena diagnostics arguments", () => {
  test("#given diagnostics options #when creating Serena args #then converts names and relative path", () => {
    expect(createSerenaDiagnosticsArgs("D:/repo", {
      filePath: "D:/repo/src/file.ts",
      startLine: 1,
      endLine: -1,
      minSeverity: 3,
      maxAnswerChars: -1,
    })).toEqual({
      relative_path: "src/file.ts",
      start_line: 1,
      end_line: -1,
      min_severity: 3,
      max_answer_chars: -1,
    })
  })
})
