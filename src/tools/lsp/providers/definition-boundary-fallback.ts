import { readFile } from "node:fs/promises"

const IDENTIFIER_CHAR_REGEX = /[A-Za-z0-9_$:~]/

function isIdentifierChar(character: string | undefined): boolean {
  return character != null && IDENTIFIER_CHAR_REGEX.test(character)
}

export function getDefinitionBoundaryFallbackCharacterForLine(lineText: string | undefined, character: number): number | null {
  if (lineText == null || lineText.length === 0 || character <= 0) {
    return null
  }

  const previousCharacterIndex = Math.min(character - 1, lineText.length - 1)
  const previousCharacter = lineText[previousCharacterIndex]
  if (!isIdentifierChar(previousCharacter)) {
    return null
  }

  if (character >= lineText.length) {
    return previousCharacterIndex
  }

  const currentCharacter = lineText[character]
  return isIdentifierChar(currentCharacter) ? null : previousCharacterIndex
}

export async function getDefinitionBoundaryFallbackCharacter(
  filePath: string,
  line: number,
  character: number
): Promise<number | null> {
  const content = await readFile(filePath, "utf8")
  const lines = content.split(/\r?\n/)
  return getDefinitionBoundaryFallbackCharacterForLine(lines[line - 1], character)
}
