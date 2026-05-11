import type { LspDiagnosticsArgs } from "../provider-types"

import { toRelativePath } from "./serena-symbol-lookup"

export function createSerenaDiagnosticsArgs(
  projectRoot: string,
  args: LspDiagnosticsArgs
): Record<string, unknown> {
  const toolArgs: Record<string, unknown> = {
    relative_path: toRelativePath(projectRoot, args.filePath),
  }

  if (args.startLine !== undefined) {
    toolArgs.start_line = args.startLine
  }
  if (args.endLine !== undefined) {
    toolArgs.end_line = args.endLine
  }
  if (args.minSeverity !== undefined) {
    toolArgs.min_severity = args.minSeverity
  }
  if (args.maxAnswerChars !== undefined) {
    toolArgs.max_answer_chars = args.maxAnswerChars
  }

  return toolArgs
}
