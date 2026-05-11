import { withManagedClient } from "../managed-client"
import type { FindReferencesArgs, LspDiagnosticsArgs, LspPositionArgs, LspProvider, SymbolsArgs } from "../provider-types"
import type {
  Diagnostic,
  DocumentSymbol,
  Location,
  LocationLink,
  PrepareRenameDefaultBehavior,
  PrepareRenameResult,
  RenameResult,
  SymbolInfo,
} from "../types"

import { getDefinitionBoundaryFallbackCharacter } from "./definition-boundary-fallback"

function hasDefinitionResult(result: Location | Location[] | LocationLink[] | null): result is Location | Location[] | LocationLink[] {
  if (!result) {
    return false
  }

  return !Array.isArray(result) || result.length > 0
}

export class CustomLspProvider implements LspProvider {
  async dispose(): Promise<void> {}

  gotoDefinition(args: LspPositionArgs): Promise<Location | Location[] | LocationLink[] | null> {
    return withManagedClient(args.filePath, async (client, absPath) => {
      const result = (await client.definition(absPath, args.line, args.character)) as Location | Location[] | LocationLink[] | null
      if (hasDefinitionResult(result)) {
        return result
      }

      const fallbackCharacter = await getDefinitionBoundaryFallbackCharacter(absPath, args.line, args.character)
      if (fallbackCharacter == null || fallbackCharacter === args.character) {
        return null
      }

      return (await client.definition(absPath, args.line, fallbackCharacter)) as Location | Location[] | LocationLink[] | null
    })
  }

  findReferences(args: FindReferencesArgs): Promise<Location[] | null> {
    return withManagedClient(args.filePath, (client) =>
      client.references(args.filePath, args.line, args.character, args.includeDeclaration ?? true) as Promise<Location[] | null>
    )
  }

  documentSymbols(filePath: string): Promise<DocumentSymbol[] | SymbolInfo[] | null> {
    return withManagedClient(filePath, (client) =>
      client.documentSymbols(filePath) as Promise<DocumentSymbol[] | SymbolInfo[] | null>
    )
  }

  workspaceSymbols(args: SymbolsArgs): Promise<SymbolInfo[] | null> {
    return withManagedClient(args.filePath, (client) => client.workspaceSymbols(args.query) as Promise<SymbolInfo[] | null>)
  }

  async fileDiagnostics(args: LspDiagnosticsArgs): Promise<Diagnostic[]> {
    return withManagedClient(args.filePath, async (client) => {
      const result = (await client.diagnostics(args.filePath)) as { items?: Diagnostic[] } | Diagnostic[] | null
      if (!result) {
        return []
      }
      if (Array.isArray(result)) {
        return result
      }
      return result.items ?? []
    })
  }

  prepareRename(args: LspPositionArgs): Promise<PrepareRenameResult | PrepareRenameDefaultBehavior | null> {
    return withManagedClient(args.filePath, (client) =>
      client.prepareRename(args.filePath, args.line, args.character) as Promise<PrepareRenameResult | PrepareRenameDefaultBehavior | null>
    )
  }

  rename(args: LspPositionArgs & { newName: string }): Promise<RenameResult> {
    return withManagedClient(args.filePath, (client) =>
      client.rename(args.filePath, args.line, args.character, args.newName) as Promise<RenameResult>
    )
  }
}
