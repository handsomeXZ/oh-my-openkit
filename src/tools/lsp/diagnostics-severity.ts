export type DiagnosticSeverityFilter = "error" | "warning" | "information" | "hint" | "all"
export type SerenaDiagnosticSeverity = 1 | 2 | 3 | 4

const SEVERITY_THRESHOLDS: Record<Exclude<DiagnosticSeverityFilter, "all">, SerenaDiagnosticSeverity> = {
  error: 1,
  warning: 2,
  information: 3,
  hint: 4,
}

export function toSerenaMinSeverity(severity: DiagnosticSeverityFilter | undefined): SerenaDiagnosticSeverity {
  if (!severity || severity === "all") {
    return 4
  }

  return SEVERITY_THRESHOLDS[severity]
}

export function toSerenaDiagnosticSeverity(value: number | undefined): SerenaDiagnosticSeverity | undefined {
  switch (value) {
    case 1:
    case 2:
    case 3:
    case 4:
      return value
    default:
      return undefined
  }
}

export function resolveSerenaMinSeverity(
  severity: DiagnosticSeverityFilter | undefined,
  minSeverity: SerenaDiagnosticSeverity | undefined
): SerenaDiagnosticSeverity {
  return minSeverity ?? toSerenaMinSeverity(severity)
}

export function diagnosticMatchesSeverityThreshold(
  diagnosticSeverity: number | undefined,
  minSeverity: SerenaDiagnosticSeverity
): boolean {
  return diagnosticSeverity === undefined || diagnosticSeverity <= minSeverity
}
