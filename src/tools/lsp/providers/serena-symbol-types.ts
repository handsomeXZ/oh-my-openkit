export interface SerenaLspProviderConfig {
  transport?: "managed-http" | "stdio"
  command?: string[]
  serenaCommand?: string[]
  wrapperCommand?: string[]
  url?: string
  headers?: Record<string, string>
  env?: Record<string, string>
  projectRoot: string
  requiredTools?: string[]
}

export interface SerenaStdioMcpConfig {
  type: "stdio"
  command: string[]
  env?: Record<string, string>
}

export interface SerenaHttpMcpConfig {
  type: "http"
  url: string
  headers?: Record<string, string>
}

export type SerenaMcpConfig = SerenaStdioMcpConfig | SerenaHttpMcpConfig

export type SerenaSymbolLocation = {
  relative_path?: string | null
  line?: number | null
  column?: number | null
}

export type SerenaBodyLocation = {
  start_line?: number | null
  end_line?: number | null
}

export type SerenaSymbol = {
  name?: string
  name_path?: string
  kind?: string
  location?: SerenaSymbolLocation
  body_location?: SerenaBodyLocation
  relative_path?: string | null
  content_around_reference?: string
  reference_line?: number | null
  reference_character?: number | null
  children?: SerenaSymbol[]
  containerName?: string
}

export type SerenaOverviewGrouped = Record<string, unknown>

export const SERENA_SYMBOL_KIND_MAP: Record<string, number> = {
  File: 1,
  Module: 2,
  Namespace: 3,
  Package: 4,
  Class: 5,
  Method: 6,
  Property: 7,
  Field: 8,
  Constructor: 9,
  Enum: 10,
  Interface: 11,
  Function: 12,
  Variable: 13,
  Constant: 14,
  String: 15,
  Number: 16,
  Boolean: 17,
  Array: 18,
  Object: 19,
  Key: 20,
  Null: 21,
  EnumMember: 22,
  Struct: 23,
  Event: 24,
  Operator: 25,
  TypeParameter: 26,
}
