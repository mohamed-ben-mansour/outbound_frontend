import {
  BadgeCheck,
  CheckCircle2,
  Info,
  Linkedin,
  Mail,
  Phone,
  Send,
  Sparkles,
  Trophy,
  AlertCircle,
} from "lucide-react";
import { Badge, Button, ScoreBar } from "@/components/ui";
import type { PersonaRow } from "@/lib/enrich";
import { personaScoreExplanation } from "@/lib/enrich";
import { cn, initials } from "@/lib/utils";

export default function PersonaCard({
  persona,
  selected,
  leadId,
  outreachStarted,
  onStartOutreach,
  busy,
  skippedNote,
}: {
  persona: PersonaRow;
  selected?: boolean;
  /** Package lead_id when this persona was selected for Phase B outreach. */
  leadId?: string;
  outreachStarted?: boolean;
  onStartOutreach?: (leadId: string) => void;
  busy?: boolean;
  /** Why outreach couldn't start for this person (no reachable channel). */
  skippedNote?: string;
}) {
  const metrics = persona.metrics;
  const hasIntentMotion = Boolean(
    metrics && (metrics.tenure_trigger_active || metrics.has_public_signals),
  );
  const fitScore =
    metrics?.fit_score != null
      ? Math.round(metrics.fit_score)
      : persona.score === null
        ? null
        : Math.round(persona.score);
  const intentScore =
    metrics?.timing_score != null && hasIntentMotion
      ? Math.round(metrics.timing_score)
      : null;

  return (
    <div
      className={cn(
        "card card-hover p-4 transition-all",
        selected && "border-accent/40 shadow-softglow",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent to-glow text-xs font-bold text-white shadow-softglow">
          {initials(persona.name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4 className="truncate text-sm font-semibold text-slate-100">{persona.name}</h4>
            {persona.verified && (
              <BadgeCheck className="h-4 w-4 shrink-0 text-emerald-400" />
            )}
          </div>
          <p className="truncate text-xs text-mist">{persona.title || "—"}</p>
        </div>
        {/* Clearbit-style split (mirrors the company card): Fit = role +
            seniority match, Intent = the person's own LinkedIn motion. */}
        <div className="flex items-start gap-3 text-right">
          <div>
            <p className="font-mono text-lg font-bold text-slate-50">
              {fitScore === null ? "—" : fitScore}
            </p>
            <p className="text-[10px] uppercase tracking-wider text-mist">fit</p>
          </div>
          <div>
            <p className="font-mono text-lg font-bold text-accent-soft">
              {intentScore === null ? "—" : intentScore}
            </p>
            <p className="text-[10px] uppercase tracking-wider text-mist">intent</p>
          </div>
          <span
            className="cursor-help"
            title={(() => {
              const { fit, intent } = personaScoreExplanation(metrics);
              return [fit, intent].filter(Boolean).join("\n\n");
            })()}
          >
            <Info className="h-3.5 w-3.5 text-mist transition-colors hover:text-accent-soft" />
          </span>
        </div>
      </div>

      <ScoreBar score={persona.score} className="mt-3" />

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-mist">
        {persona.company_name && <span>{persona.company_name}</span>}
        {selected && (
          <span className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-accent-soft">
            <Trophy className="h-2.5 w-2.5" /> Phase B lead
          </span>
        )}
      </div>

      <div className="mt-2 grid grid-cols-1 gap-1 text-[11px]">
        {persona.email ? (
          <span className="flex items-center gap-1.5 truncate text-mist">
            <Mail className="h-3 w-3 shrink-0" />
            <span className="truncate">{persona.email}</span>
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-mist/45">
            <Mail className="h-3 w-3 shrink-0" />
            <span className="italic">Email unfound</span>
          </span>
        )}
        {persona.linkedin_url ? (
          <a
            href={persona.linkedin_url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 truncate text-accent-soft transition-colors hover:text-white"
          >
            <Linkedin className="h-3 w-3 shrink-0" />
            <span className="truncate">{persona.linkedin_url}</span>
          </a>
        ) : (
          <span className="flex items-center gap-1.5 text-mist/45">
            <Linkedin className="h-3 w-3 shrink-0" />
            <span className="italic">LinkedIn unfound</span>
          </span>
        )}
        {persona.phone ? (
          <span className="flex items-center gap-1.5 truncate text-mist">
            <Phone className="h-3 w-3 shrink-0" />
            <span className="truncate">{persona.phone}</span>
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-mist/45">
            <Phone className="h-3 w-3 shrink-0" />
            <span className="italic">Phone unfound</span>
          </span>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-mist">
        {persona.signals_count != null && persona.signals_count > 0 && (
          <span className="flex items-center gap-1 text-warn">
            <Sparkles className="h-3 w-3" /> {persona.signals_count} signal
            {persona.signals_count > 1 ? "s" : ""}
          </span>
        )}
      </div>
      {persona.role_match != null && (
        <div className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-line bg-ink-900/70 px-2 py-1 text-[10px] text-mist">
          <Badge tone="accent">role match</Badge>
          <span className="font-mono">{Math.round(persona.role_match)}</span>
        </div>
      )}

      {leadId && !skippedNote && (
        <Button
          size="sm"
          variant={outreachStarted ? "secondary" : "primary"}
          className="mt-3 w-full"
          loading={busy}
          onClick={() => onStartOutreach?.(leadId)}
        >
          <Send className="h-3.5 w-3.5" />
          {outreachStarted ? "Restart outreach" : "Start outreach"}
        </Button>
      )}
      {skippedNote && (
        <div className="mt-3 flex items-start gap-1.5 rounded-lg border border-warn/25 bg-warn/10 p-2 text-[10px] leading-relaxed text-amber-200/90">
          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0 text-warn" />
          <span>{skippedNote}</span>
        </div>
      )}
      {leadId && outreachStarted && (
        <div className="mt-2 flex items-center justify-center gap-1.5 text-[10px] text-mist">
          <CheckCircle2 className="h-3 w-3 text-emerald-300/80" />
          Already started — restarting shows a warning first
        </div>
      )}
    </div>
  );
}
