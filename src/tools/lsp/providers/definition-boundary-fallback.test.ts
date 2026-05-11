/// <reference types="bun-types" />

import { describe, expect, test } from "bun:test"

import { getDefinitionBoundaryFallbackCharacterForLine } from "./definition-boundary-fallback"

describe("definition boundary fallback", () => {
  test("#given a cursor on the call parenthesis #when computing a fallback #then it shifts left into the identifier", () => {
    const fallbackCharacter = getDefinitionBoundaryFallbackCharacterForLine("DoResetVehicle();", 14)

    expect(fallbackCharacter).toBe(13)
  })

  test("#given a cursor after the final identifier character #when computing a fallback #then it clamps to the previous identifier", () => {
    const fallbackCharacter = getDefinitionBoundaryFallbackCharacterForLine("DoResetVehicle", 14)

    expect(fallbackCharacter).toBe(13)
  })

  test("#given a cursor already inside the identifier #when computing a fallback #then it does not change the position", () => {
    const fallbackCharacter = getDefinitionBoundaryFallbackCharacterForLine("DoResetVehicle();", 5)

    expect(fallbackCharacter).toBeNull()
  })

  test("#given the cursor at the first column #when computing a fallback #then it never produces a negative character", () => {
    const fallbackCharacter = getDefinitionBoundaryFallbackCharacterForLine("(target)", 0)

    expect(fallbackCharacter).toBeNull()
  })
})
