import {
  Check,
  CircleDashed,
  Search,
  FileSearch,
  Database,
  Building2,
  Gauge,
  Radar,
  RefreshCw,
  Users,
  UserCheck,
  Mail,
  PackageCheck,
  Send,
  Clock3,
  CheckCircle2,
  XCircle,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PHASE_A_STAGES,
  PHASE_B_STAGES,
  phaseAIndex,
  RUNNING_STAGES,
} from "@/lib/stages";
import type { Campaign } from "@/lib/types";

const ICONS: Record<string, typeof Check> = {
  created: CircleDashed,
  icp_extract: FileSearch,
  icp_persisted: Database,
  fetch_companies: Building2,
  rank_companies: Gauge,
  fetch_intent: Radar,
  rescore_intent: RefreshCw,
  fetch_personas: Users,
  rank_personas: UserCheck,
  enrich_contacts: Mail,
  package_ready: PackageCheck,
  outreach_started: Send,
  outreach_awaiting_approval: Clock3,
  outreach_approved: CheckCircle2,
  outreach_dispatched: Sparkles,
  outreach_failed: XCircle,
};

export default function StageStepper({ campaign }: { campaign: Campaign }) {
  const stage = campaign.stage;
  const currentIdx = phaseAIndex(stage);
  const failed = campaign.status === "failed" || stage === "failed";
  const done = campaign.status === "completed";
  const stopped = campaign.status === "stopped";
  const running = campaign.status === "running" && RUNNING_STAGES.has(stage);
  const inPhaseB = phaseAIndex(stage) === -1 && stage !== "failed" && stage !== "created";

  return (
    <div className="space-y-6">
      {/* ── Phase A ── */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <span className="eyebrow">Phase A · Discovery</span>
          {running && (
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-accent-soft">
              <span className="h-1.5 w-1.5 animate-pulseglow rounded-full bg-accent" />
              pipeline running
            </span>
          )}
        </div>

        <ol className="space-y-1">
          {PHASE_A_STAGES.map((s, idx) => {
            const Icon = ICONS[s.key] ?? CircleDashed;
            const isDone = done || (currentIdx >= 0 && idx < currentIdx);
            // A stopped campaign freezes at its last stage — it must NOT render
            // as still-active (pulsing glow + "working now…") — that reads as a
            // stuck loading indicator.
            const isActive = !done && !failed && !stopped && currentIdx === idx;
            const isFailed = failed && idx === currentIdx;
            return (
              <li key={s.key} className="relative flex gap-3 pb-4 last:pb-0">
                {/* connector */}
                {idx < PHASE_A_STAGES.length - 1 && (
                  <span
                    className={cn(
                      "absolute left-[15px] top-8 h-[calc(100%-2rem)] w-px",
                      isDone || isActive ? "bg-accent/40" : "bg-white/8",
                    )}
                  />
                )}
                <span
                  className={cn(
                    "relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border transition-all duration-300",
                    isDone &&
                      "border-emerald-400/30 bg-emerald-500/15 text-emerald-300",
                    isActive &&
                      "border-accent/50 bg-accent/15 text-accent-soft shadow-glow animate-pulseglow",
                    isFailed && "border-rose-400/30 bg-rose-500/15 text-rose-300",
                    !isDone && !isActive && !isFailed && "border-line bg-ink-800 text-mist/50",
                  )}
                >
                  {isDone ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </span>
                <div className="flex-1 pt-0.5">
                  <p
                    className={cn(
                      "text-[13px] font-semibold",
                      isDone && "text-slate-300",
                      isActive && "text-white",
                      isFailed && "text-rose-300",
                      !isDone && !isActive && !isFailed && "text-slate-500",
                    )}
                  >
                    {s.label}
                  </p>
                  <p className="mt-0.5 text-[11px] text-mist/70">{s.description}</p>
                  {isActive && (
                    <p className="mt-1 text-[11px] font-medium text-accent-soft">
                      working now…
                    </p>
                  )}
                  {isFailed && (
                    <p className="mt-1 text-[11px] font-medium text-rose-300">
                      failed — see error below
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      {/* ── Phase B ── */}
      {inPhaseB && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <span className="eyebrow">Phase B · Outreach</span>
            {stage.startsWith("outreach") && !stopped && (
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-accent-soft">
                <Search className="h-3 w-3" /> live
              </span>
            )}
          </div>
          <ol className="space-y-1">
            {PHASE_B_STAGES.map((s, idx) => {
              const Icon = ICONS[s.key] ?? CircleDashed;
              const reached = stage === s.key;
              const isActive = reached && campaign.status === "running";
              return (
                <li key={s.key} className="relative flex gap-3 pb-4 last:pb-0">
                  {idx < PHASE_B_STAGES.length - 1 && (
                    <span
                      className={cn(
                        "absolute left-[15px] top-8 h-[calc(100%-2rem)] w-px",
                        reached || isActive ? "bg-accent/40" : "bg-white/8",
                      )}
                    />
                  )}
                  <span
                    className={cn(
                      "relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border transition-all duration-300",
                      reached
                        ? "border-accent/50 bg-accent/15 text-accent-soft"
                        : "border-line bg-ink-800 text-mist/50",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="flex-1 pt-0.5">
                    <p
                      className={cn(
                        "text-[13px] font-semibold",
                        reached ? "text-white" : "text-slate-500",
                      )}
                    >
                      {s.label}
                    </p>
                    <p className="mt-0.5 text-[11px] text-mist/70">{s.description}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}
