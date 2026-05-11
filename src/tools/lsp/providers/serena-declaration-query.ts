import { readFile } from "node:fs/promises"

import type { LspPositionArgs } from "../provider-types"

const IDENTIFIER_CHAR_REGEX = /[A-Za-z0-9_$:~]/
const CAPTURE_IDENTIFIER_CHAR_REGEX = /[A-Za-z0-9_$~]/

type TokenBounds = {
  start: number
  end: number
  cursor: number
}

export type DeclarationQuery = {
  regex: string
  token: string
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function isIdentifierChar(character: string | undefined): boolean {
  return character != null && IDENTIFIER_CHAR_REGEX.test(character)
}

function findTokenBounds(lineText: string, character: number): TokenBounds | null {
  if (lineText.length === 0) {
    return null
  }

  let cursor = Math.min(Math.max(character, 0), lineText.length - 1)
  if (!isIdentifierChar(lineText[cursor]) && isIdentifierChar(lineText[cursor - 1])) {
    cursor -= 1
  }
  if (!isIdentifierChar(lineText[cursor]) && isIdentifierChar(lineText[cursor + 1])) {
    cursor += 1
  }
  if (!isIdentifierChar(lineText[cursor])) {
    return null
  }

  let start = cursor
  let end = cursor + 1
  while (start > 0 && isIdentifierChar(lineText[start - 1])) {
    start -= 1
  }
  while (end < lineText.length && isIdentifierChar(lineText[end])) {
    end += 1
  }

  return { start, end, cursor }
}

function isCaptureIdentifierChar(character: string | undefined): boolean {
  return character != null && CAPTURE_IDENTIFIER_CHAR_REGEX.test(character)
}

function findCaptureBounds(lineText: string, tokenBounds: TokenBounds): { start: number; end: number } {
  let cursor = tokenBounds.cursor
  if (!isCaptureIdentifierChar(lineText[cursor]) && isCaptureIdentifierChar(lineText[cursor - 1])) {
    cursor -= 1
  }
  if (!isCaptureIdentifierChar(lineText[cursor]) && isCaptureIdentifierChar(lineText[cursor + 1])) {
    cursor += 1
  }

  if (!isCaptureIdentifierChar(lineText[cursor])) {
    return { start: tokenBounds.start, end: tokenBounds.end }
  }

  let start = cursor
  let end = cursor + 1
  while (start > tokenBounds.start && isCaptureIdentifierChar(lineText[start - 1])) {
    start -= 1
  }
  while (end < tokenBounds.end && isCaptureIdentifierChar(lineText[end])) {
    end += 1
  }

  return { start, end }
}

export async function createDeclarationQuery(args: LspPositionArgs): Promise<DeclarationQuery | null> {
  const content = await readFile(args.filePath, "utf8")
  const lines = content.split(/\r?\n/)
  const lineIndex = args.line - 1
  const lineText = lines[lineIndex]
  if (lineText == null) {
    return null
  }

  const tokenBounds = findTokenBounds(lineText, args.character)
  if (!tokenBounds) {
    return null
  }

  const captureBounds = findCaptureBounds(lineText, tokenBounds)
  const token = lineText.slice(captureBounds.start, captureBounds.end)
  const prefix = escapeRegex(lineText.slice(0, captureBounds.start))
  const suffix = escapeRegex(lineText.slice(captureBounds.end))
  return {
    regex: `\\A(?:[^\\n]*\\r?\\n){${lineIndex}}${prefix}(${escapeRegex(token)})${suffix}`,
    token,
  }
}

export async function createDeclarationRegex(args: LspPositionArgs): Promise<string | null> {
  return (await createDeclarationQuery(args))?.regex ?? null
}
