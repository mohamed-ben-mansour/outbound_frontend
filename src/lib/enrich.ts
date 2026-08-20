import type {
  Artifact,
  CampaignDetail,
  OutreachStep,
  RankedCompany,
  RankedPersona,
  WorkflowState,
  WorkflowStep,
} from "./types";

/**
 * The raw detail endpoint returns artifacts from every pipeline stage.
 * These helpers merge that raw data into rich rows for the UI (score
 * breakdowns, industries, intent summaries…) without extra API calls.
 */

// ── Companies ─────────────────────────────────────────────

export interface CompanyRow {
  id: string;
  apollo_id: string;
  name: string;
  status: string;
  score: number | null;
  industry?: string;
  size?: number | null;
  city?: string;
  country?: string;
  domain?: string;
  metrics?: {
    industry_score?: number;
    size_score?: number;
    revenue_score?: number;
    tech_stack_score?: number;
    // Clearbit-style split: fit (firmographic, stable) and intent (moves)
    // are shown as separate headline numbers, never blended into one.
    firmographic_score?: number;
    intent_score?: number;
    // "unknown" = no signals found → show "—" instead of a misleading 0.
    intent_confidence?: string;
    [k: string]: unknown;
  };
  intent_summary?: string;
  signals_count?: number;
  personas_count: number;
  /** Outreach state derived from threads (null = never contacted). */
  outreach_status?: string | null;
  /** True when contacted before and re-entered on fresh intent signals. */
  reengagement?: boolean;
}

// ── ICP echo-back (post-parse review) ──────────────────────

export interface ParsedIcp {
  industries: string[];
  target_countries: string[];
  target_continents: string[];
  target_roles: string[];
  company_size: { min: number | null; max: number | null };
  revenue_range: { min: number | null; max: number | null };
  /** Currency of the revenue figures: "EUR" | "USD" | null. */
  currency?: string | null;
  target_cities: Array<{ city?: string; country?: string } | string>;
  tech_stack: string[];
  growth_stage: string | null;
  funding_stage: string | null;
  exclude_industries: string[];
  exclude_keywords: string[];
  exclude_size: { min: number | null; max: number | null };
}

/**
 * The structured ICP the qualifier's LLM extracted, from the icp_extract
 * artifact. Shown back to the user BEFORE company approval so a loose parse
 * (dropped "Fintech", invented "Software"…) is caught with eyes, not in the
 * results 10 minutes later.
 */
export function parsedIcp(
  detail: CampaignDetail | null | undefined,
): ParsedIcp | null {
  if (!detail) return null;
  const artifact = (detail.artifacts ?? []).find((a) => a.stage === "icp_extract");
  if (!artifact) return null;
  const filters = (artifact.payload?.icp_filters ?? {}) as Record<string, unknown>;
  const size = (filters.company_size ?? {}) as Record<string, unknown>;
  const revenue = (filters.revenue_range ?? {}) as Record<string, unknown>;
  const exclude = (filters.exclude ?? {}) as Record<string, unknown>;
  const excludeSize = (exclude.company_size ?? {}) as Record<string, unknown>;
  return {
    industries: Array.isArray(filters.industries)
      ? (filters.industries as string[])
      : [],
    target_countries: Array.isArray(filters.target_countries)
      ? (filters.target_countries as string[])
      : [],
    target_continents: Array.isArray(filters.target_continents)
      ? (filters.target_continents as string[])
      : [],
    target_roles: Array.isArray(filters.target_roles)
      ? (filters.target_roles as string[])
      : [],
    company_size: {
      min: typeof size.min === "number" ? size.min : null,
      max: typeof size.max === "number" ? size.max : null,
    },
    revenue_range: {
      min: typeof revenue.min === "number" ? revenue.min : null,
      max: typeof revenue.max === "number" ? revenue.max : null,
    },
    currency: typeof filters.currency === "string" ? filters.currency : null,
    target_cities: Array.isArray(filters.target_cities)
      ? (filters.target_cities as ParsedIcp["target_cities"])
      : [],
    tech_stack: Array.isArray(filters.tech_stack)
      ? (filters.tech_stack as string[])
      : [],
    growth_stage:
      typeof filters.growth_stage === "string" ? filters.growth_stage : null,
    funding_stage:
      typeof filters.funding_stage === "string" ? filters.funding_stage : null,
    exclude_industries: Array.isArray(exclude.industries)
      ? (exclude.industries as string[])
      : [],
    exclude_keywords: Array.isArray(exclude.keywords)
      ? (exclude.keywords as string[])
      : [],
    exclude_size: {
      min: typeof excludeSize.min === "number" ? excludeSize.min : null,
      max: typeof excludeSize.max === "number" ? excludeSize.max : null,
    },
  };
}


// ── Score explanation (the (i) tooltip on company cards) ──────

const FEATURE_LABELS: Record<string, string> = {
  industry_match: "Industry",
  size_match: "Size",
  revenue_match: "Revenue",
  tech_stack_match: "Tech stack",
  location_match: "Location",
  stage_match: "Funding stage",
  growth_stage_match: "Growth stage",
};

function _featureLine(feature: string, info: Record<string, unknown>): string {
  const score = typeof info.score === "number" ? Math.round(info.score) : null;
  const q = info.match_quality;
  const quality =
    q === "exact" ? "exact match" : q === "semantic" ? "semantic match" : q === "miss" ? "miss" : null;
  const label = FEATURE_LABELS[feature] ?? feature.replace(/_match$/, "").replace(/_/g, " ");
  return score == null ? `${label}: —` : `${label} ${score}${quality ? ` (${quality})` : ""}`;
}

/**
 * Human-readable "why" behind the two headline numbers — fed to the (i)
 * tooltip: what made this company a fit to the ICP, and what its intent is.
 */
export function companyScoreExplanation(
  metrics: CompanyRow["metrics"] | undefined,
): { fit: string; intent: string } {
  if (!metrics) {
    return { fit: "No scoring breakdown available yet.", intent: "" };
  }

  const breakdown = (metrics.breakdown ?? {}) as Record<
    string,
    Record<string, unknown>
  >;
  const lines = Object.keys(breakdown).map((f) => _featureLine(f, breakdown[f]));
  const fit = lines.length
    ? `Fit = how well the company matches your ICP (industry, size, revenue, tech, location). Per feature: ${lines.join(" · ")}.`
    : "Fit = how well the company matches your ICP. No feature breakdown available.";

  const confidence = metrics.intent_confidence;
  const reasoning =
    typeof metrics.intent_reasoning === "string" ? metrics.intent_reasoning : "";
  if (confidence === "unknown") {
    return {
      fit,
      intent:
        "No intent signals found for this company (no matching hiring, news or LinkedIn activity) — intent is unknown and is not counted as a positive or negative signal.",
    };
  }
  if (confidence === "skipped") {
    return {
      fit,
      intent: "Intent was not evaluated (company fit is below the scoring threshold).",
    };
  }
  // Near-miss: fit below the passing bar but not discarded — the pipeline
  // does nothing for it (no personas/outreach) and re-scores it on the next
  // refresh cycle. Phrased for the user — no internal stage names.
  if (metrics.tier === "Pending") {
    const fitVal =
      typeof metrics.firmographic_score === "number"
        ? Math.round(metrics.firmographic_score)
        : null;
    const close =
      fitVal != null && fitVal >= 40
        ? "This company is close to your profile — we'll re-score it automatically on the next refresh cycle, and it will start getting outreach once it crosses the fit bar."
        : "This company is below the fit bar, so we're not targeting it for outreach right now — we'll re-check it on the next refresh cycle.";
    return { fit: `${fit}\n\n${close}`, intent: reasoning || "" };
  }
  return { fit, intent: reasoning || "Intent scoring not yet available." };
}


export function buildCompanyRows(
  detail: CampaignDetail | null | undefined,
  ranked: RankedCompany[] | null | undefined,
): CompanyRow[] {
  if (!detail) return [];
  const artifacts = detail.artifacts ?? [];

  const rawByApollo: Record<string, Record<string, unknown>> = {};
  // Prefer the post-intent rescore artifact over the initial ranking:
  // chronological order puts rank_companies first, but its intent score is
  // only the funding-based proxy (often 0), while rescore_intent holds the
  // final score after LLM intent evaluation. Campaign refreshes append NEW
  // rescore_intent artifacts — the LAST one wins so refreshed scores show.
  const lastRescore = [...artifacts]
    .reverse()
    .find((a) => a.stage === "rescore_intent");
  const rankArtifact =
    lastRescore ??
    [...artifacts].reverse().find((a) => a.stage === "rank_companies");
  if (rankArtifact) {
    const payload = rankArtifact.payload ?? {};
    // Merge BOTH ranked (fit-passers) and pending (near-miss / below-fit)
    // companies so near-miss cards get their metrics (fit, intent, tier) and
    // can be labeled honestly instead of as approved.
    const merged = [
      ...(Array.isArray(payload.ranked_companies)
        ? (payload.ranked_companies as Array<Record<string, unknown>>)
        : []),
      ...(Array.isArray(payload.pending_companies)
        ? (payload.pending_companies as Array<Record<string, unknown>>)
        : []),
    ];
    for (const rc of merged) {
      const aid = rc.apollo_id ?? rc.id;
      if (aid) rawByApollo[String(aid)] = rc;
    }
  }

  // Union across ALL fetch_companies artifacts (the initial fetch + every
  // top-up round + every refresh) — companies that arrived in later rounds
  // have no row in the first artifact, and the backend already unions them
  // (pipeline/__init__.py). Later artifacts override earlier ones so the
  // freshest copy of a company's firmographic fields wins.
  const fetchedByApollo: Record<string, Record<string, unknown>> = {};
  for (const artifact of artifacts) {
    if (artifact.stage !== "fetch_companies") continue;
    const list = Array.isArray(artifact.payload?.companies)
      ? (artifact.payload.companies as Array<Record<string, unknown>>)
      : [];
    for (const co of list) {
      const aid = co.apollo_id ?? co.id;
      if (aid) fetchedByApollo[String(aid)] = co;
    }
  }

  // personas per company (from campaign_personas)
  const personasByCompany: Record<string, number> = {};
  for (const p of detail.personas ?? []) {
    const cid = p.apollo_company_id;
    if (cid) personasByCompany[cid] = (personasByCompany[cid] ?? 0) + 1;
  }

  const list = (ranked ?? []).length
    ? ranked!
    : detail.personas
        ? Object.keys(rawByApollo).map((aid) => ({
            id: aid,
            apollo_company_id: aid,
            company_name: String(rawByApollo[aid]?.name ?? "Unknown"),
            status: "approved",
            score:
              (
                (rawByApollo[aid]?.qualification_metrics as Record<string, unknown>)
                  ?.total_score as number
              ) ?? null,
            outreach_status: undefined,
            reengagement: false,
          }))
        : [];

  const rows: CompanyRow[] = list.map((c) => {
    const apolloId = c.apollo_company_id;
    const raw = rawByApollo[apolloId] ?? {};
    const fetched = fetchedByApollo[apolloId] ?? {};
    const metrics =
      (raw.qualification_metrics as Record<string, unknown>) ?? undefined;
    const intent = (fetched.intent_signals ?? {}) as Record<string, unknown>;
    return {
      id: c.id,
      apollo_id: apolloId,
      name: c.company_name ?? String(raw.name ?? "Unknown"),
      status: c.status ?? "approved",
      score: c.score ?? null,
      industry: (fetched.industry as string) ?? (raw.industry as string) ?? undefined,
      size:
        (fetched.estimated_num_employees as number) ??
        (fetched.employees as number) ??
        null,
      city: (fetched.city as string) ?? undefined,
      country: (fetched.country as string) ?? undefined,
      // domain falls back to the rank artifact — rank_companies / rescore_intent
      // carry the domain even when the company arrived via a top-up round.
      domain:
        (fetched.domain as string) ??
        (raw.domain as string) ??
        undefined,
      metrics: metrics as CompanyRow["metrics"],
      intent_summary:
        (fetched.intent_summary as string) ??
        (raw.intent_summary as string) ??
        undefined,
      signals_count: Array.isArray(intent.job_offers)
        ? intent.job_offers.length
        : 0,
      personas_count: personasByCompany[apolloId] ?? 0,
      // Outreach state + re-engagement flag come straight from the backend
      // companies payload (threads → status, Option-C re-entry → reengagement).
      outreach_status:
        c.outreach_status ??
        (raw.outreach_status as string | undefined) ??
        undefined,
      reengagement: !!(
        c.reengagement ??
        (raw.reengagement as boolean | undefined)
      ),
    };
  });

  return rows.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
}

// ── Personas ──────────────────────────────────────────────

export interface PersonaRow {
  id: string;
  apollo_id: string;
  name: string;
  company_id: string;
  company_name: string;
  title?: string;
  email?: string;
  phone?: string;
  linkedin_url?: string;
  score: number | null;
  verified?: boolean;
  signals_count?: number;
  role_match?: number;
  /** Clearbit-style split (mirrors CompanyRow): fit (stable) vs intent (their
   *  LinkedIn motion — timing axis). Both come from the persona ranker. */
  metrics?: {
    fit_score?: number;
    timing_score?: number;
    functional_relevance?: number;
    functional_reason?: string;
    authority_score?: number;
    reachability_score?: number;
    signal_score?: number;
    signal_reasoning?: string;
    has_public_signals?: boolean;
    tenure_trigger_active?: boolean;
    months_in_role?: number;
    linkedin_connected?: string | null;
    normalised_title?: string;
    [k: string]: unknown;
  };
}

/**
 * Human-readable "why" behind a persona's Fit and Intent numbers — fed to
 * the (i) tooltip on persona cards.
 */
export function personaScoreExplanation(
  metrics: PersonaRow["metrics"] | undefined,
): { fit: string; intent: string } {
  if (!metrics) {
    return {
      fit: "No scoring breakdown available for this persona.",
      intent: "",
    };
  }
  const roleMap: Record<string, string> = {
    primary_role_match: "title is an exact target role",
    department_match: "role sits in a target department",
    ceo_fallback: "founder/CEO fallback (no exact title match)",
    no_match: "no role/department match",
  };
  const reason = roleMap[metrics.functional_reason ?? ""] ?? "role evaluated";
  const months = metrics.months_in_role;
  const monthsNote =
    typeof months === "number"
      ? ` · ${months} month${months === 1 ? "" : "s"} in role`
      : "";
  const fit =
    `Fit = role + seniority match against your target roles. ` +
    `${reason}${monthsNote}. ` +
    `Functional ${Math.round(metrics.functional_relevance ?? 0)} · ` +
    `Authority ${Math.round(metrics.authority_score ?? 0)}.`;

  const hasMotion = metrics.tenure_trigger_active || metrics.has_public_signals;
  if (!hasMotion) {
    return {
      fit,
      intent:
        "No intent signals for this persona (no public LinkedIn activity and no recent-role trigger) — intent is unknown and not counted as positive or negative.",
    };
  }
  const parts: string[] = [];
  if (metrics.tenure_trigger_active) {
    parts.push("recently started their role (1-3 months) — likely in buying motion");
  }
  if (metrics.has_public_signals) {
    const reasoning =
      typeof metrics.signal_reasoning === "string" && metrics.signal_reasoning.trim()
        ? metrics.signal_reasoning.trim()
        : "posting activity relevant to what you sell";
    parts.push(reasoning);
  }
  return { fit, intent: `Intent = ${parts.join("; also, ")}.` };
}

export function buildPersonaRows(
  detail: CampaignDetail | null | undefined,
  ranked: RankedPersona[] | null | undefined,
): PersonaRow[] {
  if (!detail) return [];
  const artifacts = detail.artifacts ?? [];

  // Merge ALL rank_personas artifacts (campaign refreshes append new ones
  // for newly discovered companies) — later artifacts override earlier ones.
  const rankByApollo: Record<string, Record<string, unknown>> = {};
  for (const artifact of artifacts) {
    if (artifact.stage !== "rank_personas") continue;
    const list = Array.isArray(artifact.payload?.ranked_personas)
      ? (artifact.payload.ranked_personas as Array<Record<string, unknown>>)
      : [];
    for (const rp of list) {
      const aid = rp.apollo_id ?? rp.id;
      if (aid) rankByApollo[String(aid)] = rp;
    }
  }

  // Build company name lookup from ALL fetch_companies artifacts (the initial
  // fetch + top-up rounds + refreshes) & rank_companies artifacts — companies
  // discovered in later rounds must still resolve to their real name.
  const companyNameByApolloId: Record<string, string> = {};
  for (const artifact of artifacts) {
    if (artifact.stage !== "fetch_companies") continue;
    const companies = Array.isArray(artifact.payload?.companies)
      ? (artifact.payload.companies as Array<Record<string, unknown>>)
      : [];
    for (const co of companies) {
      const cid = co.apollo_id ?? co.id;
      const cname = co.name as string;
      if (cid && cname) companyNameByApolloId[String(cid)] = cname;
    }
  }
  // Also look up from rescore_intent / rank_companies as fallback
  const rankCoArtifact =
    artifacts.find((a) => a.stage === "rescore_intent") ??
    artifacts.find((a) => a.stage === "rank_companies");
  if (rankCoArtifact) {
    const ranked = Array.isArray(rankCoArtifact.payload?.ranked_companies)
      ? (rankCoArtifact.payload.ranked_companies as Array<Record<string, unknown>>)
      : [];
    for (const rc of ranked) {
      const rid = rc.apollo_id ?? rc.id;
      const rname = rc.name as string;
      if (rid && rname && !companyNameByApolloId[String(rid)]) {
        companyNameByApolloId[String(rid)] = rname;
      }
    }
  }

  const fetchArtifact = artifacts.find((a) => a.stage === "fetch_personas");
  const fetchedByApollo: Record<string, Record<string, unknown>> = {};
  const companyNameByApollo: Record<string, string> = {};
  if (fetchArtifact) {
    const byCompany = (fetchArtifact.payload?.sourced_personas_by_company ??
      {}) as Record<string, Array<Record<string, unknown>>>;
    for (const [companyId, personas] of Object.entries(byCompany)) {
      for (const p of personas ?? []) {
        const aid = p.apollo_id ?? p.id;
        if (aid) {
          fetchedByApollo[String(aid)] = p;
          companyNameByApollo[String(aid)] =
            (p.company_name as string) ||
            companyNameByApolloId[companyId] ||
            "";
        }
      }
    }
  }

  const list = (ranked ?? []).length
    ? ranked!
    : Object.keys(fetchedByApollo).map((aid) => ({
        id: aid,
        apollo_persona_id: aid,
        apollo_company_id: String(fetchedByApollo[aid]?.company_id ?? ""),
        persona_name: String(fetchedByApollo[aid]?.name ?? "Unknown"),
        linkedin_url: String(fetchedByApollo[aid]?.linkedin_url ?? ""),
        persona_score:
          (rankByApollo[aid]?.persona_score as number | undefined) ?? null,
      }));

  return list
    .map((p) => {
      const aid = p.apollo_persona_id;
      const raw = rankByApollo[aid] ?? {};
      const fetched = fetchedByApollo[aid] ?? {};
      const companyName = companyNameByApollo[aid] ?? "";
      const rawMetrics = (raw.metrics ?? {}) as Record<string, unknown>;
      return {
        id: p.id,
        apollo_id: aid,
        name: p.persona_name ?? String(fetched.name ?? raw.name ?? "Unknown"),
        company_id: p.apollo_company_id ?? String(fetched.company_id ?? ""),
        company_name: companyName || "Unknown company",
        title: (fetched.title as string) ?? (raw.title as string) ?? undefined,
        email: (fetched.email as string) ?? undefined,
        phone:
          (fetched.phone_number as string) ??
          (fetched.phone as string) ??
          (Array.isArray(fetched.sanitized_numbers)
            ? (fetched.sanitized_numbers as string[])[0]
            : undefined) ??
          undefined,
        linkedin_url: p.linkedin_url ?? (fetched.linkedin_url as string) ?? undefined,
        score: p.persona_score ?? null,
        verified: (fetched.email_verified as boolean) ?? undefined,
        signals_count: Array.isArray(fetched.signals)
          ? fetched.signals.length
          : undefined,
        role_match:
          (raw.role_match_score as number) ?? (raw.role_match as number) ?? undefined,
        metrics: rawMetrics as PersonaRow["metrics"],
      };
    })
    // Only show personas that passed the backend's minimum-score gate.
    // The rank_personas artifact only contains threshold-passers, so a
    // missing persona_score means the persona was dropped during ranking.
    .filter((p) => p.score != null);
}

// ── Sequence steps (merge DB steps + live workflow state) ──

export interface MergedStep {
  step_num: number;
  action_type: string;
  channel: string;
  day_offset: number;
  time_of_day: string;
  wait_delay_seconds: number;
  strategy_notes?: string;
  message?: string | null;
  subject?: string | null;
  ai_write: boolean;
  scheduled_timestamp_utc?: string;
  /** Prospect-local schedule: UTC timestamp + the prospect's timezone offset/name. */
  timing_justification?: string;
  sequence_architecture_rationale?: string;
  timezone_offset?: number | null;
  timezone_name?: string;
  timezone_iana?: string;

  status: string;
  quality_score?: number | null;
  quality_threshold?: number | null;
  generation_context?: Record<string, unknown> | null;
  generation_warnings?: string[];
  error?: string | null;
  sent_at?: string | null;
  action_required?: Record<string, unknown> | string | null;
  available_actions?: Array<{ action: string; label: string }>;
}

function wfToMerged(s: WorkflowStep): MergedStep {
  const belowThreshold = s.status === "below_threshold";
  return {
    step_num: s.step_num,
    action_type: s.action_type ?? "",
    channel: s.channel ?? "",
    day_offset: s.day_offset ?? 0,
    time_of_day: s.time_of_day ?? "",
    wait_delay_seconds: s.wait_delay_seconds ?? 0,
    strategy_notes: s.strategy_notes ?? "",
    scheduled_timestamp_utc: s.scheduled_timestamp_utc ?? undefined,
    // Never substitute strategy notes for the timing justification — the ⓘ
    // tooltip must show the AI's real "why this timing".
    timing_justification: (s.timing_justification as string | undefined) ?? "",
    sequence_architecture_rationale:
      (s.sequence_architecture_rationale as string | undefined) ?? "",
    timezone_offset:
      typeof s.timezone_offset === "number" ? s.timezone_offset : null,
    timezone_name: (s.timezone_name as string | undefined) ?? "",
    timezone_iana: (s.timezone_iana as string | undefined) ?? undefined,
    // Defense in depth: never render a failed draft even if an older workflow
    // payload accidentally still contains message/subject fields.
    message: belowThreshold
      ? null
      : typeof s.message === "string"
        ? s.message
        : ((s.message as Record<string, unknown> | null)?.message as string | null) ?? null,
    subject: belowThreshold
      ? null
      : s.subject ??
        ((s.message as Record<string, unknown> | null)?.subject as string | null) ??
        null,
    ai_write: !!s.ai_write,
    status: s.status ?? "pending",
    quality_score: s.quality_score ?? null,
    quality_threshold: s.quality_threshold ?? null,
    generation_context: s.generation_context ?? null,
    generation_warnings: s.generation_warnings ?? [],
    error: s.error ?? null,
    sent_at: s.sent_at ?? null,
    action_required: s.action_required ?? null,
    available_actions: s.available_actions,
  };
}

function dbToMerged(s: OutreachStep): MergedStep {
  const belowThreshold = s.status === "below_threshold";
  return {
    step_num: s.step_num,
    action_type: s.action_type ?? "",
    channel: s.channel ?? "",
    day_offset: s.day_offset ?? 0,
    time_of_day: s.time_of_day ?? "",
    wait_delay_seconds: s.wait_delay_seconds ?? 0,
    strategy_notes: s.strategy_notes ?? "",
    scheduled_timestamp_utc:
      s.scheduled_timestamp_utc ??
      (() => {
        try {
          const context = s.generation_context_json
            ? (JSON.parse(s.generation_context_json) as Record<string, unknown>)
            : null;
          const raw = context?.scheduled_timestamp ?? context?.scheduled_timestamp_utc;
          return typeof raw === "string" ? raw : undefined;
        } catch {
          return undefined;
        }
      })(),
    // Legacy rows (pre-rationale persistence) stored the rationale inside
    // strategy_notes — surface that only for the step "why", never the timing.
    timing_justification: s.timing_justification ?? "",
    sequence_architecture_rationale:
      s.sequence_architecture_rationale ?? s.strategy_notes ?? "",
    timezone_offset:
      typeof s.timezone_offset === "number" ? s.timezone_offset : null,
    timezone_name: s.timezone_name ?? "",
    timezone_iana: (s.timezone_iana as string | undefined) ?? undefined,
    message: belowThreshold ? null : s.message_text ?? null,
    subject: belowThreshold ? null : s.subject ?? null,
    ai_write: !!s.ai_write,
    status: s.status ?? "pending",
    quality_score: s.quality_score ?? null,
    quality_threshold: null,
    generation_context: s.generation_context_json
      ? (() => {
          try {
            return JSON.parse(s.generation_context_json) as Record<string, unknown>;
          } catch {
            return null;
          }
        })()
      : null,
    generation_warnings: s.generation_warnings_json
      ? (() => {
          try {
            const parsed = JSON.parse(s.generation_warnings_json as string);
            return Array.isArray(parsed) ? (parsed as string[]) : [];
          } catch {
            return [];
          }
        })()
      : [],
    error: s.error ?? null,
    sent_at: s.sent_at ?? null,
  };
}

/**
 * Merge DB-persisted steps with live workflow state steps.
 * Live state wins when both exist (it reflects the last signal).
 */
export function mergeSteps(
  dbSteps: OutreachStep[] | undefined,
  workflow: WorkflowState | undefined,
): MergedStep[] {
  const byNum = new Map<number, MergedStep>();
  for (const s of dbSteps ?? []) byNum.set(s.step_num, dbToMerged(s));
  const live = workflow?.state?.steps;
  if (Array.isArray(live)) {
    for (const s of live) byNum.set(s.step_num, wfToMerged(s));
  }
  const sorted = [...byNum.values()].sort((a, b) => a.step_num - b.step_num);

  // Compute day_offset from cumulative wait delays so every step
  // shows a realistic day number even when the backend sends 0.
  // wait_delay_seconds = delay from previous step, so add it
  // BEFORE computing day_offset for the current step.
  let cumulativeSeconds = 0;
  for (let i = 0; i < sorted.length; i++) {
    cumulativeSeconds += sorted[i].wait_delay_seconds;
    sorted[i].day_offset = Math.floor(cumulativeSeconds / 86_400);
  }

  return sorted;
}

// ── Artifact activity feed ────────────────────────────────

export interface ActivityItem {
  stage: string;
  created_at: string;
  title: string;
  detail: string;
  tone: "ok" | "warn" | "danger" | "neutral" | "accent";
}

export function artifactActivity(detail: CampaignDetail | null | undefined): ActivityItem[] {
  if (!detail) return [];
  const items: ActivityItem[] = [];
  for (const a of detail.artifacts ?? []) {
    items.push(...artifactToActivity(a));
  }
  return items.sort((x, y) => x.created_at.localeCompare(y.created_at));
}

function artifactToActivity(a: Artifact): ActivityItem[] {
  const p = a.payload ?? {};
  const out: ActivityItem[] = [];

  switch (a.stage) {
    case "icp_extract": {
      const filters = (p.icp_filters ?? {}) as Record<string, unknown>;
      const ind = Array.isArray(filters.industries)
        ? (filters.industries as string[])
        : [];
      const countries = Array.isArray(filters.target_countries)
        ? (filters.target_countries as string[])
        : [];
      const roles = Array.isArray(filters.target_roles)
        ? (filters.target_roles as string[])
        : [];
      const size = (filters.company_size ?? {}) as Record<string, unknown>;
      const sizeTxt =
        typeof size.min === "number" || typeof size.max === "number"
          ? `${typeof size.min === "number" ? size.min : 0}–${typeof size.max === "number" ? size.max : "∞"} emp.`
          : "";
      out.push({
        stage: a.stage,
        created_at: a.created_at,
        title: "ICP extracted",
        detail: [
          ind.length ? ind.join(", ") : "",
          countries.length ? countries.join(", ") : "",
          sizeTxt,
          roles.length ? `roles: ${roles.join(", ")}` : "",
        ]
          .filter(Boolean)
          .join(" · "),
        tone: "ok",
      });
      break;
    }
    case "fetch_companies": {
      const count = Array.isArray(p.companies) ? p.companies.length : 0;
      out.push({
        stage: a.stage,
        created_at: a.created_at,
        title: "Companies sourced",
        detail: `${count} candidates fetched`,
        tone: "ok",
      });
      break;
    }
    case "rank_companies":
    case "rescore_intent": {
      const list = Array.isArray(p.ranked_companies) ? p.ranked_companies : [];
      const top = list
        .slice(0, 3)
        .map((c: Record<string, unknown>) => c.name as string)
        .filter(Boolean);
      out.push({
        stage: a.stage,
        created_at: a.created_at,
        title: a.stage === "rescore_intent" ? "Companies re-scored with intent" : "Companies scored",
        detail: `${list.length} ranked${top.length ? ` — top: ${top.join(", ")}` : ""}`,
        tone: "ok",
      });
      break;
    }
    case "fetch_intent": {
      const count = Object.keys(p.intent_by_apollo_id ?? {}).length;
      out.push({
        stage: a.stage,
        created_at: a.created_at,
        title: "Intent signals fetched",
        detail: `${count} companies with hiring/news signals`,
        tone: "ok",
      });
      break;
    }
    case "fetch_personas": {
      const byCompany = (p.sourced_personas_by_company ?? {}) as Record<
        string,
        unknown[]
      >;
      const count = Object.values(byCompany).reduce((n, arr) => n + (arr?.length ?? 0), 0);
      out.push({
        stage: a.stage,
        created_at: a.created_at,
        title: "Personas sourced",
        detail: `${count} personas across ${Object.keys(byCompany).length} companies`,
        tone: "ok",
      });
      break;
    }
    case "rank_personas": {
      const list = Array.isArray(p.ranked_personas) ? p.ranked_personas : [];
      const winner = list[0] as Record<string, unknown> | undefined;
      out.push({
        stage: a.stage,
        created_at: a.created_at,
        title: "Personas scored",
        detail: winner
          ? `${list.length} ranked — best: ${(winner.name as string) ?? "—"}`
          : `${list.length} ranked`,
        tone: "ok",
      });
      break;
    }
    case "enrich_contacts": {
      const contacts = (p.contacts ?? {}) as Record<string, unknown>;
      out.push({
        stage: a.stage,
        created_at: a.created_at,
        title: "Contacts enriched",
        detail: `${Object.keys(contacts).length} contact enriched (email/phone)`,
        tone: "ok",
      });
      break;
    }
    case "final_packages": {
      const packages = Array.isArray(p.packages) ? p.packages : [];
      const companies = new Set<string>();
      for (const fp of packages as Array<Record<string, unknown>>) {
        // The final_packages ARTIFACT stores raw package dicts (unlike the
        // API package list which wraps them in {package: ...}).
        const pkg = (fp ?? {}) as Record<string, unknown>;
        const company = (pkg.company ?? {}) as Record<string, unknown>;
        if (company.apollo_id) companies.add(String(company.apollo_id));
      }
      out.push({
        stage: a.stage,
        created_at: a.created_at,
        title: "Lead packages ready",
        detail: `${packages.length} package(s) across ${companies.size} company(ies)`,
        tone: "ok",
      });
      break;
    }
    case "selected_personas": {
      const list = Array.isArray(p.personas) ? p.personas : [];
      const companies = new Set<string>();
      for (const pers of list as Array<Record<string, unknown>>) {
        if (pers.company_apollo_id) companies.add(String(pers.company_apollo_id));
      }
      out.push({
        stage: a.stage,
        created_at: a.created_at,
        title: "Leads selected",
        detail: `${list.length} persona(s) across ${companies.size} company(ies)`,
        tone: "accent",
      });
      break;
    }
    case "error": {
      out.push({
        stage: a.stage,
        created_at: a.created_at,
        title: "Pipeline error",
        detail: String(p.error ?? "unknown error"),
        tone: "danger",
      });
      break;
    }
    case "usage_report": {
      out.push({
        stage: a.stage,
        created_at: a.created_at,
        title: "Usage report written",
        detail: "Token usage & LLM costs persisted",
        tone: "neutral",
      });
      break;
    }
    default:
      break;
  }
  return out;
}
