/// <reference types="bun-types" />

import { describe, expect, test } from "bun:test"
import { LspConfigSchema, normalizeLspConfig } from "./lsp"

describe("LspConfigSchema - serena", () => {
  test("accepts managed-http serena config shape", () => {
    const result = LspConfigSchema.safeParse({
      provider: "serena",
      serena: {
        wrapperCommand: ["bun", "run", "serena-wrapper"],
        serenaCommand: ["uvx", "serena", "start-mcp-server"],
        env: {
          SERENA_LOG_LEVEL: "debug",
        },
        requiredTools: ["find_symbol", "find_referencing_symbols"],
        projectRoot: "C:/workspace/project",
      },
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.serena).toEqual({
        wrapperCommand: ["bun", "run", "serena-wrapper"],
        serenaCommand: ["uvx", "serena", "start-mcp-server"],
        env: {
          SERENA_LOG_LEVEL: "debug",
        },
        requiredTools: ["find_symbol", "find_referencing_symbols"],
        projectRoot: "C:/workspace/project",
      })
      expect(normalizeLspConfig(result.data).serena).toEqual({
        transport: "managed-http",
        wrapperCommand: ["bun", "run", "serena-wrapper"],
        serenaCommand: ["uvx", "serena", "start-mcp-server"],
        command: undefined,
        env: {
          SERENA_LOG_LEVEL: "debug",
        },
        requiredTools: ["find_symbol", "find_referencing_symbols"],
        projectRoot: "C:/workspace/project",
      })
    }
  })

  test("accepts legacy stdio command config and normalizes it", () => {
    const result = LspConfigSchema.safeParse({
      provider: "serena",
      serena: {
        command: ["uvx", "serena", "start-mcp-server"],
        env: {
          SERENA_LOG_LEVEL: "info",
        },
        projectRoot: "C:/workspace/project",
      },
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.serena).toEqual({
        command: ["uvx", "serena", "start-mcp-server"],
        env: {
          SERENA_LOG_LEVEL: "info",
        },
        projectRoot: "C:/workspace/project",
      })
      expect(normalizeLspConfig(result.data).serena).toEqual({
        transport: "stdio",
        wrapperCommand: undefined,
        serenaCommand: ["uvx", "serena", "start-mcp-server"],
        command: ["uvx", "serena", "start-mcp-server"],
        env: {
          SERENA_LOG_LEVEL: "info",
        },
        requiredTools: undefined,
        projectRoot: "C:/workspace/project",
      })
    }
  })

  test("requires an explicit projectRoot for serena provider config", () => {
    const result = LspConfigSchema.safeParse({
      provider: "serena",
      serena: {
        wrapperCommand: ["bun", "run", "serena-wrapper"],
      },
    })

    expect(result.success).toBe(false)
  })

  test("accepts explicit stdio serenaCommand config without a legacy command", () => {
    const result = LspConfigSchema.safeParse({
      provider: "serena",
      serena: {
        transport: "stdio",
        serenaCommand: ["uvx", "serena", "start-mcp-server"],
        requiredTools: ["find_symbol"],
        projectRoot: "C:/workspace/project",
      },
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(normalizeLspConfig(result.data).serena).toEqual({
        transport: "stdio",
        wrapperCommand: undefined,
        serenaCommand: ["uvx", "serena", "start-mcp-server"],
        command: undefined,
        env: undefined,
        requiredTools: ["find_symbol"],
        projectRoot: "C:/workspace/project",
      })
    }
  })

  test("normalization prefers explicit serenaCommand over a legacy command when both are provided", () => {
    const result = LspConfigSchema.safeParse({
      provider: "serena",
      serena: {
        transport: "managed-http",
        wrapperCommand: ["bun", "run", "serena-wrapper"],
        serenaCommand: ["uvx", "serena", "start-mcp-server", "--modern"],
        command: ["uvx", "serena", "start-mcp-server", "--legacy"],
        projectRoot: "C:/workspace/project",
      },
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(normalizeLspConfig(result.data).serena).toEqual({
        transport: "managed-http",
        wrapperCommand: ["bun", "run", "serena-wrapper"],
        serenaCommand: ["uvx", "serena", "start-mcp-server", "--modern"],
        command: ["uvx", "serena", "start-mcp-server", "--legacy"],
        env: undefined,
        requiredTools: undefined,
        projectRoot: "C:/workspace/project",
      })
    }
  })

  test("normalization treats wrapperCommand as a deprecated serenaCommand alias", () => {
    const result = LspConfigSchema.safeParse({
      provider: "serena",
      serena: {
        wrapperCommand: ["uv", "run", "serena"],
        projectRoot: "C:/workspace/project",
      },
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(normalizeLspConfig(result.data).serena).toEqual({
        transport: "managed-http",
        wrapperCommand: ["uv", "run", "serena"],
        serenaCommand: ["uv", "run", "serena"],
        command: undefined,
        env: undefined,
        requiredTools: undefined,
        projectRoot: "C:/workspace/project",
      })
    }
  })

  test("rejects invalid transport values and empty command arrays", () => {
    const invalidTransport = LspConfigSchema.safeParse({
      provider: "serena",
      serena: {
        transport: "http",
        projectRoot: "C:/workspace/project",
      },
    })
    const emptyWrapperCommand = LspConfigSchema.safeParse({
      provider: "serena",
      serena: {
        wrapperCommand: [],
        projectRoot: "C:/workspace/project",
      },
    })

    expect(invalidTransport.success).toBe(false)
    expect(emptyWrapperCommand.success).toBe(false)
  })
})
