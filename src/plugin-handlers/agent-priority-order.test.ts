/// <reference types="bun-types" />

import { describe, expect, test } from "bun:test"

import {
  reorderAgentsByPriority,
  CANONICAL_CORE_AGENT_ORDER,
} from "./agent-priority-order"
import { getAgentDisplayName, getAgentListDisplayName } from "../shared/agent-display-names"

describe("agent-priority-order", () => {
  describe("CANONICAL_CORE_AGENT_ORDER", () => {
    // given: The canonical order constant must exist and be correct

    test("exports canonical order as readonly array", () => {
      // then
      expect(CANONICAL_CORE_AGENT_ORDER).toBeDefined()
      expect(Array.isArray(CANONICAL_CORE_AGENT_ORDER)).toBe(true)
    })

    test("canonical order is exactly [build, sisyphus, hephaestus, prometheus, atlas, plan]", () => {
      // then
      expect(CANONICAL_CORE_AGENT_ORDER).toEqual([
        "build",
        "sisyphus",
        "hephaestus",
        "prometheus",
        "atlas",
        "plan",
      ])
    })

    test("canonical order length is exactly 6", () => {
      // then
      expect(CANONICAL_CORE_AGENT_ORDER).toHaveLength(6)
    })
  })

  describe("reorderAgentsByPriority", () => {
    // given: display names for all core agents
    const build = getAgentListDisplayName("build")
    const plan = getAgentListDisplayName("plan")
    const sisyphus = getAgentListDisplayName("sisyphus")
    const hephaestus = getAgentListDisplayName("hephaestus")
    const prometheus = getAgentListDisplayName("prometheus")
    const atlas = getAgentListDisplayName("atlas")
    const oracle = getAgentDisplayName("oracle")
    const librarian = getAgentDisplayName("librarian")
    const explore = getAgentDisplayName("explore")

    describe("#given agents in random order", () => {
      test("#when all core agents present #then orders as build→sisyphus→hephaestus→prometheus→atlas→plan", () => {
        // given: agents in reverse order
        const agents: Record<string, unknown> = {
          [plan]: { name: "plan" },
          [atlas]: { name: "atlas" },
          [prometheus]: { name: "prometheus" },
          [hephaestus]: { name: "hephaestus" },
          [sisyphus]: { name: "sisyphus" },
          [build]: { name: "build" },
        }

        // when
        const result = reorderAgentsByPriority(agents)

        // then
        const keys = Object.keys(result)
        expect(keys[0]).toBe(build)
        expect(keys[1]).toBe(sisyphus)
        expect(keys[2]).toBe(hephaestus)
        expect(keys[3]).toBe(prometheus)
        expect(keys[4]).toBe(atlas)
        expect(keys[5]).toBe(plan)
      })

      test("#when custom agent order is provided #then build stays first and plan stays last", () => {
        // given
        const agents: Record<string, unknown> = {
          [plan]: { name: "plan" },
          [atlas]: { name: "atlas" },
          [prometheus]: { name: "prometheus" },
          [hephaestus]: { name: "hephaestus" },
          [sisyphus]: { name: "sisyphus" },
          [build]: { name: "build" },
        }

        // when
        const result = reorderAgentsByPriority(agents, [
          "build",
          "hephaestus",
          "sisyphus",
          "prometheus",
          "atlas",
          "plan",
        ])

        // then
        expect(Object.keys(result)).toEqual([build, hephaestus, sisyphus, prometheus, atlas, plan])
      })

      test("#when custom agent order contains invalid entries #then ignores them and keeps valid/default ordering", () => {
        // given
        const agents: Record<string, unknown> = {
          [atlas]: { name: "atlas" },
          [prometheus]: { name: "prometheus" },
          [hephaestus]: { name: "hephaestus" },
          [sisyphus]: { name: "sisyphus" },
        }

        // when
        const result = reorderAgentsByPriority(agents, [
          "not-real",
          "build",
          "atlas",
          "hephaestus",
          "atlas",
          "plan",
        ])

        // then
        expect(Object.keys(result)).toEqual([atlas, hephaestus, sisyphus, prometheus])
      })

      test("#when core agents mixed with non-core #then core agents come first in canonical order", () => {
        // given: mixed order with non-core agents interleaved
        const agents: Record<string, unknown> = {
          [oracle]: { name: "oracle" },
          [build]: { name: "build" },
          [atlas]: { name: "atlas" },
          [librarian]: { name: "librarian" },
          [prometheus]: { name: "prometheus" },
          [explore]: { name: "explore" },
          [hephaestus]: { name: "hephaestus" },
          custom: { name: "custom" },
          [sisyphus]: { name: "sisyphus" },
          [plan]: { name: "plan" },
        }

        // when
        const result = reorderAgentsByPriority(agents)

        // then
        const keys = Object.keys(result)
        expect(keys.slice(0, 6)).toEqual([build, sisyphus, hephaestus, prometheus, atlas, plan])
      })
    })

    describe("#given 100 random permutations", () => {
      test("#when reordered #then result is ALWAYS identical", () => {
        // given: base agent config
        const baseAgents = {
          [build]: { name: "build" },
          [sisyphus]: { name: "sisyphus" },
          [hephaestus]: { name: "hephaestus" },
          [prometheus]: { name: "prometheus" },
          [atlas]: { name: "atlas" },
          [plan]: { name: "plan" },
          [oracle]: { name: "oracle" },
          [librarian]: { name: "librarian" },
          custom1: { name: "custom1" },
          custom2: { name: "custom2" },
        }

        // given: shuffle function
        const shuffle = <T>(array: T[]): T[] => {
          const result = [...array]
          for (let i = result.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1))
            ;[result[i], result[j]] = [result[j], result[i]]
          }
          return result
        }

        // when: run 100 times with different key orders
        const results: string[][] = []
        for (let i = 0; i < 100; i++) {
          const shuffledKeys = shuffle(Object.keys(baseAgents))
          const shuffledAgents: Record<string, unknown> = {}
          for (const key of shuffledKeys) {
            shuffledAgents[key] = baseAgents[key]
          }
          const result = reorderAgentsByPriority(shuffledAgents)
          results.push(Object.keys(result))
        }

        // then: all results should have identical key order
        const firstResult = results[0]
        for (let i = 1; i < results.length; i++) {
          expect(results[i]).toEqual(firstResult)
        }

        // then: ranked agents are always first in canonical order
        expect(firstResult.slice(0, 6)).toEqual([
          build,
          sisyphus,
          hephaestus,
          prometheus,
          atlas,
          plan,
        ])
      })
    })

    describe("#given partial core agents", () => {
      test("#when build, sisyphus, atlas, and plan are present #then build stays first and plan stays last", () => {
        // given
        const agents: Record<string, unknown> = {
          [plan]: { name: "plan" },
          [atlas]: { name: "atlas" },
          custom: { name: "custom" },
          [sisyphus]: { name: "sisyphus" },
          [build]: { name: "build" },
        }

        // when
        const result = reorderAgentsByPriority(agents)

        // then
        const keys = Object.keys(result)
        expect(keys[0]).toBe(build)
        const sisyphusIdx = keys.indexOf(sisyphus)
        const atlasIdx = keys.indexOf(atlas)
        const planIdx = keys.indexOf(plan)
        expect(sisyphusIdx).toBeLessThan(atlasIdx)
        expect(sisyphusIdx).toBe(1)
        expect(planIdx).toBe(3)
      })

      test("#when build, hephaestus, prometheus, and plan are present #then build stays first and plan stays last", () => {
        // given
        const agents: Record<string, unknown> = {
          [plan]: { name: "plan" },
          [prometheus]: { name: "prometheus" },
          custom: { name: "custom" },
          [hephaestus]: { name: "hephaestus" },
          [build]: { name: "build" },
        }

        // when
        const result = reorderAgentsByPriority(agents)

        // then
        const keys = Object.keys(result)
        expect(keys[0]).toBe(build)
        const hephaestusIdx = keys.indexOf(hephaestus)
        const prometheusIdx = keys.indexOf(prometheus)
        const planIdx = keys.indexOf(plan)
        expect(hephaestusIdx).toBeLessThan(prometheusIdx)
        expect(hephaestusIdx).toBe(1)
        expect(planIdx).toBe(3)
      })
    })

    describe("#given order field injection", () => {
      test("#when core agent is object #then injects order field", () => {
        // given
        const agents: Record<string, unknown> = {
          [build]: { name: "build", mode: "primary" },
          [sisyphus]: { name: "sisyphus", mode: "primary" },
          [hephaestus]: { name: "hephaestus", mode: "primary" },
          [prometheus]: { name: "prometheus", mode: "primary" },
          [atlas]: { name: "atlas", mode: "primary" },
          [plan]: { name: "plan", mode: "primary" },
        }

        // when
        const result = reorderAgentsByPriority(agents)

        // then
        expect(result[build]).toEqual({ name: "build", mode: "primary", order: 1 })
        expect(result[sisyphus]).toEqual({ name: "sisyphus", mode: "primary", order: 2 })
        expect(result[hephaestus]).toEqual({ name: "hephaestus", mode: "primary", order: 3 })
        expect(result[prometheus]).toEqual({ name: "prometheus", mode: "primary", order: 4 })
        expect(result[atlas]).toEqual({ name: "atlas", mode: "primary", order: 5 })
        expect(result[plan]).toEqual({ name: "plan", mode: "primary", order: 6 })
      })

      test("#when custom agent order is provided #then build stays first and plan stays last in order fields", () => {
        // given
        const agents: Record<string, unknown> = {
          [build]: { name: "build", mode: "primary" },
          [sisyphus]: { name: "sisyphus", mode: "primary" },
          [hephaestus]: { name: "hephaestus", mode: "primary" },
          [plan]: { name: "plan", mode: "primary" },
        }

        // when
        const result = reorderAgentsByPriority(agents, ["build", "hephaestus", "sisyphus", "plan"])

        // then
        expect(result[build]).toEqual({ name: "build", mode: "primary", order: 1 })
        expect(result[hephaestus]).toEqual({ name: "hephaestus", mode: "primary", order: 2 })
        expect(result[sisyphus]).toEqual({ name: "sisyphus", mode: "primary", order: 3 })
        expect(result[plan]).toEqual({ name: "plan", mode: "primary", order: 4 })
      })

      test("#when core agent is non-object #then leaves value unchanged", () => {
        // given
        const agents: Record<string, unknown> = {
          [sisyphus]: "string-config",
          [atlas]: null,
        }

        // when
        const result = reorderAgentsByPriority(agents)

        // then
        expect(result[sisyphus]).toBe("string-config")
        expect(result[atlas]).toBe(null)
      })

      test("#when non-core agent #then does NOT inject order field", () => {
        // given
        const agents: Record<string, unknown> = {
          [oracle]: { name: "oracle", mode: "subagent" },
          custom: { name: "custom" },
        }

        // when
        const result = reorderAgentsByPriority(agents)

        // then
        expect(result[oracle]).toEqual({ name: "oracle", mode: "subagent" })
        expect(result.custom).toEqual({ name: "custom" })
      })
    })

    describe("#given non-core agent ordering", () => {
      test("#when multiple non-core agents #then sorted alphabetically after core agents", () => {
        // given: non-core agents in random order
        const agents: Record<string, unknown> = {
          zebra: { name: "zebra" },
          [sisyphus]: { name: "sisyphus" },
          apple: { name: "apple" },
          mango: { name: "mango" },
          [atlas]: { name: "atlas" },
        }

        // when
        const result = reorderAgentsByPriority(agents)

        // then: core agents first, then alphabetical
        const keys = Object.keys(result)
        expect(keys.slice(0, 2)).toEqual([sisyphus, atlas])
        expect(keys.slice(2)).toEqual(["apple", "mango", "zebra"])
      })
    })
  })
})
