/**
 * Pipeline stage metadata — mirrors CampaignStage in
 * app/store/__init__.py and the Phase A stage machine.
 */

export interface StageMeta {
  key: string;
  label: string;
  description: string;
  phase: "A" | "B";
}

export const PHASE_A_STAGES: StageMeta[] = [
  { key: "created", label: "Created", description: "Campaign registered", phase: "A" },
  { key: "icp_extract", label: "Extracting ICP", description: "Parsing your brief into a structured ICP", phase: "A" },
  { key: "icp_persisted", label: "ICP saved", description: "Extracted features stored", phase: "A" },
  { key: "fetch_companies", label: "Searching companies", description: "Finding candidates", phase: "A" },
  { key: "rank_companies", label: "Scoring companies", description: "Firmographic fit scoring", phase: "A" },
  { key: "fetch_intent", label: "Intent signals", description: "Hiring & news signals", phase: "A" },
  { key: "rescore_intent", label: "Re-scoring", description: "Company ranking + intent", phase: "A" },
  { key: "ready_for_personas", label: "Company approval", description: "Approve which companies proceed to personas", phase: "A" },
  { key: "fetch_personas", label: "Searching personas", description: "Contacts at top companies", phase: "A" },
  { key: "rank_personas", label: "Scoring personas", description: "Role fit & reachability", phase: "A" },
  { key: "enrich_contacts", label: "Enriching contacts", description: "Emails & phones", phase: "A" },
  { key: "package_ready", label: "Lead package", description: "FinalLeadPackage assembled", phase: "A" },
];

export const PHASE_B_STAGES: StageMeta[] = [
  { key: "outreach_started", label: "Outreach started", description: "Sequence generation kicked off", phase: "B" },
  { key: "outreach_awaiting_approval", label: "Awaiting approval", description: "Sequence paused for your review", phase: "B" },
  { key: "outreach_approved", label: "Approved", description: "Sequence approved", phase: "B" },
  { key: "outreach_dispatched", label: "Dispatched", description: "Messages being generated & sent", phase: "B" },
  { key: "outreach_failed", label: "Outreach failed", description: "Something went wrong", phase: "B" },
];

export const STAGE_BY_KEY: Record<string, StageMeta> = Object.fromEntries(
  [...PHASE_A_STAGES, ...PHASE_B_STAGES].map((s) => [s.key, s]),
);

/** Index of a phase-A stage key within PHASE_A_STAGES (-1 if unknown). */
export function phaseAIndex(stage: string): number {
  return PHASE_A_STAGES.findIndex((s) => s.key === stage);
}

export function isPhaseAStage(stage: string): boolean {
  return phaseAIndex(stage) >= 0;
}

export const RUNNING_STAGES = new Set([
  "created",
  "icp_extract",
  "icp_persisted",
  "fetch_companies",
  "rank_companies",
  "fetch_intent",
  "rescore_intent",
  "fetch_personas",
  "rank_personas",
  "enrich_contacts",
]);

export const AWAITING_STAGES = new Set([
  "ready_for_personas",
  "outreach_awaiting_approval",
  "outreach_started",
]);

/** Human-friendly status chip label + tone. */
export function statusTone(status: string): {
  label: string;
  tone: "ok" | "warn" | "danger" | "neutral" | "accent";
} {
  switch (status) {
    case "draft":
      return { label: "draft", tone: "neutral" };
    case "completed":
    case "dispatched":
    case "sent":
    case "ready":
    case "approved":
      return { label: status, tone: "ok" };
    case "running":
    case "in_progress":
    case "pending":
    case "outreach_started":
    case "started":
      return { label: status, tone: "accent" };
    case "awaiting_approval":
    case "outreach_awaiting_approval":
    case "action_required":
      return { label: status, tone: "warn" };
    case "failed":
    case "outreach_failed":
    case "rejected":
    case "error":
      return { label: status, tone: "danger" };
    case "stopped":
    case "cancelled":
      return { label: status, tone: "neutral" };
    default:
      return { label: status, tone: "neutral" };
  }
}

export const STEP_STATUS_TONE: Record<string, "ok" | "warn" | "danger" | "neutral" | "accent"> = {
  sent: "ok",
  ready: "ok",
  approved: "ok",
  completed: "ok",
  pending: "neutral",
  in_progress: "accent",
  awaiting_approval: "warn",
  action_required: "warn",
  below_threshold: "danger",
  failed: "danger",
  skipped: "neutral",
};
