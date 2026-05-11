const { describe, test, expect, beforeEach, afterEach, mock } = require("bun:test")

type LspProgressToastManagerClass = typeof import("./manager").LspProgressToastManager

describe("LspProgressToastManager", () => {
  let LspProgressToastManager: LspProgressToastManagerClass
  let manager: InstanceType<LspProgressToastManagerClass>
  let mockClient: {
    tui: {
      showToast: ReturnType<typeof mock>
    }
  }

  beforeEach(async () => {
    mockClient = {
      tui: {
        showToast: mock(() => Promise.resolve()),
      },
    }

    const mod = await import("./manager")
    LspProgressToastManager = mod.LspProgressToastManager
    manager = new LspProgressToastManager(mockClient as never)
  })

  afterEach(() => {
    mock.restore()
  })

  test("shows clangd begin progress toast", () => {
    manager.handleProgress({
      token: "1",
      kind: "begin",
      serverId: "clangd",
      root: "/repo",
      title: "Background indexing",
      message: "Scanning project",
      percentage: 10,
    })

    expect(mockClient.tui.showToast).toHaveBeenCalledTimes(1)
    const call = mockClient.tui.showToast.mock.calls[0][0]
    expect(call.body.title).toBe("LSP Index Started")
    expect(call.body.message).toContain("Background indexing")
    expect(call.body.message).toContain("10%")
  })

  test("ignores non-clangd progress", () => {
    manager.handleProgress({
      token: "1",
      kind: "begin",
      serverId: "rust-analyzer",
      root: "/repo",
      title: "Index",
    })

    expect(mockClient.tui.showToast).not.toHaveBeenCalled()
  })

  test("shows completion toast on end", () => {
    manager.handleProgress({
      token: "1",
      kind: "begin",
      serverId: "clangd",
      root: "/repo",
      title: "Background indexing",
      message: "Scanning project",
    })
    mockClient.tui.showToast.mockClear()

    manager.handleProgress({
      token: "1",
      kind: "end",
      serverId: "clangd",
      root: "/repo",
      message: "Done",
    })

    expect(mockClient.tui.showToast).toHaveBeenCalledTimes(1)
    const call = mockClient.tui.showToast.mock.calls[0][0]
    expect(call.body.title).toBe("LSP Index Ready")
    expect(call.body.message).toContain("Done")
  })

  test("clears active progress without showing a toast", () => {
    manager.handleProgress({
      token: "1",
      kind: "begin",
      serverId: "clangd",
      root: "/repo",
      title: "Background indexing",
      message: "Scanning project",
    })
    mockClient.tui.showToast.mockClear()

    manager.clearProgress({
      token: "1",
      serverId: "clangd",
      root: "/repo",
    })

    expect(mockClient.tui.showToast).not.toHaveBeenCalled()
  })
})
