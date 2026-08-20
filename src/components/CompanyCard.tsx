import { Building2, Users, MapPin, Globe, ThumbsDown, ThumbsUp, TrendingUp, Info } from "lucide-react";
import { Badge, Button, ScoreBar } from "@/components/ui";
import type { CompanyRow } from "@/lib/enrich";
import { companyScoreExplanation } from "@/lib/enrich";
import { formatNumber } from "@/lib/utils";

export default function CompanyCard({
  company,
  onDecline,
  onApprove,
  busy,
}: {
  company: CompanyRow;
  onDecline: (id: string) => void;
  /** Present only during company HITL — lets the user restore a declined company. */
  onApprove?: (id: string) => void;
  busy: boolean;
}) {
  const declined = company.status === "declined";
  // Refresh-discovered candidates in HITL campaigns wait for approval.
  const pendingReview = company.status === "pending_review";
  // Fit-floor rejection: auto-approve parked this company (fit below the
  // auto_approve_fit_floor) — visible in a review list, never packaged.
  const belowThreshold = company.status === "below_threshold";
  const metrics = company.metrics;
  // Near-miss / below-fit (C): scored below the passing bar but not
  // discarded — shown honestly instead of as "approved". The (i) tooltip
  // explains that the next refresh cycle re-scores them.
  const belowFit =
    !declined && !pendingReview && !belowThreshold && String(metrics?.tier) === "Pending";
  // Contacted before (a thread exists). They keep refreshing until the user
  // declines them — declining greys the card out and stops refresh.
  const contacted = !!company.outreach_status;
  const contactedLabel =
    company.outreach_status === "completed" ||
    company.outreach_status === "replied"
      ? "already contacted (finished sequence)"
      : "already contacted";

  return (
    <div className={`card p-5 transition-opacity ${declined ? "opacity-55" : ""}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line bg-ink-800 text-accent-soft">
            <Building2 className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="truncate text-sm font-semibold text-slate-100">{company.name}</h4>
              {declined ? (
                <Badge tone="danger">declined</Badge>
              ) : contacted ? (
                <>
                  <Badge tone="neutral">{contactedLabel}</Badge>
                  {company.reengagement && (
                    <Badge tone="accent">new intent — re-engagement</Badge>
                  )}
                </>
              ) : pendingReview ? (
                <Badge tone="warn">pending review</Badge>
              ) : belowThreshold ? (
                <Badge tone="warn">below fit floor</Badge>
              ) : belowFit ? (
                <Badge tone="warn">below fit</Badge>
              ) : (
                <Badge tone="ok">approved</Badge>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-mist">
              {company.industry && <span>{company.industry}</span>}
              {company.size != null && (
                <span className="flex items-center gap-1">
                  <Users className="h-3 w-3" /> {formatNumber(company.size)} employees
                </span>
              )}
              {(company.city || company.country) && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />{" "}
                  {[company.city, company.country].filter(Boolean).join(", ")}
                </span>
              )}
              {company.domain && (
                <span className="flex items-center gap-1 truncate">
                  <Globe className="h-3 w-3" /> {company.domain}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="text-right">
          {/* Clearbit-style split: fit (stable) and intent (moves) shown as
              two separate numbers instead of one blended score. */}
          <div className="flex items-start justify-end gap-4">
            <div>
              <p className="font-mono text-2xl font-bold tracking-tight text-slate-50">
                {metrics?.firmographic_score != null
                  ? Math.round(metrics.firmographic_score)
                  : company.score === null
                    ? "—"
                    : Math.round(company.score)}
              </p>
              <p className="text-[10px] uppercase tracking-wider text-mist">fit</p>
            </div>
            <div>
              <p className="font-mono text-2xl font-bold tracking-tight text-accent-soft">
                {metrics?.intent_confidence === "unknown" || metrics?.intent_score == null
                  ? "—"
                  : Math.round(metrics.intent_score)}
              </p>
              <p className="text-[10px] uppercase tracking-wider text-mist">intent</p>
            </div>
            <span
              className="cursor-help"
              title={(() => {
                const { fit, intent } = companyScoreExplanation(metrics);
                return [fit, intent].filter(Boolean).join("\n\n");
              })()}
            >
              <Info className="h-3.5 w-3.5 text-mist transition-colors hover:text-accent-soft" />
            </span>
          </div>
        </div>
      </div>

      <ScoreBar score={company.score} className="mt-4" />

      {metrics && (
        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-5">
          {          [
            { label: "Industry", value: metrics.industry_score },
            { label: "Size", value: metrics.size_score },
            { label: "Revenue", value: metrics.revenue_score },
            { label: "Tech", value: metrics.tech_stack_score },
            // Intent is a headline number now (fit/intent split) — the grid
            // keeps the firmographic breakdown only.
          ]
            .filter((m) => (m as { unknown?: boolean }).unknown || typeof m.value === "number")
            .map((m) => (
              <div key={m.label}>
                <p className="text-[10px] uppercase tracking-wider text-mist">{m.label}</p>
                <p className="font-mono text-xs font-semibold text-slate-200">
                  {(m as { unknown?: boolean }).unknown
                    ? "—"
                    : Math.round(m.value as number)}
                </p>
              </div>
            ))}
        </div>
      )}

      {company.intent_summary && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-accent/15 bg-accent/5 p-2.5 text-[11px] leading-relaxed text-slate-300">
          <TrendingUp className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-soft" />
          {company.intent_summary}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-[11px] text-mist">
          {contacted
            ? "Contacted before — refreshing for new intent; decline to stop."
            : company.personas_count > 0
              ? `${company.personas_count} persona${company.personas_count > 1 ? "s" : ""} sourced`
              : "no personas yet"}
        </span>
        {pendingReview ? (
          <div className="flex items-center gap-2">
            {onApprove && (
              <Button size="sm" variant="primary" onClick={() => onApprove(company.id)} disabled={busy}>
                <ThumbsUp className="h-3.5 w-3.5" /> Approve
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => onDecline(company.id)} disabled={busy}>
              <ThumbsDown className="h-3.5 w-3.5" /> Decline
            </Button>
          </div>
        ) : !declined ? (
          <Button size="sm" variant="ghost" onClick={() => onDecline(company.id)} disabled={busy}>
            <ThumbsDown className="h-3.5 w-3.5" /> Decline
          </Button>
        ) : onApprove ? (
          <Button size="sm" variant="ghost" onClick={() => onApprove(company.id)}>
            <ThumbsUp className="h-3.5 w-3.5" /> Approve
          </Button>
        ) : null}
      </div>
    </div>
  );
}
