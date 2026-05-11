import type { PluginInput } from "@opencode-ai/plugin"

import type { SerenaManagerSnapshot } from "./manager-types"

type OpencodeClient = PluginInput["client"]

type ClientWithTui = {
  tui?: {
    showToast: (opts: { body: { title: string; message: string; variant: string; duration: number } }) => Promise<unknown>
  }
}

type SerenaLifecycleToastState = "starting" | "connected" | "reconnecting" | "degraded" | "error"

export function deriveSerenaLifecycleToastState(params: {
  snapshot: SerenaManagerSnapshot
  previousSnapshot: SerenaManagerSnapshot | null
}): SerenaLifecycleToastState | null {
  const { snapshot, previousSnapshot } = params

  if (snapshot.state === "starting") {
    if (previousSnapshot?.projectRoot === snapshot.projectRoot && previousSnapshot.state !== "idle") {
      return "reconnecting"
    }

    return "starting"
  }

  if (snapshot.state === "ready") {
    return "connected"
  }

  if (snapshot.state === "degraded") {
    return "degraded"
  }

  if (snapshot.state === "error") {
    return "error"
  }

  return null
}

function formatProjectRoot(projectRoot: string | null): string {
  return projectRoot ?? "(unknown project root)"
}

function formatFallbackState(snapshot: SerenaManagerSnapshot): string {
  return snapshot.state === "degraded" || snapshot.state === "error" || snapshot.state === "idle"
    ? "active"
    : "inactive"
}

function buildLifecycleDetailMessage(snapshot: SerenaManagerSnapshot): string {
  return [
    `Project root: ${formatProjectRoot(snapshot.projectRoot)}`,
    `State: ${snapshot.state}`,
  ].join("\n")
}

function buildFailureDetailMessage(snapshot: SerenaManagerSnapshot): string {
  const lines = [
    `Project root: ${formatProjectRoot(snapshot.projectRoot)}`,
    `State: ${snapshot.state}`,
    `Last error: ${snapshot.lastError ?? snapshot.serviceStatus?.lastError ?? "Unknown"}`,
    `Builtin fallback: ${formatFallbackState(snapshot)}`,
  ]

  if (snapshot.serviceStatus?.state) {
    lines.push(`Service state: ${snapshot.serviceStatus.state}`)
  }

  return lines.join("\n")
}

export function buildSerenaLifecycleToast(params: {
  snapshot: SerenaManagerSnapshot
  previousSnapshot: SerenaManagerSnapshot | null
}): { title: string; message: string; variant: string; duration: number } | null {
  const { snapshot, previousSnapshot } = params
  const toastState = deriveSerenaLifecycleToastState({ snapshot, previousSnapshot })

  if (!toastState) {
    return null
  }

  if (toastState === "starting") {
    return {
      title: "Serena starting",
      message: buildLifecycleDetailMessage(snapshot),
      variant: "info",
      duration: 3000,
    }
  }

  if (toastState === "connected") {
    return {
      title: "Serena connected",
      message: buildLifecycleDetailMessage(snapshot),
      variant: "success",
      duration: 3000,
    }
  }

  if (toastState === "reconnecting") {
    return {
      title: "Serena reconnecting",
      message: buildLifecycleDetailMessage(snapshot),
      variant: "warning",
      duration: 3500,
    }
  }

  if (toastState === "degraded") {
    return {
      title: "Serena degraded",
      message: buildFailureDetailMessage(snapshot),
      variant: "warning",
      duration: 5000,
    }
  }

  return {
    title: "Serena error",
    message: buildFailureDetailMessage(snapshot),
    variant: "error",
    duration: 5000,
  }
}

export function createSerenaLifecycleToastListener(client: OpencodeClient): (snapshot: SerenaManagerSnapshot, previousSnapshot: SerenaManagerSnapshot | null) => void {
  return (snapshot, previousSnapshot) => {
    const tuiClient = client as ClientWithTui
    if (!tuiClient.tui?.showToast) {
      return
    }

    const toast = buildSerenaLifecycleToast({ snapshot, previousSnapshot })
    if (!toast) {
      return
    }

    tuiClient.tui.showToast({ body: toast }).catch(() => {})
  }
}
