import { describe, expect, test } from "bun:test"

import {
  diagnosticMatchesSeverityThreshold,
  resolveSerenaMinSeverity,
  toSerenaDiagnosticSeverity,
  toSerenaMinSeverity,
} from "./diagnostics-severity"

describe("diagnostics severity mapping", () => {
  test("#given a string severity #when mapping for Serena #then returns the native threshold", () => {
    expect(toSerenaMinSeverity("error")).toBe(1)
    expect(toSerenaMinSeverity("warning")).toBe(2)
    expect(toSerenaMinSeverity("information")).toBe(3)
    expect(toSerenaMinSeverity("hint")).toBe(4)
    expect(toSerenaMinSeverity("all")).toBe(4)
    expect(toSerenaMinSeverity(undefined)).toBe(4)
  })

  test("#given a raw minSeverity #when resolving Serena threshold #then raw value wins", () => {
    expect(resolveSerenaMinSeverity("hint", 2)).toBe(2)
  })

  test("#given an arbitrary number #when narrowing to Serena severity #then only native values pass", () => {
    expect(toSerenaDiagnosticSeverity(1)).toBe(1)
    expect(toSerenaDiagnosticSeverity(4)).toBe(4)
    expect(toSerenaDiagnosticSeverity(0)).toBeUndefined()
    expect(toSerenaDiagnosticSeverity(5)).toBeUndefined()
    expect(toSerenaDiagnosticSeverity(undefined)).toBeUndefined()
  })

  test("#given warning threshold #when filtering diagnostics #then errors and warnings match", () => {
    expect(diagnosticMatchesSeverityThreshold(1, 2)).toBe(true)
    expect(diagnosticMatchesSeverityThreshold(2, 2)).toBe(true)
    expect(diagnosticMatchesSeverityThreshold(3, 2)).toBe(false)
    expect(diagnosticMatchesSeverityThreshold(undefined, 2)).toBe(true)
  })
})
