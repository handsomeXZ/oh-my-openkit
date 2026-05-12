import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool"

import { lspFacade } from "./facade/lsp-facade"
import { formatApplyResult, formatPrepareRenameResult } from "./lsp-formatters"
import { applyRenameAndSync } from "./rename-apply-and-sync"
import type { PrepareRenameDefaultBehavior, PrepareRenameResult, RenameResult } from "./types"

export const lsp_prepare_rename: ToolDefinition = tool({
  description: "Check if rename is valid. Use BEFORE lsp_rename.",
  args: {
    filePath: tool.schema.string(),
    line: tool.schema.number().min(1).describe("1-based"),
    character: tool.schema.number().min(0).describe("0-based"),
  },
  execute: async (args, _context) => {
    try {
      const result = (await lspFacade.prepareRename(args)) as
        | PrepareRenameResult
        | PrepareRenameDefaultBehavior
        | null
      const output = formatPrepareRenameResult(result)
      return output
    } catch (e) {
      const output = `Error: ${e instanceof Error ? e.message : String(e)}`
      return output
    }
  },
})

export const lsp_rename: ToolDefinition = tool({
  description: "Rename symbol across entire workspace. APPLIES changes to all files.",
  args: {
    filePath: tool.schema.string(),
    line: tool.schema.number().min(1).describe("1-based"),
    character: tool.schema.number().min(0).describe("0-based"),
    newName: tool.schema.string().describe("New symbol name"),
  },
  execute: async (args, _context) => {
    try {
      const edit = (await lspFacade.rename(args)) as RenameResult
      const routeProvider = lspFacade.getRoutingForCapability("rename").provider
      const result = await applyRenameAndSync({ edit, entryFilePath: args.filePath, routeProvider })
      const output = formatApplyResult(result)
      return output
    } catch (e) {
      const output = `Error: ${e instanceof Error ? e.message : String(e)}`
      return output
    }
  },
})
