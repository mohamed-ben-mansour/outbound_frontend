import { useCallback, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  Activity,
  Building2,
  Users,
  Send,
  Play,
  AlertCircle,
  RefreshCw,
  History,
  ArrowLeft,
  PackageCheck,
  Sparkles,
  Check,
  Undo2,
  Gauge,
} from "lucide-react";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Modal,
  PulseBar,
  Skeleton,
  Tabs,
  type TabItem,
} from "@/components/ui";
import {
  useApproveCompanies,
  useApproveRefreshCandidates,
  useAuditTrail,
  useCampaign,
  useCampaignUsage,
  useDeclineCompanies,
  useObservability,
  useOutreachThreads,
  useProspectReply,
  useRankedCompanies,
  useRankedPersonas,
  useRefreshCampaign,
  useRestartOutreachLead,
  useStartOutreach,
} from "@/hooks/queries";
import { RUNNING_STAGES, statusTone } from "@/lib/stages";
import {
  artifactActivity,
  buildCompanyRows,
  buildPersonaRows,
  parsedIcp,
} from "@/lib/enrich";
import { cn, formatNumber, formatTime, timeAgo } from "@/lib/utils";
import type { OutreachThread } from "@/lib/types";
import StageStepper from "@/components/StageStepper";
import CompanyCard from "@/components/CompanyCard";
import PersonaCard from "@/components/PersonaCard";
import ThreadReview from "@/components/ThreadReview";
import AuditFeed from "@/components/AuditFeed";

type TabKey = "pipeline" | "companies" | "personas" | "outreach" | "usage";

/** Human-readable one-liner for a refresh_summary artifact payload. */
function describeRefreshResult(p: Record<string, unknown>): string {
  if (p.status === "noop") {
    return String(p.message ?? "Nothing to re-qualify.");
  }
  if (p.status === "skipped") {
    return String(p.message ?? "Refresh skipped.");
  }
  const parts: string[] = [];
  const newQualified = Array.isArray(p.new_qualified) ? p.new_qualified.length : 0;
  if (newQualified > 0) {
    parts.push(
      `${newQualified} new compan${newQualified === 1 ? "y" : "ies"} qualified`,
    );
  }
  if (typeof p.intent_updated === "number" && p.intent_updated > 0) {
    parts.push(`intent refreshed for ${p.intent_updated}`);
  }
  if (typeof p.new_packages === "number" && p.new_packages > 0) {
    parts.push(
      `${p.new_packages} package${p.new_packages === 1 ? "" : "s"} built`,
    );
  }
  if (typeof p.outreach_started === "number" && p.outreach_started > 0) {
    parts.push(`outreach started for ${p.outreach_started}`);
  }
  const err = p.error ?? p.outreach_error;
  if (err) parts.push(`⚠ ${err}`);
  if (parts.length === 0) return "No changes on this pass.";
  return parts.join(" · ");
}

export default function CampaignDetail() {
  const { campaignId = "" } = useParams();
  const [tab, setTab] = useState<TabKey>("pipeline");

  const { data: detail, isLoading, isError } = useCampaign(campaignId, 4_000);
  const usageQuery = useCampaignUsage(campaignId);
  // Poll threads while the campaign is running so auto-started outreach shows
  // up without requiring a manual "Start outreach" click.
  const threadsQuery = useOutreachThreads(
    campaignId,
    5_000,
    detail?.campaign?.status === "running",
  );
  const { data: companies } = useRankedCompanies(campaignId);
  const { data: personas } = useRankedPersonas(campaignId);
  const { data: audit } = useAuditTrail(campaignId);
  const { data: observability } = useObservability(campaignId);

  const declineMutation = useDeclineCompanies(campaignId);
  const approveCompanies = useApproveCompanies(campaignId);
  const refreshCampaign = useRefreshCampaign(campaignId);
  const approveRefreshCandidates = useApproveRefreshCandidates(campaignId);
  const startOutreach = useStartOutreach(campaignId);
  const restartOutreachLead = useRestartOutreachLead(campaignId);
  const reply = useProspectReply(campaignId);

  const campaign = detail?.campaign;
  const running = !!campaign && campaign.status === "running" && RUNNING_STAGES.has(campaign.stage);
  // A campaign is refreshable once Phase A finished (package_ready or any
  // outreach stage) — refresh never re-parses the ICP.
  const refreshableStage =
    !!campaign &&
    campaign.status !== "stopped" &&
    campaign.status !== "cancelled" &&
    [
      "package_ready",
      "outreach_started",
      "outreach_awaiting_approval",
      "outreach_approved",
      "outreach_dispatched",
      "outreach_failed",
    ].includes(campaign.stage);
  const refreshFreq = detail?.refresh?.refresh_frequency ?? "off";
  const lastRefreshedAt = detail?.refresh?.last_refreshed_at ?? null;
  const refreshInProgress = detail?.refresh?.in_progress ?? false;
  // Latest refresh pass result — written by the pipeline as a refresh_summary
  // artifact (status, new companies, intent updated, packages, errors).
  const refreshSummary = useMemo(() => {
    const arts = (detail?.artifacts ?? []).filter(
      (a) => a.stage === "refresh_summary",
    );
    const last = arts[arts.length - 1];
    return last
      ? { payload: (last.payload ?? {}) as Record<string, unknown>, created_at: last.created_at }
      : null;
  }, [detail?.artifacts]);

  // Company HITL: the pipeline paused at ready_for_personas — the user picks
  // which companies proceed to persona discovery before it resumes.
  const [declinedIds, setDeclinedIds] = useState<Set<string>>(new Set());
  const awaitingCompanyApproval =
    !!campaign &&
    campaign.stage === "ready_for_personas" &&
    campaign.status === "awaiting_approval";
  const threads = threadsQuery.data ?? [];
  // Outreach ran at least once once any thread exists — including
  // ``awaiting_persona`` skips (the no-contact-info packages auto-start
  // attempted and parked). Drives the "outreach was attempted, not ignored"
  // copy on skipped leads.
  const outreachAttempted = threads.length > 0;
  const awaitingCount = threads.filter((t) =>
    ["awaiting_approval", "action_required", "pending"].includes(t.status),
  ).length;

  // ── Thread grouping: awaiting approval / running / message validation / finished / stopped ──
  const approvalMode = (
    detail?.campaign?.outreach_config as Record<string, unknown> | null | undefined
  )?.approval_mode as string | undefined;
  const perStepMode = approvalMode === "per_step_and_message";

  const threadGroups = useMemo(() => {
    const groups: Record<
      "awaiting" | "running" | "validation" | "finished" | "stopped" | "skipped",
      OutreachThread[]
    > = {
      awaiting: [],
      running: [],
      validation: [],
      finished: [],
      stopped: [],
      skipped: [],
    };

    const hasPendingSteps = (t: OutreachThread): boolean => {
      const storageId = t.workflow_id || t.thread_id;
      if (!storageId) return false;
      return (detail?.outreach_steps ?? []).some(
        (s) =>
          s.workflow_id === storageId &&
          !["sent", "skipped", "failed", "completed"].includes(s.status),
      );
    };

    for (const t of threads) {
      const status = t.status;
      if (status === "awaiting_persona") {
        // Outreach attempted but parked: no usable email AND no LinkedIn on
        // the persona, so no sequence could be generated. Shown separately
        // from "awaiting approval" so it reads as skipped, not pending.
        groups.skipped.push(t);
      } else if (status === "stopped" || status === "deleted") {
        groups.stopped.push(t);
      } else if (status === "action_required") {
        groups.validation.push(t);
      } else if (
        perStepMode &&
        hasPendingSteps(t) &&
        (["awaiting_approval", "pending"].includes(status) ||
          status === "in_progress" ||
          status.startsWith("partially_sent"))
      ) {
        groups.validation.push(t);
      } else if (["awaiting_approval", "pending"].includes(status)) {
        groups.awaiting.push(t);
      } else if (status === "in_progress" || status.startsWith("partially_sent")) {
        groups.running.push(t);
      } else if (["approved", "dispatched"].includes(status)) {
        groups.running.push(t);
      } else if (["completed", "replied", "rejected", "failed"].includes(status)) {
        groups.finished.push(t);
      } else {
        groups.awaiting.push(t);
      }
    }
    return groups;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threads, detail, perStepMode]);

  const companyRows = useMemo(
    () => buildCompanyRows(detail, companies),
    [detail, companies],
  );
  // Refresh-discovered candidates in HITL campaigns wait for approval before
  // personas are fetched — they are shown separately from approved companies.
  const pendingCompanyRows = companyRows.filter(
    (c) => c.status === "pending_review",
  );
  const approvedCompanyRows = companyRows.filter(
    (c) => c.status !== "pending_review",
  );
  // #4: echo the parsed ICP back so the user can verify what the LLM
  // understood before approving companies (catches loose parses early).
  const icp = useMemo(() => parsedIcp(detail), [detail]);
  const personaRows = useMemo(
    () => buildPersonaRows(detail, personas),
    [detail, personas],
  );
  const activity = useMemo(() => artifactActivity(detail), [detail]);

  // Every persona the pipeline selected for Phase B outreach (one per lead
  // package — companies can have several). Matches on apollo_id or name.
  // Also maps persona → package lead_id so the UI can start outreach for ONE
  // prospect (per-persona "Start outreach" button).
  const { selectedPersonaIds, leadIdByPersona } = useMemo(() => {
    const ids = new Set<string>();
    const leadIds = new Map<string, string>();
    for (const fp of detail?.packages ?? []) {
      const pkg = (fp.package ?? {}) as Record<string, unknown>;
      const leadId = typeof pkg.lead_id === "string" ? pkg.lead_id : "";
      const persona = pkg.persona as Record<string, unknown> | null;
      if (!persona) continue;
      if (persona.apollo_id) {
        ids.add(String(persona.apollo_id));
        if (leadId) leadIds.set(String(persona.apollo_id), leadId);
      }
      if (persona.name) {
        ids.add(String(persona.name));
        if (leadId) leadIds.set(String(persona.name), leadId);
      }
    }
    return { selectedPersonaIds: ids, leadIdByPersona: leadIds };
  }, [detail?.packages]);

  // Lead ids that already have an outreach thread — re-starting those shows
  // the warning dialog (stop old & start new / run anyway / cancel).
  const startedLeadIds = useMemo(() => {
    const started = new Set<string>();
    for (const t of threads) {
      if (t.lead_id) started.add(t.lead_id);
    }
    return started;
  }, [threads]);
  const [restartLead, setRestartLead] = useState<{
    leadId: string;
    name: string;
  } | null>(null);

  const onStartPersonaOutreach = (leadId: string, name: string) => {
    if (startedLeadIds.has(leadId)) {
      setRestartLead({ leadId, name });
      return;
    }
    startOutreach.mutate([leadId], {
      onSuccess: (res) => toast.success(res.message),
      onError: (e) => toast.error(e.message),
    });
  };

  const onRestartDecision = (stopExisting: boolean) => {
    if (!restartLead) return;
    const { leadId } = restartLead;
    setRestartLead(null);
    restartOutreachLead.mutate(
      { leadId, stopExisting },
      {
        onSuccess: (res) => toast.success(res.message),
        onError: (e) => toast.error(e.message),
      },
    );
  };

  // Packages grouped by company, so the outreach card lists every lead (or the
  // "no persona selected" fallback) per company instead of one "best lead".
  // Group threads by prospect company within a status section.
  const groupThreadsByCompany = useCallback(
    (threads: OutreachThread[]): Array<{ company: string; threads: OutreachThread[] }> => {
      const groups = new Map<string, OutreachThread[]>();
      for (const t of threads) {
        const company = t.prospect_company?.trim() || "Unknown company";
        const list = groups.get(company) ?? [];
        list.push(t);
        groups.set(company, list);
      }
      return Array.from(groups.entries()).map(([company, list]) => ({
        company,
        threads: list,
      }));
    },
    [],
  );

  const leadGroups = useMemo(() => {
    const groups = new Map<
      string,
      { companyName: string; leads: Array<{ key: string; personaName: string | null; combined: number | null }> }
    >();
    for (const fp of detail?.packages ?? []) {
      const pkg = (fp.package ?? {}) as Record<string, unknown>;
      const company = (pkg.company ?? {}) as Record<string, unknown>;
      const persona = pkg.persona as Record<string, unknown> | null;
      const companyId = String(company.apollo_id ?? fp.lead_id ?? "unknown");
      const entry =
        groups.get(companyId) ?? {
          companyName: String(company.name ?? "Unknown company"),
          leads: [],
        };
      entry.leads.push({
        key: persona?.apollo_id ? String(persona.apollo_id) : fp.lead_id,
        personaName: persona ? String(persona.name ?? "Unknown") : null,
        combined: persona ? ((persona.combined_lead_score as number | undefined) ?? null) : null,
      });
      groups.set(companyId, entry);
    }
    return Array.from(groups.values());
  }, [detail?.packages]);

  const tabs: TabItem[] = [
    { key: "pipeline", label: "Pipeline", icon: <Activity className="h-3.5 w-3.5" />, count: running ? undefined : 0 },
    { key: "companies", label: "Companies", icon: <Building2 className="h-3.5 w-3.5" />, count: companyRows.length },
    { key: "personas", label: "Personas", icon: <Users className="h-3.5 w-3.5" />, count: personaRows.length },
    { key: "outreach", label: "Outreach", icon: <Send className="h-3.5 w-3.5" />, count: awaitingCount },
    { key: "usage", label: "Usage", icon: <Gauge className="h-3.5 w-3.5" /> },
  ];

  const onDecline = (id: string) => {
    setDeclinedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    declineMutation.mutate([id], {
      onSuccess: (res) => toast.success(res.message),
      onError: (e) => toast.error(e.message),
    });
  };

  const onApprove = (id: string) => {
    setDeclinedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const onApproveAll = () => setDeclinedIds(new Set());

  const onContinueWithApproved = () => {
    const approvedIds = companyRows
      .map((c) => c.id)
      .filter((id) => !declinedIds.has(id));
    if (approvedIds.length === 0) {
      toast.error("Approve at least one company to continue.");
      return;
    }
    approveCompanies.mutate(approvedIds, {
      onSuccess: (res) => {
        toast.success(res.message);
        setDeclinedIds(new Set());
      },
      onError: (e) => toast.error(e.message),
    });
  };

  const onRefreshNow = () => {
    // Belt-and-braces: the backend also rejects stopped campaigns, but never
    // fire the request from a stopped card.
    if (campaign?.status === "stopped" || campaign?.status === "cancelled") {
      toast.error("This campaign is stopped — refresh is disabled. Use Launch to run a copy.");
      return;
    }
    refreshCampaign.mutate(undefined, {
      onSuccess: (res) => toast.success(res.message),
      onError: (e) => toast.error(e.message),
    });
  };

  const onApprovePending = (id: string) => {
    approveRefreshCandidates.mutate([id], {
      onSuccess: (res) => toast.success(res.message),
      onError: (e) => toast.error(e.message),
    });
  };

  const onApproveAllPending = () => {
    const ids = pendingCompanyRows.map((c) => c.id);
    if (ids.length === 0) return;
    approveRefreshCandidates.mutate(ids, {
      onSuccess: (res) => toast.success(res.message),
      onError: (e) => toast.error(e.message),
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-4 animate-fade-up">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (isError || !campaign) {
    return (
      <Card className="p-8">
        <EmptyState
          icon={<AlertCircle className="h-8 w-8" />}
          title="Campaign not found"
          description="It may have been created in another workspace, or the orchestrator is unreachable."
          action={
            <Link to="/campaigns">
              <Button>
                <ArrowLeft className="h-4 w-4" /> Back to campaigns
              </Button>
            </Link>
          }
        />
      </Card>
    );
  }

  const tone = statusTone(campaign.status);
  const icpFeatures = (campaign.icp_features ?? {}) as Record<string, unknown>;

  // Revenue is rendered in the currency the user wrote in their brief (the
  // extractor captures it as an ISO code); $ is the safe default when the
  // brief never says.
  const CURRENCY_SYMBOLS: Record<string, string> = {
    EUR: "€", USD: "$", GBP: "£", INR: "₹", JPY: "¥", CNY: "CN¥",
    KRW: "₩", SGD: "S$", AUD: "A$", CAD: "C$", NZD: "NZ$", CHF: "CHF",
    SEK: "kr", NOK: "kr", DKK: "kr", BRL: "R$", MXN: "MX$", ZAR: "R",
    PLN: "zł", TRY: "₺", RUB: "₽", THB: "฿", VND: "₫", ILS: "₪",
    AED: "AED", SAR: "SAR", HKD: "HK$", TWD: "NT$", PHP: "₱",
    MYR: "RM", IDR: "Rp", CZK: "Kč", HUF: "Ft", RON: "lei",
    BGN: "лв", UAH: "₴", ISK: "kr", NGN: "₦", KES: "KSh", GHS: "GH₵",
    MAD: "MAD", EGP: "E£", PKR: "₨", BDT: "৳", LKR: "Rs", NPR: "₨",
    VES: "Bs", ARS: "AR$", CLP: "CL$", COP: "CO$", PEN: "S/",
    UYU: "$U", MOP: "MOP$", QAR: "QAR", KWD: "KD",
    BHD: "BD", OMR: "OMR", JOD: "JD", TND: "DT", DZD: "DA",
    XOF: "CFA", XAF: "FCFA", RWF: "FRw", TZS: "TSh", UGX: "USh",
    AFN: "؋",
  };
  const moneySymbol = (currency: unknown): string =>
    CURRENCY_SYMBOLS[String(currency ?? "").toUpperCase()] ?? "$";
  const fmtMoney = (v: number, symbol = "$"): string => {
    const abs = Math.abs(v);
    if (abs >= 1e9) return `${symbol}${(v / 1e9).toFixed(0)}B`;
    if (abs >= 1e6) return `${symbol}${(v / 1e6).toFixed(0)}M`;
    return `${symbol}${Math.round(v).toLocaleString()}`;
  };
  const fmtMoneyRange = (
    r: { min?: number | null; max?: number | null } | null | undefined,
    symbol = "$",
  ): string | null => {
    if (!r) return null;
    if (r.min != null && r.max != null)
      return `${fmtMoney(r.min, symbol)}–${fmtMoney(r.max, symbol)}`;
    if (r.min != null) return `${fmtMoney(r.min, symbol)}+`;
    if (r.max != null) return `up to ${fmtMoney(r.max, symbol)}`;
    return null;
  };
  const fmtSizeRange = (
    s: { min?: number | null; max?: number | null } | null | undefined,
  ): string | null => {
    if (!s) return null;
    if (s.min != null && s.max != null) return `${s.min}–${s.max} employees`;
    if (s.min != null) return `${s.min}+ employees`;
    if (s.max != null) return `up to ${s.max} employees`;
    return null;
  };
  const fmtCities = (cities: unknown): string | null => {
    if (!Array.isArray(cities) || cities.length === 0) return null;
    return (cities as Array<string | { city?: string; country?: string }>)
      .map((c) => {
        if (typeof c === "string") return c;
        return [c.city, c.country].filter(Boolean).join(", ");
      })
      .join(" · ");
  };
  const fmtExcludes = (ex: unknown): string | null => {
    if (!ex || typeof ex !== "object") return null;
    const o = ex as Record<string, unknown>;
    const parts: string[] = [];
    if (Array.isArray(o.industries) && (o.industries as string[]).length) {
      parts.push(`industry: ${(o.industries as string[]).join(", ")}`);
    }
    if (Array.isArray(o.keywords) && (o.keywords as string[]).length) {
      parts.push(`keywords: ${(o.keywords as string[]).join(", ")}`);
    }
    if (o.company_size && typeof o.company_size === "object") {
      const es = fmtSizeRange(o.company_size as { min?: number | null; max?: number | null });
      if (es) parts.push(`size: ${es}`);
    }
    return parts.length ? parts.join(" · ") : null;
  };

  const icpGrid: Array<[string, unknown]> = [
    ["Industries", icpFeatures.industries],
    ["Countries", icpFeatures.target_countries],
    ["Continents", icpFeatures.target_continents],
    ["Roles", icpFeatures.target_roles],
    ["Company size", fmtSizeRange(icpFeatures.company_size as { min?: number | null; max?: number | null })],
    [
      "Revenue",
      fmtMoneyRange(
        icpFeatures.revenue_range as { min?: number | null; max?: number | null },
        moneySymbol(icpFeatures.currency),
      ),
    ],
    ["Preferred cities", fmtCities(icpFeatures.target_cities)],
    ["Growth stage", icpFeatures.growth_stage],
    ["Funding stage", icpFeatures.funding_stage],
    ["Tech stack", icpFeatures.tech_stack],
    ["Excludes", fmtExcludes(icpFeatures.exclude)],
  ];

  const obsStats: Array<{ label: string; value: string }> = observability
    ? [
        { label: "Total tokens", value: formatNumber(observability.total_tokens as number) },
        { label: "LLM calls", value: formatNumber(observability.total_llm_calls as number) },
        { label: "Avg latency", value: `${Math.round((observability.avg_latency_ms as number) ?? 0)} ms` },
        { label: "Success rate", value: `${Math.round(((observability.success_rate as number) ?? 0) * 100)}%` },
      ]
    : [];

  return (
    <div className="space-y-6 animate-fade-up">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link to="/campaigns" className="inline-flex items-center gap-1 text-[11px] text-mist hover:text-white">
            <ArrowLeft className="h-3 w-3" /> Campaigns
          </Link>
          <div className="mt-1.5 flex flex-wrap items-center gap-3">
            <h2 className="truncate text-lg font-bold text-white">
              {campaign.campaign_name || (campaign.raw_icp ? campaign.raw_icp.split("\n")[0].slice(0, 80) : "Campaign")}
            </h2>
            <Badge tone={tone.tone === "neutral" ? "neutral" : tone.tone} dot>
              {campaign.status}
            </Badge>
            <Badge tone="neutral">{campaign.stage.replace(/_/g, " ")}</Badge>
          </div>
          <p className="mt-1.5 font-mono text-[11px] text-slate-500">
            {campaign.id} · {timeAgo(campaign.created_at)} · user {campaign.user_id}
          </p>
        </div>

        {running && (
          <div className="flex items-center gap-2 rounded-xl border border-accent/25 bg-accent/10 px-4 py-2.5">
            <PulseBar className="w-24" />
            <span className="text-xs font-semibold text-accent-soft">Phase A in progress</span>
          </div>
        )}
      </div>

      {campaign.error && (
        <Alert title="Pipeline error" tone="danger">
          {campaign.error}
        </Alert>
      )}

      <Tabs items={tabs} active={tab} onChange={(k) => setTab(k as TabKey)} />

      {/* ── Pipeline tab ── */}
      {tab === "pipeline" && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="p-5 lg:col-span-1">
            <StageStepper campaign={campaign} />
          </Card>

          <div className="space-y-6 lg:col-span-2">
            <Card>
              <CardHeader
                icon={<Sparkles className="h-4 w-4" />}
                title="Extracted ICP features"
                subtitle="Structured from your brief by the qualifier"
              />
              <div className="p-5 pt-3">
                {Object.keys(icpFeatures).length === 0 ? (
                  <p className="py-4 text-center text-xs text-mist">
                    ICP not extracted yet — features appear once the pipeline reaches this stage.
                  </p>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {icpGrid
                      .filter(([, v]) => v != null && (Array.isArray(v) ? v.length > 0 : String(v).length > 0))
                      .map(([label, v]) => (
                        <div key={label} className="rounded-lg border border-line bg-ink-900/60 p-2.5">
                          <p className="text-[10px] uppercase tracking-wider text-mist">{label}</p>
                          <p className="mt-0.5 text-xs font-medium text-slate-200">
                            {Array.isArray(v) ? (v as string[]).join(", ") : String(v)}
                          </p>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </Card>

            <Card>
              <CardHeader
                icon={<Activity className="h-4 w-4" />}
                title="Pipeline activity"
                subtitle="Artifacts recorded at every stage"
              />
              <div className="p-5 pt-3">
                {activity.length === 0 ? (
                  <p className="py-4 text-center text-xs text-mist">No activity recorded yet.</p>
                ) : (
                  <ol className="space-y-0">
                    {activity.map((a, i) => (
                      <li key={i} className="relative flex gap-3 pb-4 last:pb-0">
                        {i < activity.length - 1 && (
                          <span className="absolute left-[7px] top-5 h-[calc(100%-1.25rem)] w-px bg-white/8" />
                        )}
                        <span
                          className={cn(
                            "relative z-10 mt-1.5 h-3.5 w-3.5 shrink-0 rounded-full border-2",
                            a.tone === "ok" && "border-emerald-400 bg-emerald-500/30",
                            a.tone === "accent" && "border-accent bg-accent/40",
                            a.tone === "warn" && "border-amber-400 bg-amber-500/30",
                            a.tone === "danger" && "border-rose-400 bg-rose-500/30",
                            a.tone === "neutral" && "border-slate-500 bg-slate-500/30",
                          )}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-semibold text-slate-200">{a.title}</span>
                            <span className="ml-auto text-[10px] text-slate-500">{formatTime(a.created_at)}</span>
                          </div>
                          {a.detail && <p className="mt-0.5 text-[11px] text-mist">{a.detail}</p>}
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* ── Companies tab ── */}
      {tab === "companies" && (
        <div>
          {companyRows.length === 0 ? (
            <EmptyState
              icon={<Building2 className="h-8 w-8" />}
              title="No scored companies yet"
              description={running ? "The pipeline is still working — scored companies will appear here." : "Run a campaign to see firmographic & intent scores."}
            />
          ) : (
            <div>
              {refreshableStage && (
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-ink-800 p-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <RefreshCw className="h-4 w-4 text-accent-soft" />
                      <p className="text-sm font-semibold text-slate-100">
                        Campaign refresh
                      </p>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-mist">
                      {refreshFreq === "off"
                        ? "Auto-refresh is off. Refresh re-fetches intent for your approved companies and discovers new companies under this campaign's rules (ICP snapshot, blacklist, weights) — changing the ICP requires a new campaign."
                        : `Auto-refresh is set to ${refreshFreq === "daily" ? "daily" : "weekly"}. Each pass re-fetches intent for your approved companies and discovers new companies under this campaign's rules — changing the ICP requires a new campaign.`}{" "}
                      {lastRefreshedAt
                        ? `Last refreshed ${timeAgo(lastRefreshedAt)}.`
                        : "Never refreshed yet."}
                    </p>
                    {refreshInProgress && (
                      <p className="mt-1.5 inline-flex items-center gap-2 text-xs font-medium text-accent-soft">
                        <PulseBar className="w-16" />
                        Refreshing — re-fetching intent &amp; discovering new
                        companies…
                      </p>
                    )}
                    {refreshSummary && !refreshInProgress && (
                      <p
                        className={cn(
                          "mt-2 rounded-md border px-2.5 py-2 text-[11px] leading-relaxed",
                          refreshSummary.payload.status === "noop"
                            ? "border-line/70 bg-ink-900/60 text-mist"
                            : refreshSummary.payload.error ||
                                refreshSummary.payload.outreach_error
                              ? "border-rose-500/30 bg-rose-500/5 text-rose-200/90"
                              : "border-line/70 bg-ink-900/60 text-mist",
                        )}
                      >
                        <span className="font-semibold text-slate-200">
                          Last refresh
                        </span>{" "}
                        ({timeAgo(refreshSummary.created_at)}) —{" "}
                        {describeRefreshResult(refreshSummary.payload)}
                      </p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={refreshCampaign.isPending || refreshInProgress}
                    onClick={onRefreshNow}
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> Refresh now
                  </Button>
                </div>
              )}
              {icp && (
                <div className="mb-4 rounded-lg border border-line bg-ink-800 p-4">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-accent-soft" />
                    <p className="text-sm font-semibold text-slate-100">
                      ICP understood by the engine
                    </p>
                  </div>
                  <p className="mt-0.5 text-xs text-mist">
                    This is how the brief was parsed — verify it before approving
                    companies.
                  </p>
                  <div className="mt-3 grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-mist">
                        Industries
                      </p>
                      <p className="mt-1 font-medium text-slate-200">
                        {icp.industries.length
                          ? icp.industries.join(", ")
                          : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-mist">
                        Countries
                      </p>
                      <p className="mt-1 font-medium text-slate-200">
                        {icp.target_countries.length
                          ? icp.target_countries.join(", ")
                          : "—"}
                      </p>
                    </div>
                    {icp.target_continents.length > 0 && (
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-mist">
                          Continents
                        </p>
                        <p className="mt-1 font-medium text-slate-200">
                          {icp.target_continents.join(", ")}
                        </p>
                      </div>
                    )}
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-mist">
                        Company size
                      </p>
                      <p className="mt-1 font-medium text-slate-200">
                        {icp.company_size.min != null || icp.company_size.max != null
                          ? `${icp.company_size.min ?? 0}–${icp.company_size.max ?? "∞"} employees`
                          : "—"}
                      </p>
                    </div>
                    {icp.revenue_range.min != null || icp.revenue_range.max != null ? (
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-mist">
                          Revenue
                        </p>
                        <p className="mt-1 font-medium text-slate-200">
                          {fmtMoneyRange(icp.revenue_range, moneySymbol(icp.currency))}
                        </p>
                      </div>
                    ) : null}
                    {icp.target_cities.length > 0 && (
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-mist">
                          Preferred cities
                        </p>
                        <p className="mt-1 font-medium text-slate-200">
                          {fmtCities(icp.target_cities)}
                        </p>
                      </div>
                    )}
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-mist">
                        Target roles
                      </p>
                      <p className="mt-1 font-medium text-slate-200">
                        {icp.target_roles.length
                          ? icp.target_roles.join(", ")
                          : "—"}
                      </p>
                    </div>
                    {(icp.exclude_industries.length > 0 ||
                      icp.exclude_keywords.length > 0 ||
                      icp.exclude_size.min != null ||
                      icp.exclude_size.max != null) && (
                      <div className="sm:col-span-2 lg:col-span-4">
                        <p className="text-[10px] uppercase tracking-wider text-mist">
                          Excludes
                        </p>
                        <p className="mt-1 font-medium text-amber-300/90">
                          {[
                            ...icp.exclude_industries.map((e) => `industry: ${e}`),
                            ...icp.exclude_keywords.map((e) => `keyword: ${e}`),
                            ...(icp.exclude_size.min != null || icp.exclude_size.max != null
                              ? [
                                  `size: ${fmtSizeRange({
                                    min: icp.exclude_size.min,
                                    max: icp.exclude_size.max,
                                  })}`,
                                ]
                              : []),
                          ].join(" · ") || "—"}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
              {awaitingCompanyApproval && (
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-accent/20 bg-accent/5 p-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-100">
                      Approve companies before persona discovery
                    </p>
                    <p className="mt-0.5 text-xs text-mist">
                      Declined companies are skipped — personas are only fetched
                      for the approved ones.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      onClick={onApproveAll}
                      disabled={declinedIds.size === 0}
                    >
                      <Undo2 className="h-3.5 w-3.5" /> Reset
                    </Button>
                    <Button
                      variant="primary"
                      loading={approveCompanies.isPending}
                      onClick={onContinueWithApproved}
                    >
                      <Check className="h-4 w-4" />
                      Continue with {companyRows.length - declinedIds.size}
                    </Button>
                  </div>
                </div>
              )}
              {pendingCompanyRows.length > 0 && (
                <div className="mb-4 rounded-lg border border-amber-400/25 bg-amber-400/5 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-100">
                        {pendingCompanyRows.length} new candidate
                        {pendingCompanyRows.length > 1 ? "s" : ""} from refresh
                      </p>
                      <p className="mt-0.5 text-xs text-mist">
                        Discovered under this campaign's own rules — approve to
                        fetch personas and build packages for them.
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="primary"
                      loading={approveRefreshCandidates.isPending}
                      onClick={onApproveAllPending}
                    >
                      <Check className="h-3.5 w-3.5" /> Approve{" "}
                      {pendingCompanyRows.length > 1 ? "all" : ""}
                    </Button>
                  </div>
                  <div className="mt-3 grid gap-4 md:grid-cols-2">
                    {pendingCompanyRows.map((c) => (
                      <CompanyCard
                        key={c.id}
                        company={c}
                        onDecline={onDecline}
                        onApprove={onApprovePending}
                        busy={
                          declineMutation.isPending ||
                          approveRefreshCandidates.isPending
                        }
                      />
                    ))}
                  </div>
                </div>
              )}
              <div className="grid gap-4 md:grid-cols-2">
                {approvedCompanyRows.map((c) => (
                  <CompanyCard
                    key={c.id}
                    company={c}
                    onDecline={onDecline}
                    onApprove={awaitingCompanyApproval ? onApprove : undefined}
                    busy={declineMutation.isPending || approveCompanies.isPending}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Personas tab ── */}
      {tab === "personas" && (
        <div>
          {personaRows.length === 0 ? (
            <EmptyState
              icon={<Users className="h-8 w-8" />}
              title="No scored personas yet"
              description={running ? "Personas are sourced & ranked after companies are scored." : "Run a campaign to see persona scores."}
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {personaRows.map((p) => {
                const leadId = leadIdByPersona.get(p.apollo_id) ?? leadIdByPersona.get(p.name);
                const started = !!leadId && startedLeadIds.has(leadId);
                // Reachability gate: only leads with a usable channel (email or
                // LinkedIn) get the Start button — an unreachable lead would
                // dead-end at sequence generation with "no reachable channel".
                // When unreachable, we still explain WHY outreach didn't start
                // (it was attempted and skipped, not ignored).
                const reachable = !!p.email || !!p.linkedin_url;
                const skippedNote = reachable
                  ? undefined
                  : leadId
                    ? "Outreach was attempted but skipped — no usable email or LinkedIn found on this person."
                    : "No email or LinkedIn found on this person yet — outreach can't start until one is available.";
                return (
                  <PersonaCard
                    key={p.id}
                    persona={p}
                    selected={selectedPersonaIds.has(p.apollo_id) || selectedPersonaIds.has(p.name)}
                    leadId={leadId}
                    outreachStarted={started}
                    skippedNote={skippedNote}
                    onStartOutreach={
                      reachable && leadId
                        ? (lid) => onStartPersonaOutreach(lid, p.name)
                        : undefined
                    }
                    busy={startOutreach.isPending || restartOutreachLead.isPending}
                  />
                );
              })}

              <Modal
                open={!!restartLead}
                onClose={() => setRestartLead(null)}
                title="This prospect already has an outreach sequence"
              >
                <p className="text-sm leading-relaxed text-mist">
                  {restartLead?.name} already has an active (or past) outreach
                  thread. What do you want to do?
                </p>
                <div className="mt-4 flex flex-col gap-2">
                  <Button
                    variant="primary"
                    loading={restartOutreachLead.isPending}
                    onClick={() => onRestartDecision(true)}
                  >
                    Stop the old one and start a new sequence
                  </Button>
                  <Button
                    variant="secondary"
                    loading={restartOutreachLead.isPending}
                    onClick={() => onRestartDecision(false)}
                  >
                    Run a new one anyway (old one keeps running)
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => setRestartLead(null)}
                  >
                    Cancel — don't do anything
                  </Button>
                </div>
              </Modal>
            </div>
          )}
        </div>
      )}

      {/* ── Outreach tab ── */}
      {tab === "outreach" && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">Phase B · Sequences & approvals</h3>
              <p className="mt-0.5 text-xs text-mist">
                {threads.length === 0
                  ? "Start outreach to generate a sequence for each lead package."
                  : `${threads.length} thread${threads.length > 1 ? "s" : ""} · ${awaitingCount} awaiting approval`}
              </p>
            </div>
            <div className="flex gap-2">
              {threads.length > 0 && (
                <Button
                  variant="ghost"
                  loading={reply.isPending}
                  onClick={() =>
                    reply.mutate(undefined, {
                      onSuccess: (r) => toast.success(String(r.message ?? "Reply recorded")),
                      onError: (e) => toast.error(e.message),
                    })
                  }
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Mark all replied / stop
                </Button>
              )}
              {detail?.packages && detail.packages.length > 0 && (
                <Button
                  variant="primary"
                  loading={startOutreach.isPending}
                  onClick={() =>
                    startOutreach.mutate(undefined, {
                      onSuccess: (r) => toast.success(r.message || "Outreach started in background"),
                      onError: (e) => toast.error(e.message),
                    })
                  }
                >
                  <Play className="h-4 w-4" /> Start outreach
                </Button>
              )}
            </div>
          </div>

          {detail?.packages && detail.packages.length > 0 && (
            <Card className="p-4">
              <div className="flex items-start gap-3">
                <PackageCheck className="mt-0.5 h-4 w-4 shrink-0 text-ok" />
                <div className="min-w-0 flex-1 text-xs text-mist">
                  <span className="font-semibold text-slate-200">{detail.packages.length} lead package(s)</span> ready
                  {" "}across{" "}
                  <span className="font-semibold text-slate-200">{leadGroups.length}</span>{" "}
                  {leadGroups.length === 1 ? "company" : "companies"}
                  <div className="mt-2.5 space-y-2">
                    {leadGroups.map(({ companyName, leads }) => (
                      <div
                        key={companyName}
                        className="rounded-lg border border-line bg-ink-900/60 p-2.5"
                      >
                        <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-mist">
                          <Building2 className="h-3 w-3" /> {companyName}
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {leads.map((lead) =>
                            lead.personaName ? (
                              <span
                                key={lead.key}
                                className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[11px] text-slate-200"
                              >
                                {lead.personaName}
                                {lead.combined != null && (
                                  <span className="font-mono text-[10px] text-accent-soft">
                                    {Math.round(lead.combined)}
                                  </span>
                                )}
                              </span>
                            ) : (
                              <span
                                key={lead.key}
                                title={
                                  outreachAttempted
                                    ? "Outreach was attempted but skipped — no persona with contact info (email/LinkedIn) was found for this company."
                                    : "No persona with contact info (email/LinkedIn) was found for this company — outreach can't start until one is available."
                                }
                                className="inline-flex items-center gap-1 rounded-full border border-warn/30 bg-warn/10 px-2 py-0.5 text-[10px] italic text-amber-200/80"
                              >
                                <AlertCircle className="h-3 w-3 shrink-0" />
                                {outreachAttempted
                                  ? "No persona selected — outreach attempted, skipped (no contact info)"
                                  : "No persona selected — no contact info (email/LinkedIn)"}
                              </span>
                            ),
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          )}

          {threads.length === 0 ? (
            <EmptyState
              icon={<Send className="h-8 w-8" />}
              title="No outreach threads"
              description={
                detail?.packages?.length
                  ? "Phase A finished — hit “Start outreach” to generate sequences (or enable auto-start in Configure)."
                  : "Phase A must complete first — sequences are generated from the lead packages it produces."
              }
              action={
                detail?.packages?.length ? (
                  <Button
                    variant="primary"
                    loading={startOutreach.isPending}
                    onClick={() => startOutreach.mutate(undefined)}
                  >
                    <Play className="h-4 w-4" /> Start outreach
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="space-y-8">
              {[
                {
                  key: "validation" as const,
                  label: "Message validation",
                  hint: "Sequences that need your decision",
                  tone: "warn" as const,
                },
                {
                  key: "awaiting" as const,
                  label: "Awaiting approval",
                  hint: "Sequences paused for your review",
                  tone: "accent" as const,
                },
                {
                  key: "running" as const,
                  label: "Running",
                  hint: "Sequences live on schedule",
                  tone: "ok" as const,
                },
                {
                  key: "finished" as const,
                  label: "Finished",
                  hint: "Completed, replied, or failed",
                  tone: "neutral" as const,
                },
                {
                  key: "skipped" as const,
                  label: "Skipped",
                  hint: "Outreach was attempted but couldn't start — no email or LinkedIn on the persona",
                  tone: "warn" as const,
                },
                {
                  key: "stopped" as const,
                  label: "Stopped / deleted",
                  hint: "Kept in the record, no longer active",
                  tone: "neutral" as const,
                },
              ].map(({ key, label, hint, tone }) => {
                const items = threadGroups[key];
                if (items.length === 0) return null;
                return (
                  <section key={key}>
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                        {label}
                      </h4>
                      <Badge tone={tone}>{items.length}</Badge>
                      <span className="text-[11px] text-mist">{hint}</span>
                    </div>
                    <div className="space-y-5">
                      {groupThreadsByCompany(items).map(({ company, threads: groupThreads }) => (
                        <div key={company} className="space-y-3">
                          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-mist">
                            <Building2 className="h-3 w-3" /> {company}
                            <span className="font-normal text-slate-500">
                              · {groupThreads.length} thread{groupThreads.length > 1 ? "s" : ""}
                            </span>
                          </p>
                          <div className="space-y-3">
                            {groupThreads.map((t) => (
                              <ThreadReview
                                key={t.id}
                                campaignId={campaignId}
                                thread={t}
                                detail={detail}
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          )}

          {/* Observability */}
          {observability && Object.keys(observability).length > 0 && (
            <Card>
              <CardHeader
                icon={<Activity className="h-4 w-4" />}
                title="LLM observability"
                subtitle="Tokens & calls across sequence + message generation"
              />
              <div className="grid grid-cols-2 gap-4 p-5 pt-3 sm:grid-cols-4">
                {obsStats.map((s) => (
                  <div key={s.label}>
                    <p className="text-[10px] uppercase tracking-wider text-mist">{s.label}</p>
                    <p className="mt-0.5 font-mono text-sm font-semibold text-slate-100">{s.value}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Audit trail */}
          <Card>
            <CardHeader
              icon={<History className="h-4 w-4" />}
              title="Audit trail"
              subtitle="Every human & system decision, append-only"
            />
            <div className="p-5 pt-3">
              <AuditFeed events={audit} />
            </div>
          </Card>
        </div>
      )}

      {/* ── Usage tab ── */}
      {tab === "usage" && (
        <div className="space-y-6">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">Usage & credits</h3>
            <p className="mt-0.5 text-xs text-mist">
              Cumulative since the campaign started — Phase A, every refresh pass, and
              outreach (message + sequence generation) keep incrementing these numbers.
            </p>
          </div>

          {usageQuery.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : usageQuery.isError ? (
            <Card className="p-6">
              <p className="text-sm text-rose-300">Couldn't load usage data.</p>
            </Card>
          ) : usageQuery.data ? (
            <>
              {/* Apollo credits */}
              <Card>
                <CardHeader
                  icon={<Gauge className="h-4 w-4" />}
                  title="Apollo credits consumed"
                  subtitle="Lead, direct-dial & AI credits since campaign start"
                />
                <div className="grid grid-cols-3 gap-4 p-5 pt-3">
                  {[
                    { label: "Lead credits", key: "lead_credits_consumed" },
                    { label: "Direct dial", key: "direct_dial_credits_consumed" },
                    { label: "AI credits", key: "ai_credits_consumed" },
                  ].map(({ label, key }) => (
                    <div key={key}>
                      <p className="text-[10px] uppercase tracking-wider text-mist">{label}</p>
                      <p className="mt-0.5 font-mono text-sm font-semibold text-slate-100">
                        {formatNumber(
                          (usageQuery.data.apollo_credits as Record<string, number>)[key] ?? 0,
                        )}
                      </p>
                    </div>
                  ))}
                </div>
              </Card>

              {/* LLM tokens per module */}
              <Card>
                <CardHeader
                  icon={<Activity className="h-4 w-4" />}
                  title="LLM tokens by module"
                  subtitle="Every move — sourcer, qualifier, message gen, sequence gen, refreshes"
                />
                <div className="overflow-x-auto p-5 pt-3">
                  <table className="w-full min-w-[480px] text-left text-xs">
                    <thead>
                      <tr className="border-b border-line text-[10px] uppercase tracking-wider text-mist">
                        <th className="pb-2 pr-4 font-medium">Module</th>
                        <th className="pb-2 pr-4 text-right font-medium">Tokens</th>
                        <th className="pb-2 pr-4 text-right font-medium">In</th>
                        <th className="pb-2 pr-4 text-right font-medium">Out</th>
                        <th className="pb-2 text-right font-medium">LLM calls</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(usageQuery.data.modules ?? {}).map(([name, m]) => (
                        <tr key={name} className="border-b border-line/50">
                          <td className="py-2 pr-4 font-mono text-[11px] text-slate-300">{name}</td>
                          <td className="py-2 pr-4 text-right font-mono text-slate-100">{formatNumber(m.total_tokens)}</td>
                          <td className="py-2 pr-4 text-right font-mono text-mist">{formatNumber(m.tokens_in)}</td>
                          <td className="py-2 pr-4 text-right font-mono text-mist">{formatNumber(m.tokens_out)}</td>
                          <td className="py-2 text-right font-mono text-mist">{formatNumber(m.total_llm_calls)}</td>
                        </tr>
                      ))}
                      {Object.keys(usageQuery.data.modules ?? {}).length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-4 text-center text-mist">
                            No usage recorded yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-line">
                        <td className="py-2 pr-4 font-semibold text-slate-200">Total</td>
                        <td className="py-2 pr-4 text-right font-mono font-semibold text-slate-100">
                          {formatNumber(usageQuery.data.totals?.total_tokens ?? 0)}
                        </td>
                        <td className="py-2 pr-4 text-right font-mono text-mist">
                          {formatNumber(usageQuery.data.totals?.tokens_in ?? 0)}
                        </td>
                        <td className="py-2 pr-4 text-right font-mono text-mist">
                          {formatNumber(usageQuery.data.totals?.tokens_out ?? 0)}
                        </td>
                        <td className="py-2 text-right font-mono text-mist">
                          {formatNumber(usageQuery.data.totals?.total_llm_calls ?? 0)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </Card>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
