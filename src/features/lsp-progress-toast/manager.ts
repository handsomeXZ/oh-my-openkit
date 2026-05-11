import type { PluginInput } from "@opencode-ai/plugin"

type OpencodeClient = PluginInput["client"]

type ClientWithTui = {
  tui?: {
    showToast: (opts: { body: { title: string; message: string; variant: string; duration: number } }) => Promise<unknown>
  }
}

type ProgressKind = "begin" | "report" | "end"

export type LspProgressUpdate = {
  token: string | number
  kind: ProgressKind
  serverId: string
  root: string
  title?: string
  message?: string
  percentage?: number
}

type ActiveProgress = {
  lastShownAt: number
  title: string
  message: string
  percentage?: number
}

const TOAST_THROTTLE_MS = 2000

export class LspProgressToastManager {
  private readonly client: OpencodeClient
  private readonly active = new Map<string, ActiveProgress>()

  constructor(client: OpencodeClient) {
    this.client = client
  }

  handleProgress(update: LspProgressUpdate): void {
    if (update.serverId !== "clangd") return

    const progressKey = this.getProgressKey(update)

    if (update.kind === "end") {
      const existing = this.active.get(progressKey)
      this.active.delete(progressKey)
      this.showToast({
        title: "LSP Index Ready",
        message: this.buildCompletionMessage(existing, update),
        variant: "success",
        duration: 3000,
      })
      return
    }

    const now = Date.now()
    const title = update.title?.trim() || "clangd indexing"
    const message = this.buildProgressMessage(update)
    const existing = this.active.get(progressKey)
    const hasMeaningfulChange =
      !existing ||
      existing.message !== message ||
      existing.title !== title ||
      existing.percentage !== update.percentage

    if (!hasMeaningfulChange) return
    if (existing && now - existing.lastShownAt < TOAST_THROTTLE_MS) {
      this.active.set(progressKey, {
        lastShownAt: existing.lastShownAt,
        title,
        message,
        percentage: update.percentage,
      })
      return
    }

    this.active.set(progressKey, {
      lastShownAt: now,
      title,
      message,
      percentage: update.percentage,
    })

    this.showToast({
      title: update.kind === "begin" ? "LSP Index Started" : "LSP Index Progress",
      message: `${title}: ${message}`,
      variant: "info",
      duration: 2500,
    })
  }

  reset(): void {
    this.active.clear()
  }

  clearProgress(input: { root: string; serverId: string; token: string | number }): void {
    this.active.delete(this.getProgressKey(input))
  }

  private getProgressKey(update: Pick<LspProgressUpdate, "root" | "serverId" | "token">): string {
    return `${update.serverId}:${update.root}:${String(update.token)}`
  }

  private buildProgressMessage(update: Pick<LspProgressUpdate, "message" | "percentage">): string {
    const parts = [update.message?.trim()].filter(Boolean)
    if (typeof update.percentage === "number") {
      parts.push(`${Math.max(0, Math.min(100, Math.round(update.percentage)))}%`)
    }
    return parts.join(" • ") || "working"
  }

  private buildCompletionMessage(existing: ActiveProgress | undefined, update: Pick<LspProgressUpdate, "message" | "percentage">): string {
    const completion = this.buildProgressMessage(update)
    if (completion !== "working") return completion
    return existing?.message || existing?.title || "Index ready"
  }

  private showToast(input: {
    title: string
    message: string
    variant: "info" | "success"
    duration: number
  }): void {
    const tuiClient = this.client as ClientWithTui
    if (!tuiClient.tui?.showToast) return

    tuiClient.tui.showToast({
      body: {
        title: input.title,
        message: input.message,
        variant: input.variant,
        duration: input.duration,
      },
    }).catch(() => {})
  }
}

let instance: LspProgressToastManager | null = null

export function initLspProgressToastManager(client: OpencodeClient): LspProgressToastManager {
  instance = new LspProgressToastManager(client)
  return instance
}

export function getLspProgressToastManager(): LspProgressToastManager | null {
  return instance
}

export function _resetLspProgressToastManagerForTesting(): void {
  instance = null
}
