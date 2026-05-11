import { describe, expect, test } from "bun:test"
import { buildSerenaArgs } from "./serena-launch-args"

describe("buildSerenaArgs", () => {
	test("#given shared Serena HTTP service #when launch args are built #then dashboard stays observable without auto-opening", () => {
		const args = buildSerenaArgs("D:/repo", 9121, ["uvx", "--from", "git+https://github.com/oraios/serena", "serena"])

		expect(args).toContain("--enable-web-dashboard")
		expect(args[args.indexOf("--enable-web-dashboard") + 1]).toBe("True")
		expect(args).toContain("--open-web-dashboard")
		expect(args[args.indexOf("--open-web-dashboard") + 1]).toBe("False")
		expect(args).toContain("--enable-gui-log-window")
		expect(args[args.indexOf("--enable-gui-log-window") + 1]).toBe("False")
	})
})
