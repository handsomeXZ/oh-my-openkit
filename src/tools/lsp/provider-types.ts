import type {
  Diagnostic,
  DocumentSymbol,
  Location,
  LocationLink,
  PrepareRenameDefaultBehavior,
  PrepareRenameResult,
  RenameResult,
  SymbolInfo,
} from "./types"
import type { SerenaDiagnosticSeverity } from "./diagnostics-severity"

export type LspPositionArgs = {
  filePath: string
  line: number
  character: number
}

export type FindReferencesArgs = LspPositionArgs & {
  includeDeclaration?: boolean
}

export type SymbolsArgs = {
  filePath: string
  query: string
}

export type LspDiagnosticsArgs = {
  filePath: string
  startLine?: number
  endLine?: number
  minSeverity?: SerenaDiagnosticSeverity
  maxAnswerChars?: number
}

export interface LspProvider {
  gotoDefinition(args: LspPositionArgs): Promise<Location | Location[] | LocationLink[] | null>
  findReferences(args: FindReferencesArgs): Promise<Location[] | null>
  documentSymbols(filePath: string): Promise<DocumentSymbol[] | SymbolInfo[] | null>
  workspaceSymbols(args: SymbolsArgs): Promise<SymbolInfo[] | null>
  fileDiagnostics(args: LspDiagnosticsArgs): Promise<Diagnostic[]>
  prepareRename(args: LspPositionArgs): Promise<PrepareRenameResult | PrepareRenameDefaultBehavior | null>
  rename(args: LspPositionArgs & { newName: string }): Promise<RenameResult>
  dispose?(): Promise<void>
}
