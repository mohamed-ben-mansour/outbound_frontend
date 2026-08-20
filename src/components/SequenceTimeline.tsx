import { useState } from "react";
import {
  Mail,
  MessageCircle,
  UserPlus,
  BadgeCheck,
  Clock3,
  CalendarDays,
  RefreshCw,
  SkipForward,
  Check,
  AlertTriangle,
  FileText,
  Pencil,
  BookOpen,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  ArrowRight,
  Info,
} from "lucide-react";
import { Badge, Button, Modal } from "@/components/ui";
import { cn, timeAgo } from "@/lib/utils";
import { STEP_STATUS_TONE } from "@/lib/stages";
import type { MergedStep } from "@/lib/enrich";
import { toast } from "sonner";

type SequenceDraft = {
  step_num: number;
  action_type: string;
  channel: string;
  // Prospect-local schedule (source of truth for timing edits).
  scheduled_date: string;
  scheduled_time: string;
  strategy_notes: string;
};

function ChannelIcon({ channel }: { channel: string }) {
  const c = channel.toLowerCase();
  if (c.includes("inmail")) return <UserPlus className="h-4 w-4" />;
  if (c.includes("linkedin")) return <MessageCircle className="h-4 w-4" />;
  return <Mail className="h-4 w-4" />;
}

function channelLabel(channel: string, action: string): string {
  const c = channel.toLowerCase();
  if (c.includes("inmail")) return "LinkedIn InMail";
  if (c.includes("linkedin")) return "LinkedIn message";
  if (action === "LINKEDIN_CONNECT") return "LinkedIn connect";
  return "Email";
}

const ACTION_HINT: Record<string, string> = {
  EMAIL_1: "Email",
  EMAIL_2: "Email (2nd)",
  LINKEDIN_MESSAGE: "LinkedIn DM",
  LINKEDIN_DM: "LinkedIn DM",
  LINKEDIN_INMAIL: "LinkedIn InMail",
  LINKEDIN_CONNECT: "LinkedIn connect",
};

// Friendly delivery methods shown in the sequence editor. Each maps to the
// backend's (action_type, channel) pair so users never see EMAIL_1 /
// LINKEDIN_CONNECT / linkedin_dm.
const CHANNEL_OPTIONS: Array<{
  key: string;
  label: string;
  action_type: string;
  channel: string;
}> = [
  { key: "email", label: "Email", action_type: "EMAIL_1", channel: "email" },
  { key: "linkedin_inmail", label: "LinkedIn InMail", action_type: "LINKEDIN_INMAIL", channel: "linkedin_inmail" },
  { key: "linkedin_dm", label: "LinkedIn DM", action_type: "LINKEDIN_MESSAGE", channel: "linkedin_dm" },
  { key: "linkedin_connect", label: "LinkedIn Connect", action_type: "LINKEDIN_CONNECT", channel: "linkedin_dm" },
];

function methodKeyFromStep(action_type: string): string {
  const a = (action_type || "").toUpperCase();
  if (a === "LINKEDIN_CONNECT") return "linkedin_connect";
  if (a === "LINKEDIN_INMAIL") return "linkedin_inmail";
  if (a === "LINKEDIN_MESSAGE" || a === "LINKEDIN_DM") return "linkedin_dm";
  return "email";
}

function validateMethod(
  key: string,
  ctx: {
    isConnected: boolean;
    hasInmailCredits: boolean;
    connectSent: boolean;
    hasEmail: boolean;
    emailUsable: boolean;
    hasLinkedin: boolean;
  },
): string | null {
  if (key === "email" && !ctx.emailUsable) {
    return ctx.hasEmail
      ? "This prospect's email is unusable (catchall or risky) — an email step can't be sent."
      : "This prospect has no email address — an email step can't be sent.";
  }
  if ((key === "linkedin_inmail" || key === "linkedin_dm" || key === "linkedin_connect") && !ctx.hasLinkedin) {
    return "This prospect has no LinkedIn profile URL — a LinkedIn step can't be sent.";
  }
  if (key === "linkedin_inmail" && !ctx.hasInmailCredits) {
    return "InMail isn't available — this account has no LinkedIn InMail credits.";
  }
  if (key === "linkedin_dm" && !ctx.isConnected) {
    return "You're not connected to this prospect, so LinkedIn DM isn't available.";
  }
  if (key === "linkedin_connect") {
    if (ctx.isConnected) return "You're already connected — a connection request isn't needed.";
    if (ctx.connectSent) return "A connection request was already sent to this prospect.";
  }
  return null;
}

// Fallback actions the Temporal workflow can apply when a send fails with a
// recoverable error (rate limit, exhausted credits, connection not accepted).
const RESOLVE_ACTION_LABELS: Record<string, string> = {
  retry_connect_only: "Retry as connect-only (no message)",
  switch_to_email: "Switch this step to email",
  switch_to_dm: "Switch this step to LinkedIn DM",
  switch_to_inmail: "Switch this step to LinkedIn InMail",
  switch_to_connect: "Switch this step to LinkedIn connect",
  skip_step: "Skip this step",
};

function normalizeResolveActions(
  raw: unknown,
): Array<{ action: string; label: string }> {
  if (!Array.isArray(raw)) return [];
  const out: Array<{ action: string; label: string }> = [];
  for (const item of raw) {
    if (typeof item === "string") {
      out.push({
        action: item,
        label: RESOLVE_ACTION_LABELS[item] ?? item.replace(/_/g, " "),
      });
    } else if (typeof item === "object" && item !== null) {
      const obj = item as Record<string, unknown>;
      const action = String(obj.action ?? obj.id ?? "").trim();
      if (!action) continue;
      const label = String(obj.label ?? "").trim();
      out.push({
        action,
        label: label || RESOLVE_ACTION_LABELS[action] || action.replace(/_/g, " "),
      });
    }
  }
  return out;
}

function formatScheduledTimestamp(raw?: string): string | null {
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(parsed);
}

/** Prospect-local time, computed deterministically from the UTC timestamp + the
 * prospect's IANA zone (DST-correct, preferred) or timezone offset fallback
 * (e.g. -7 → "Thu, Aug 14, 11:00 AM (UTC-7)"). */
function formatProspectTime(
  raw?: string,
  tzOffset?: number | null,
  tzIana?: string | null,
): string | null {
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  if (tzIana) {
    try {
      return (
        new Intl.DateTimeFormat(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          timeZone: tzIana,
        }).format(parsed) + ` (${tzIana})`
      );
    } catch {
      // Invalid IANA name — fall through to offset math.
    }
  }
  if (typeof tzOffset !== "number" || Number.isNaN(tzOffset)) return null;
  const local = new Date(parsed.getTime() + tzOffset * 60 * 60 * 1000);
  const label = `UTC${tzOffset >= 0 ? "+" : "−"}${Math.abs(tzOffset)}`;
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(local) + ` (${label})`;
}

/** Prospect-local date (YYYY-MM-DD) + time (HH:MM) derived from the UTC
 * timestamp + the prospect's timezone offset. Prefills the calendar + time
 * pickers in the sequence editor. */
function toLocalDateTime(
  raw?: string | null,
  tzOffset?: number | null,
  tzIana?: string | null,
): { date: string; time: string } {
  if (!raw) return { date: "", time: "" };
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return { date: "", time: "" };
  const pad = (n: number) => String(n).padStart(2, "0");
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: tzIana ?? "UTC",
  }).formatToParts(parsed);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  // Fallback: IANA invalid → offset math.
  if (!get("year")) {
    const offset = typeof tzOffset === "number" && !Number.isNaN(tzOffset) ? tzOffset : 0;
    const local = new Date(parsed.getTime() + offset * 60 * 60 * 1000);
    return {
      date: `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}`,
      time: `${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`,
    };
  }
  let hour = get("hour");
  if (hour === "24") hour = "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${hour}:${get("minute")}` };
}

function toSequenceDraft(step: MergedStep): SequenceDraft {
  const { date, time } = toLocalDateTime(
    step.scheduled_timestamp_utc,
    step.timezone_offset,
    step.timezone_iana,
  );
  return {
    step_num: step.step_num,
    action_type: step.action_type || "EMAIL_1",
    channel: step.channel || "email",
    scheduled_date: date,
    scheduled_time: time,
    strategy_notes: step.strategy_notes || step.sequence_architecture_rationale || "",
  };
}

/** Enforce a non-decreasing prospect-local schedule: each step's date+time must
 * be >= the previous step's. Clamps manual edits so a step can never be
 * scheduled earlier than the one before it (and cascades forward on change). */
function enforceMonotonicOrder(drafts: SequenceDraft[]): SequenceDraft[] {
  let prevDate = "";
  let prevTime = "";
  return drafts.map((d) => {
    if (!prevDate) {
      prevDate = d.scheduled_date;
      prevTime = d.scheduled_time;
      return d;
    }
    if (
      d.scheduled_date < prevDate ||
      (d.scheduled_date === prevDate && d.scheduled_time < prevTime)
    ) {
      return { ...d, scheduled_date: prevDate, scheduled_time: prevTime };
    }
    prevDate = d.scheduled_date;
    prevTime = d.scheduled_time;
    return d;
  });
}

export default function SequenceTimeline({
  steps,
  threadStatus,
  approvalMode,
  onSignal,
  onEditStep,
  onEditSequence,
  onResolveAction,
  busySignal,
  isConnected,
  hasInmailCredits,
  hasEmail,
  emailUsable,
  hasLinkedin,
}: {
  steps: MergedStep[];
  threadStatus: string;
  approvalMode: string;
  isConnected: boolean;
  hasInmailCredits: boolean;
  hasEmail: boolean;
  emailUsable: boolean;
  hasLinkedin: boolean;
  onSignal:
    (
      signal: "approve-step" | "skip-step" | "regenerate-step",
      stepNum: number,
      feedback?: string,
    ) => void;
  onEditStep: (stepNum: number, messageText: string, subjectText?: string | null) => void;
  onEditSequence: (steps: SequenceDraft[]) => void;
  onResolveAction: (stepNum: number, action: string) => void;
  busySignal: string | null;
}) {
  const [regenerateFor, setRegenerateFor] = useState<number | null>(null);
  const [resolveFor, setResolveFor] = useState<number | null>(null);
  const [editFor, setEditFor] = useState<number | null>(null);
  const [editBody, setEditBody] = useState("");
  const [editSubject, setEditSubject] = useState("");
  const [contextFor, setContextFor] = useState<number | null>(null);
  const [feedback, setFeedback] = useState("");
  const [editingSequence, setEditingSequence] = useState(false);
  const [sequenceDraft, setSequenceDraft] = useState<SequenceDraft[]>([]);
  const hasImmutableSteps = steps.some((step) => ["sent", "failed"].includes(step.status));
  // Per-step lock: only a step that actually sent/failed is frozen. Pending steps
  // stay editable even after earlier steps have gone out. Looked up by step_num
  // (stable identity) so reordering doesn't shift which step is locked.
  const isLocked = (stepNum: number | undefined) =>
    ["sent", "failed"].includes(
      steps.find((s) => s.step_num === stepNum)?.status ?? "",
    );
  // A connection request was already dispatched for this prospect.
  const connectSent = steps.some(
    (s) => s.action_type === "LINKEDIN_CONNECT" && s.status === "sent",
  );
  // Availability of a step's channel for THIS prospect — used to flag
  // legacy/imported steps that predate the backend enforcement.
  const channelUnavailableFor = (step: MergedStep): string | null => {
    const key = methodKeyFromStep(step.action_type);
    return validateMethod(key, {
      isConnected,
      hasInmailCredits,
      connectSent,
      hasEmail,
      emailUsable,
      hasLinkedin,
    });
  };
  const channelErrorFor = (draft: SequenceDraft) =>
    validateMethod(methodKeyFromStep(draft.action_type), {
      isConnected,
      hasInmailCredits,
      connectSent,
      hasEmail,
      emailUsable,
      hasLinkedin,
    });
  const strategyErrorFor = (draft: SequenceDraft) =>
    (draft.strategy_notes || "").trim() ? null : "Strategy note is required — no step may be left without one.";
  // After reordering, a step's day/time can end up earlier than the one before
  // it. Flag it (don't auto-clamp) so the user fixes it — the pickers then
  // enforce the min constraint.
  const orderErrorFor = (index: number) => {
    if (index <= 0) return null;
    const prev = sequenceDraft[index - 1];
    const cur = sequenceDraft[index];
    if (!prev?.scheduled_date || !cur?.scheduled_date) return null;
    if (
      cur.scheduled_date < prev.scheduled_date ||
      (cur.scheduled_date === prev.scheduled_date && cur.scheduled_time < prev.scheduled_time)
    ) {
      return "This time is before the previous step — pick a day/time at or after it.";
    }
    return null;
  };
  // "LinkedIn Connect" is single-use: once one step uses it, the option is
  // removed from every other step's dropdown (you only send one request).
  const channelOptionsFor = (index: number) => {
    const connectTakenElsewhere = sequenceDraft.some(
      (d, i) => i !== index && methodKeyFromStep(d.action_type) === "linkedin_connect",
    );
    return CHANNEL_OPTIONS.filter((o) => {
      if (o.key === "linkedin_connect" && connectTakenElsewhere) return false;
      // Hide channels this prospect cannot reach (same rules as the backend).
      if (o.key === "email" && !emailUsable) return false;
      if (o.key.startsWith("linkedin") && !hasLinkedin) return false;
      return true;
    });
  };

  const awaitingThread = ["awaiting_approval", "action_required"].includes(threadStatus);
  // Editable while awaiting approval, right after dispatch ("approved"), and while
  // running ("in_progress"/"partially_sent"). The workflow_id is set at dispatch,
  // so the Temporal update_sequence signal path works in all of these states.
  const interactive = awaitingThread || ["approved", "dispatched", "in_progress"].includes(threadStatus) || threadStatus.startsWith("partially_sent");
  // Per-step approval signals only exist for per_step_and_message workflows.
  // In per_sequence mode the sequence is approved as a whole and step-level
  // Approve/Skip/Regenerate buttons would be no-ops — hide them.
  const perStepMode = approvalMode === "per_step_and_message";

  const openMessageEditor = (step: MergedStep) => {
    setEditFor(step.step_num);
    setEditBody(step.message || "");
    setEditSubject(step.subject || "");
  };

  const openContextEditor = (step: MergedStep) => {
    setContextFor(step.step_num);
    setEditBody("");
    setEditSubject("");
  };

  const openSequenceEditor = () => {
    setSequenceDraft(steps.map(toSequenceDraft));
    setEditingSequence(true);
  };

  const setStepSchedule = (index: number, date: string, time: string) => {
    setSequenceDraft((current) =>
      enforceMonotonicOrder(
        current.map((x, i) =>
          i === index ? { ...x, scheduled_date: date, scheduled_time: time } : x,
        ),
      ),
    );
  };

  return (
    <>
      <div className="mb-3 flex justify-end">
        {interactive && (
          <Button size="sm" variant="ghost" onClick={openSequenceEditor} disabled={!!busySignal}>
            <Pencil className="h-3.5 w-3.5" /> Edit sequence
          </Button>
        )}
      </div>
      <ol className="relative space-y-3">
        {steps.map((step, idx) => {
          const tone = STEP_STATUS_TONE[step.status] ?? "neutral";
          const isLast = idx === steps.length - 1;
          return (
            <li key={step.step_num} className={cn("relative flex gap-3", threadStatus === "stopped" && step.scheduled_timestamp_utc && new Date(step.scheduled_timestamp_utc).getTime() < Date.now() && "opacity-50")}>
              {!isLast && (
                <span className="absolute left-[15px] top-9 h-[calc(100%-1.25rem)] w-px bg-white/8" />
              )}
              <span
                className={cn(
                  "relative z-10 mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border",
                  tone === "ok" && "border-emerald-400/30 bg-emerald-500/15 text-emerald-300",
                  tone === "warn" && "border-amber-400/30 bg-amber-500/15 text-amber-300",
                  tone === "danger" && "border-rose-400/30 bg-rose-500/15 text-rose-300",
                  tone === "accent" && "border-accent/50 bg-accent/15 text-accent-soft shadow-glow",
                  tone === "neutral" && "border-line bg-ink-800 text-mist",
                )}
              >
                <ChannelIcon channel={step.channel} />
              </span>

              <div className="min-w-0 flex-1">
                <div className="rounded-xl border border-line bg-ink-900/60 p-3.5 transition-colors hover:border-accent/20">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-slate-200">Step {step.step_num}</span>
                    <Badge tone="accent">
                      {ACTION_HINT[step.action_type] ?? channelLabel(step.channel, step.action_type)}
                    </Badge>
                    {channelUnavailableFor(step) && (
                      <span title={channelUnavailableFor(step) ?? undefined}>
                        <Badge tone="warn" dot>
                          Unavailable
                        </Badge>
                      </span>
                    )}
                    <Badge tone={tone} dot>{step.status.replace(/_/g, " ")}</Badge>
                    <span className="ml-auto flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-[11px] text-mist">
                      {formatScheduledTimestamp(step.scheduled_timestamp_utc) ? (
                        <span className="flex items-center gap-1 font-medium text-slate-300" title="Authoritative UTC schedule, shown in your local timezone">
                          <CalendarDays className="h-3 w-3" /> {formatScheduledTimestamp(step.scheduled_timestamp_utc)}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1"><CalendarDays className="h-3 w-3" /> day {step.day_offset}</span>
                      )}
                      {formatProspectTime(step.scheduled_timestamp_utc, step.timezone_offset, step.timezone_iana) && (
                        <span className="flex items-center gap-1" title="Time at the prospect's location">
                          <Clock3 className="h-3 w-3" /> {formatProspectTime(step.scheduled_timestamp_utc, step.timezone_offset, step.timezone_iana)}
                        </span>
                      )}
                      <span className="flex items-center gap-1"><Clock3 className="h-3 w-3" /> after {step.wait_delay_seconds ? `${Math.round(step.wait_delay_seconds / 3600)}h` : "start"}</span>
                      {step.timing_justification && (
                        <span className="group relative flex">
                          <Info className="h-3.5 w-3.5 cursor-help text-mist transition-colors hover:text-accent-soft" />
                          <span className="pointer-events-none absolute right-0 top-full z-30 mt-1.5 w-72 max-w-[85vw] whitespace-normal rounded-lg border border-line bg-ink-900 px-3 py-2 text-left text-[11px] leading-relaxed text-slate-300 opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100">
                            <span className="font-semibold text-slate-400">Why this timing · </span>
                            {step.timing_justification}
                          </span>
                        </span>
                      )}
                    </span>
                  </div>

                  {(step.strategy_notes || step.sequence_architecture_rationale) && (
                    <p className="mt-2 text-[11px] leading-relaxed text-mist">
                      <span className="font-semibold text-slate-400">Strategy · </span>{step.strategy_notes || step.sequence_architecture_rationale}
                    </p>
                  )}

                  {step.status !== "below_threshold" && step.quality_score != null && (
                    <div className={cn(
                      "mt-2.5 inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5",
                      step.quality_score >= 80 && "border-emerald-400/30 bg-emerald-500/10 text-emerald-300",
                      step.quality_score >= 60 && step.quality_score < 80 && "border-amber-400/30 bg-amber-500/10 text-amber-300",
                      step.quality_score < 60 && "border-rose-400/30 bg-rose-500/10 text-rose-300",
                    )}>
                      <span className="text-[10px] uppercase tracking-wider opacity-75">AI quality score</span>
                      <span className="font-mono text-sm font-bold">{Math.round(step.quality_score)}/100</span>
                    </div>
                  )}

                  {step.status !== "below_threshold" && step.generation_warnings && step.generation_warnings.length > 0 && (
                    <div className="mt-2.5 rounded-lg border border-amber-400/20 bg-amber-500/[0.06] px-3 py-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-300/80">Message critique</p>
                      <ul className="mt-1 space-y-1">
                        {step.generation_warnings.map((w, i) => (
                          <li key={i} className="flex items-start gap-1.5 text-[11px] leading-relaxed text-amber-100/80">
                            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-300/70" />
                            {w}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {step.status === "below_threshold" ? (
                    <div className="mt-3 rounded-lg border border-rose-400/25 bg-rose-500/10 p-3.5">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" />
                        <div>
                          <p className="text-xs font-semibold text-rose-200">Message not approved</p>
                          <p className="mt-1 text-xs leading-relaxed text-rose-200/80">
                            The generator failed to reach the minimum quality threshold. The generated message is hidden and has not been sent.
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (step.message || step.subject) && (
                    <div className="mt-3 rounded-lg border border-white/5 bg-ink-950/60 p-3">
                      {step.subject && (
                        <p className="text-xs font-semibold text-slate-300">
                          <FileText className="mr-1 inline h-3 w-3 text-accent-soft" />{step.subject}
                        </p>
                      )}
                      <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed text-slate-300/90">{step.message}</p>
                      {step.ai_write && (
                        <span className="mt-2 inline-flex items-center gap-1 text-[10px] text-accent-soft">
                          <BadgeCheck className="h-3 w-3" /> AI-generated · awaiting your approval
                        </span>
                      )}
                    </div>
                  )}

                  {step.error && (
                    <p className="mt-2 flex items-start gap-1.5 text-[11px] text-rose-300">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />{step.error}
                    </p>
                  )}
                  {step.sent_at && <p className="mt-2 text-[10px] text-mist">Sent {timeAgo(step.sent_at)}</p>}

                  {interactive && step.status !== "sent" && step.status !== "skipped" && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {step.status === "action_required" || step.action_required ? (
                        <Button
                          size="sm"
                          variant="primary"
                          disabled={!!busySignal}
                          onClick={() => setResolveFor(step.step_num)}
                        >
                          Resolve action
                        </Button>
                      ) : step.status === "below_threshold" ? (
                        <>
                          <Button size="sm" variant="primary" disabled={!!busySignal} onClick={() => openContextEditor(step)}>
                            <BookOpen className="h-3.5 w-3.5" /> Context
                          </Button>
                          {perStepMode && (
                            <Button size="sm" variant="danger" disabled={!!busySignal} onClick={() => onSignal("skip-step", step.step_num)}>
                              <SkipForward className="h-3.5 w-3.5" /> Skip step
                            </Button>
                          )}
                        </>
                      ) : (
                        <>
                          {step.message && (
                            <Button size="sm" variant="ghost" disabled={!!busySignal} onClick={() => openMessageEditor(step)}>
                              <Pencil className="h-3.5 w-3.5" /> Edit message
                            </Button>
                          )}
                          {perStepMode && (
                            <>
                              <Button size="sm" variant="primary" disabled={!!busySignal} onClick={() => onSignal("approve-step", step.step_num)}>
                                <Check className="h-3.5 w-3.5" /> Approve
                              </Button>
                              <Button size="sm" disabled={!!busySignal} onClick={() => onSignal("skip-step", step.step_num)}>
                                <SkipForward className="h-3.5 w-3.5" /> Skip
                              </Button>
                              <Button size="sm" disabled={!!busySignal} onClick={() => setRegenerateFor(step.step_num)}>
                                <RefreshCw className="h-3.5 w-3.5" /> Regenerate
                              </Button>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      <Modal open={contextFor !== null} onClose={() => setContextFor(null)} title={`Write message · step ${contextFor ?? ""}`}>
        <div className="rounded-lg border border-accent/20 bg-accent/[0.06] p-3">
          <p className="text-xs font-semibold text-slate-200">Generation context</p>
          <p className="mt-1 text-[11px] leading-relaxed text-mist">These are the inputs used for the failed generation. The generated draft remains hidden.</p>
          {contextFor !== null && (
            <div className="mt-3 space-y-2">
              {Object.entries(steps.find((s) => s.step_num === contextFor)?.generation_context ?? {}).map(([key, value]) => (
                <div key={key} className="rounded-md border border-white/5 bg-ink-950/40 px-2.5 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{key.replace(/_/g, " ")}</p>
                  <p className="mt-1 whitespace-pre-wrap text-[11px] leading-relaxed text-slate-300">{typeof value === "string" ? value || "—" : JSON.stringify(value, null, 2)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
        {contextFor !== null && steps.find((s) => s.step_num === contextFor)?.channel === "email" && (
          <input value={editSubject} onChange={(e) => setEditSubject(e.target.value)} className="input mt-3" placeholder="Email subject (optional)" />
        )}
        <textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} className="input mt-3" rows={8} placeholder="Write the exact message to use…" />
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={() => setContextFor(null)}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!editBody.trim()}
            onClick={() => {
              if (contextFor !== null && editBody.trim()) {
                onEditStep(contextFor, editBody.trim(), editSubject.trim() || null);
                setContextFor(null);
              }
            }}
          >
            <Check className="h-3.5 w-3.5" /> Save message
          </Button>
        </div>
      </Modal>

      <Modal open={editFor !== null} onClose={() => setEditFor(null)} title={`Edit message · step ${editFor ?? ""}`}>
        <p className="text-xs leading-relaxed text-mist">Your text is saved exactly as written. It will not be regenerated or sent until you explicitly approve the step.</p>
        {editFor !== null && steps.find((s) => s.step_num === editFor)?.channel === "email" && (
          <input value={editSubject} onChange={(e) => setEditSubject(e.target.value)} className="input mt-3" placeholder="Email subject (optional)" />
        )}
        <textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} className="input mt-3" rows={8} placeholder="Write the exact message to use…" />
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={() => setEditFor(null)}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!editBody.trim()}
            onClick={() => {
              if (editFor !== null && editBody.trim()) {
                onEditStep(editFor, editBody.trim(), editSubject.trim() || null);
                setEditFor(null);
              }
            }}
          >
            <Check className="h-3.5 w-3.5" /> Save edit
          </Button>
        </div>
      </Modal>

      <Modal open={editingSequence} onClose={() => setEditingSequence(false)} title="Edit sequence">
        <p className="text-xs leading-relaxed text-mist">Change channels, timing, order, notes, or remove steps. Existing messages are preserved; saving does not regenerate or send anything.</p>
        <div className="mt-3 max-h-[55vh] space-y-3 overflow-y-auto pr-1">
          {sequenceDraft.map((draft, index) => (
            <div key={draft.step_num} className="rounded-lg border border-line bg-ink-900/60 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-200">Step {draft.step_num}</span>
                <div className="flex gap-1">
                  <Button size="sm" disabled={index === 0 || isLocked(draft.step_num) || isLocked(sequenceDraft[index - 1]?.step_num)} onClick={() => setSequenceDraft((current) => {
                    const next = [...current]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; return next;
                  })}><ArrowUp className="h-3 w-3" /></Button>
                  <Button size="sm" disabled={index === sequenceDraft.length - 1 || isLocked(draft.step_num) || isLocked(sequenceDraft[index + 1]?.step_num)} onClick={() => setSequenceDraft((current) => {
                    const next = [...current]; [next[index], next[index + 1]] = [next[index + 1], next[index]]; return next;
                  })}><ArrowDown className="h-3 w-3" /></Button>
                  <Button size="sm" variant="danger" disabled={isLocked(draft.step_num) || sequenceDraft.length <= 1} onClick={() => setSequenceDraft((current) => current.filter((_, i) => i !== index))}><Trash2 className="h-3 w-3" /></Button>
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <select
                    disabled={isLocked(draft.step_num)}
                    className="input !py-2 text-xs"
                    value={methodKeyFromStep(draft.action_type)}
                    onChange={(e) => {
                      const opt = CHANNEL_OPTIONS.find((o) => o.key === e.target.value);
                      if (!opt) return;
                      setSequenceDraft((current) => current.map((x, i) => i === index ? { ...x, action_type: opt.action_type, channel: opt.channel } : x));
                    }}
                  >
                    {channelOptionsFor(index).map((o) => (
                      <option key={o.key} value={o.key}>{o.label}</option>
                    ))}
                  </select>
                  {channelErrorFor(draft) && (
                    <p className="mt-1 text-[10px] font-medium text-rose-300">{channelErrorFor(draft)}</p>
                  )}
                </div>
                <input disabled={isLocked(draft.step_num)} className="input !py-2 text-xs" type="date" min={index > 0 ? sequenceDraft[index - 1]?.scheduled_date : undefined} value={draft.scheduled_date} onChange={(e) => setStepSchedule(index, e.target.value, draft.scheduled_time)} />
                <input disabled={isLocked(draft.step_num)} className="input !py-2 text-xs" type="time" min={index > 0 && draft.scheduled_date === sequenceDraft[index - 1]?.scheduled_date ? sequenceDraft[index - 1]?.scheduled_time : undefined} value={draft.scheduled_time} onChange={(e) => setStepSchedule(index, draft.scheduled_date, e.target.value)} />
              </div>
              {orderErrorFor(index) && (
                <p className="mt-1.5 flex items-start gap-1.5 text-[10px] font-medium text-amber-300">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />{orderErrorFor(index)}
                </p>
              )}
              <p className="mt-1.5 text-[10px] leading-relaxed text-mist">
                Day and time are in the prospect's timezone{steps[index]?.timezone_iana ? ` (${steps[index].timezone_iana})` : steps[index]?.timezone_name ? ` (${steps[index].timezone_name})` : ""}. The backend deterministically converts them to the UTC send schedule.
              </p>
              <textarea disabled={isLocked(draft.step_num)} className="input mt-2 !py-2 text-xs" rows={2} value={draft.strategy_notes} onChange={(e) => setSequenceDraft((current) => current.map((x, i) => i === index ? { ...x, strategy_notes: e.target.value } : x))} placeholder="Strategy notes" />
              {strategyErrorFor(draft) && (
                <p className="mt-1 text-[10px] font-medium text-rose-300">{strategyErrorFor(draft)}</p>
              )}
            </div>
          ))}
        </div>
        <div className="mt-3 flex justify-between gap-2">
          <Button onClick={() => setSequenceDraft((current) => {
            const last = current[current.length - 1];
            let nextDate = last?.scheduled_date || new Date().toISOString().slice(0, 10);
            if (last?.scheduled_date) {
              const d = new Date(`${last.scheduled_date}T00:00:00Z`);
              d.setUTCDate(d.getUTCDate() + 1);
              nextDate = d.toISOString().slice(0, 10);
            }
            const firstUsable = CHANNEL_OPTIONS.find((o) => {
              if (o.key === "email" && !emailUsable) return false;
              if (o.key.startsWith("linkedin") && !hasLinkedin) return false;
              return true;
            });
            const fallback = firstUsable ?? CHANNEL_OPTIONS[0];
            return [...current, { step_num: Math.max(0, ...current.map((x) => x.step_num)) + 1, action_type: fallback.action_type, channel: fallback.channel, scheduled_date: nextDate, scheduled_time: "10:00", strategy_notes: "" }];
          })}><Plus className="h-3.5 w-3.5" /> Add step</Button>
          <div className="flex gap-2">
            <Button onClick={() => setEditingSequence(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => {
              const invalidIndex = sequenceDraft.findIndex((d, i) => channelErrorFor(d) || strategyErrorFor(d) || orderErrorFor(i));
              if (invalidIndex !== -1) {
                const invalid = sequenceDraft[invalidIndex];
                toast.error(
                  orderErrorFor(invalidIndex) ?? channelErrorFor(invalid) ?? strategyErrorFor(invalid) ?? "Fix the highlighted fields.",
                );
                return;
              }
              const savedSteps = hasImmutableSteps
                ? sequenceDraft
                : sequenceDraft.map((step, index) => ({ ...step, step_num: index + 1 }));
              onEditSequence(savedSteps);
              setEditingSequence(false);
            }}><Check className="h-3.5 w-3.5" /> Save sequence</Button>
          </div>
        </div>
      </Modal>

      <Modal open={regenerateFor !== null} onClose={() => setRegenerateFor(null)} title={`Regenerate step ${regenerateFor ?? ""}`}>
        <p className="text-xs text-mist">Add optional feedback to steer the AI (tone, length, different angle…).</p>
        <textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} className="input mt-3" rows={4} placeholder="e.g. Shorter, warmer tone, mention the new funding round" />
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={() => setRegenerateFor(null)}>Cancel</Button>
          <Button variant="primary" onClick={() => { if (regenerateFor !== null) { onSignal("regenerate-step", regenerateFor, feedback || undefined); setRegenerateFor(null); setFeedback(""); } }}><RefreshCw className="h-3.5 w-3.5" /> Regenerate</Button>
        </div>
      </Modal>

      <Modal open={resolveFor !== null} onClose={() => setResolveFor(null)} title={`Resolve action · step ${resolveFor ?? ""}`}>
        {resolveFor !== null && (() => {
          const step = steps.find((s) => s.step_num === resolveFor);
          const ar =
            step && typeof step.action_required === "object" && step.action_required !== null
              ? (step.action_required as Record<string, unknown>)
              : {};
          const errorCode = ar.error_code ? String(ar.error_code) : null;
          const errorMessage = ar.error_message
            ? String(ar.error_message)
            : step?.error ?? null;
          const actions = normalizeResolveActions(ar.available_actions ?? step?.available_actions);
          const options = actions.length
            ? actions
            : [{ action: "skip_step", label: "Skip this step" }];
          return (
            <>
              <p className="text-xs leading-relaxed text-mist">
                The message failed to send and the workflow paused to protect the account.
                Choose how to recover:
              </p>
              {errorCode && (
                <div className="mt-3 rounded-lg border border-line bg-ink-900/60 p-2.5 font-mono text-[10px] text-rose-300">
                  {errorCode}
                </div>
              )}
              {errorMessage && (
                <p className="mt-2 rounded-lg border border-rose-400/25 bg-rose-500/10 p-2.5 text-[11px] leading-relaxed text-rose-200/90">
                  {errorMessage}
                </p>
              )}
              <div className="mt-4 space-y-2">
                {options.map(({ action, label }) => (
                  <button
                    key={action}
                    onClick={() => {
                      onResolveAction(resolveFor, action);
                      setResolveFor(null);
                    }}
                    className="flex w-full items-center justify-between rounded-lg border border-line bg-ink-900/60 px-3 py-2.5 text-xs text-slate-200 transition-colors hover:border-accent/40 hover:text-white"
                  >
                    <span>{label}</span>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-mist" />
                  </button>
                ))}
              </div>
              <div className="mt-4 flex justify-end">
                <Button onClick={() => setResolveFor(null)}>Cancel</Button>
              </div>
            </>
          );
        })()}
      </Modal>
    </>
  );
}
