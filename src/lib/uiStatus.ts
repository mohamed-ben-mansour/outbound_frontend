/**
 * Human-readable campaign status labels.
 *
 * The backend derives `ui_status` from (status, stage) so the Campaigns page
 * shows the TRUE state — a campaign waiting on sequence approval must read
 * "Awaiting sequence approval", not "running".
 */

export interface UiStatusInfo {
  /** Raw status value the tone map understands (running/awaiting_approval/...). */
  status: string;
  /** Human label shown in the badge. */
  label: string;
}

const UI_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  running: "Running",
  sending: "Sending",
  outreach_started: "Outreach started",
  waiting_company_approval: "Awaiting company approval",
  waiting_sequence_approval: "Awaiting sequence approval",
  waiting_approval: "Awaiting approval",
  completed: "Completed",
  stopped: "Stopped",
  cancelled: "Cancelled",
  failed: "Failed",
};

export function uiStatusLabel(uiStatus: string, stage?: string): UiStatusInfo {
  // Fallback for old backend responses without ui_status: derive from stage.
  if (!uiStatus || !(uiStatus in UI_STATUS_LABELS)) {
    if (stage === "ready_for_personas") {
      return { status: "awaiting_approval", label: "Awaiting company approval" };
    }
    if (stage === "outreach_awaiting_approval") {
      return { status: "awaiting_approval", label: "Awaiting sequence approval" };
    }
    if (stage === "outreach_dispatched" || stage === "outreach_approved") {
      return { status: "running", label: "Sending" };
    }
  }
  const raw = uiStatus in UI_STATUS_LABELS ? uiStatus : uiStatus;
  // Tone-map: "sending" and "outreach_started" render with the running accent.
  const toneStatus =
    raw === "sending" || raw === "outreach_started" ? "running" : raw;
  return {
    status: toneStatus,
    label: UI_STATUS_LABELS[uiStatus] ?? uiStatus,
  };
}
