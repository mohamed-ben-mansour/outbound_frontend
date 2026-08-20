import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  Target,
  Package,
  Ban,
  Scale,
  Send,
  ListOrdered,
  Sparkles,
  Rocket,
  Save,
  Download,
  ChevronDown,
  ChevronRight,
  Loader2,
  Wand2,
  Check,
  X,
} from "lucide-react";
import {
  Button,
  Card,
  Field,
  Input,
  Select,
  Slider,
  TagInput,
  Textarea,
  Toggle,
} from "@/components/ui";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import * as api from "@/lib/api";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useCampaignParamsById } from "@/hooks/queries";
import type { CampaignParams, PersonalityConfig } from "@/lib/types";

interface FormState {
  campaign_name: string;
  icp_description_text: string;
  user_offering: string;
  blacklist_companies: string[];
  blacklist_personas: string[];
  max_km_radius: number;
  industry_weight: number;
  size_weight: number;
  revenue_weight: number;
  tech_stack_weight: number;
  firmographic_weight: number;
  intent_weight: number;
  fit_weight: number;
  reachability_weight: number;
  timing_weight: number;
  functional_weight: number;
  authority_weight: number;
  company_limit: string;
  run_async: boolean;
  auto_approve_all: boolean;
  auto_start_outreach: boolean;
  refresh_frequency: "off" | "daily" | "weekly";
  sender_company: string;
  sender_elevator_pitch: string;
  offer_name: string;
  solution_summary: string;
  cta: string;
  approval_mode: string;
  use_native_language: boolean;
  message_language: string;
  has_inmail_credits: boolean;
  debug_mode: boolean;
  send_enabled: boolean;
  max_touches: string;
  max_days: string;
  preferred_first_channel: string;
  seq_vary_tone: boolean;
  seq_include_breakup: boolean;
  seq_reference_previous: boolean;
  seq_escalate_urgency: boolean;
  seq_cross_channel: boolean;
  stage_instructions: Record<string, string>;
  base_template: string;
  custom_template_description: string;
  personality_traits: string[];
  always_include_phrases: string[];
  never_use_phrases: string[];
  voice_samples: string[];
  urgency_level: number;
  humor_sarcasm: number;
  touchdowns_per_message: string;
}

const INITIAL: FormState = {
  campaign_name: "",
  icp_description_text: "",
  user_offering: "",
  blacklist_companies: [],
  blacklist_personas: [],
  max_km_radius: 50,
  industry_weight: 0.4,
  size_weight: 0.3,
  revenue_weight: 0.15,
  tech_stack_weight: 0.15,
  firmographic_weight: 0.6,
  intent_weight: 0.4,
  fit_weight: 0.7,
  reachability_weight: 0.2,
  timing_weight: 0.1,
  functional_weight: 0.6,
  authority_weight: 0.4,
  company_limit: "10",
  run_async: true,
  auto_approve_all: true,
  auto_start_outreach: true,
  refresh_frequency: "off",
  sender_company: "",
  sender_elevator_pitch: "",
  offer_name: "",
  solution_summary: "",
  cta: "",
  approval_mode: "per_sequence",
  use_native_language: false,
  message_language: "",
  has_inmail_credits: false,
  debug_mode: true,
  send_enabled: true,
  max_touches: "6",
  max_days: "14",
  preferred_first_channel: "linkedin_dm",
  seq_vary_tone: false,
  seq_include_breakup: true,
  seq_reference_previous: false,
  seq_escalate_urgency: false,
  seq_cross_channel: true,
  stage_instructions: {},
  base_template: "consultative",
  custom_template_description: "",
  personality_traits: [],
  always_include_phrases: [],
  never_use_phrases: [],
  voice_samples: [],
  urgency_level: 2,
  humor_sarcasm: 2,
  touchdowns_per_message: "",
};

function num(value: string): number | undefined {
  const n = Number(value);
  return value.trim() === "" || Number.isNaN(n) ? undefined : n;
}

// ── ICP hints — guidance for what to write inside the brief ────────────

interface IcpHint {
  key: string;
  label: string;
  hint: string;
  test: (text: string) => boolean;
}

const INDUSTRY_RE =
  /(insurance|insurtech|financ|fintech|bank|saas|software|tech|manufactur|healthcare|health|retail|energy|logistics|media|real estate|consulting|telecom|automotive|aerospace|education|travel|hospitality|food|chemical|pharma|biotech|construction|legal|marketing|cyber|security)/i;
const SIZE_RE =
  /(employees|employee|headcount|people|staff|seats)\s*(of|between|:)?\s*\d+|\d+\s*(-|–|to)\s*\d+|(sme|mid-market|enterprise|startup|scaleup)/i;
const COUNTRY_RE =
  /(united states|usa|u\.s\.|france|germany|uk|united kingdom|spain|italy|netherlands|belgium|switzerland|canada|australia|india|japan|china|brazil|mexico|poland|sweden|norway|denmark|finland|portugal|ireland|austria|singapore|uae|saudi|qatar|israel|turkey|vietnam|indonesia|nigeria|south africa|egypt|morocco|tunisia|algeria|europe|middle east|north america|latin america|asia|africa|gcc|emen|based in|located in|region of)/i;
const ROLE_RE =
  /(chief|head of|director|vp|vice president|manager|officer|lead|founder|cto|cio|cfo|cmo|coo|owner|hiring manager|decision maker|buyer|procurement|sales)/i;
const REVENUE_RE =
  /(annual revenue|arr|revenue|earnings)?\s*[:(-]?\s*\$?\s*\d[\d,]*(m|k|b|million|billion|bn)?(\s*(-|–|to|and|or)\s*\$?\s*\d[\d,]*(m|k|b|million|billion|bn)?)?/i;
const CITY_RE =
  /(preferred cities|based in|located in|headquartered|city)/i;
const TECH_RE =
  /(tech stack|technology stack|guidewire|salesforce|snowflake|aws|azure|gcp|tableau|slack|hubspot|sap|oracle|salesloft|outreach|zoominfo|segment|stripe|datadog|mixpanel|postgres|react|python|java|kafka|kubernetes)/i;
const GROWTH_RE =
  /(growth stage|growth-stage|startup|scaleup|hypergrowth|mature|late-stage|early-stage|bootstrapped)/i;
const FUNDING_RE =
  /(series [abcde]|series [abcde][+]|seed|venture|vc-backed|ipo|public|private equity|pe-backed)/i;
const EXCLUDE_RE =
  /(exclude|exclusion|except|do not target|avoid|never|blacklist|not in|outside of)/i;

const ICP_HINTS: IcpHint[] = [
  {
    key: "industry",
    label: "Industries",
    hint: "e.g. Insurance, Fintech, SaaS…",
    test: (t) => INDUSTRY_RE.test(t),
  },
  {
    key: "size",
    label: "Company size",
    hint: "e.g. 200 to 5000 employees",
    test: (t) => SIZE_RE.test(t),
  },
  {
    key: "countries",
    label: "Geography",
    hint: "e.g. Located in: United States, France…",
    test: (t) => COUNTRY_RE.test(t),
  },
  {
    key: "revenue",
    label: "Revenue / ARR",
    hint: "e.g. $10,000,000 to $500,000,000",
    test: (t) => REVENUE_RE.test(t),
  },
  {
    key: "cities",
    label: "Preferred cities",
    hint: "e.g. San Francisco, New York, Austin",
    test: (t) => CITY_RE.test(t),
  },
  {
    key: "tech",
    label: "Tech stack",
    hint: "e.g. Guidewire, Salesforce, Snowflake, AWS…",
    test: (t) => TECH_RE.test(t),
  },
  {
    key: "growth",
    label: "Growth stage",
    hint: "e.g. growth stage, scaleup, enterprise",
    test: (t) => GROWTH_RE.test(t),
  },
  {
    key: "funding",
    label: "Funding stage",
    hint: "e.g. Series B, Series C, or later",
    test: (t) => FUNDING_RE.test(t),
  },
  {
    key: "exclude",
    label: "Exclusions",
    hint: "e.g. Exclude: Gambling, Government, agency…",
    test: (t) => EXCLUDE_RE.test(t),
  },
  {
    key: "roles",
    label: "Target roles",
    hint: "e.g. VP of Sales, Head of Revenue Operations…",
    test: (t) => ROLE_RE.test(t),
  },
];

const ICP_EXAMPLE = `We sell NudgeShield cyber-risk analytics to mid-market insurance and financial services companies in the United States. Contact risk, underwriting, and revenue leaders.

- Industry: Insurance, Financial Services, Banking, Fintech
- Company size: 200 to 5000 employees
- Located in: United States
- Annual revenue / ARR: $10,000,000 to $500,000,000
- Preferred cities: San Francisco (United States), New York (United States), Austin (United States)
- Tech stack: Guidewire, Salesforce, Snowflake, AWS, Tableau, Slack
- Growth stage: growth stage
- Funding stage: Series B, Series C, or later

Exclude:
- Industries: Gambling, Government, Non-profit, Software
- Keywords: agency, staffing, consulting-only, competitor
- Company size under 50 employees

Target roles:
- VP of Sales
- Head of Sales
- Director of Sales
- Chief Revenue Officer
- Head of Revenue Operations
- Sales Operations Manager`;

function Section({
  icon,
  title,
  subtitle,
  children,
  defaultOpen = true,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-5 py-4 text-left"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-line bg-ink-800 text-accent-soft">
          {icon}
        </span>
        <span className="flex-1">
          <span className="block text-sm font-semibold text-slate-100">{title}</span>
          <span className="block text-[11px] text-mist">{subtitle}</span>
        </span>
        {open ? (
          <ChevronDown className="h-4 w-4 text-mist" />
        ) : (
          <ChevronRight className="h-4 w-4 text-mist" />
        )}
      </button>
      {open && <div className="border-t border-line px-5 py-5">{children}</div>}
    </Card>
  );
}

export default function Setup() {
  const { userId } = useWorkspace();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  // T8: each campaign owns its config. /setup?campaign_id=<id> edits that
  // campaign's draft; without it we start a fresh (clean) draft.
  const [campaignId, setCampaignId] = useState<string | null>(
    searchParams.get("campaign_id"),
  );
  const [form, setForm] = useState<FormState>(INITIAL);
  const [loaded, setLoaded] = useState(false);

  const qc = useQueryClient();
  const { data: saved, isFetching: loadingSaved } = useCampaignParamsById(campaignId);
  const [saving, setSaving] = useState(false);
  const [launching, setLaunching] = useState(false);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  // Load saved params when available
  useEffect(() => {
    if (!saved || loaded) return;
    const p = saved.params ?? {};
    setForm((f) => ({
      ...f,
      campaign_name: p.campaign_name ?? f.campaign_name,
      icp_description_text: p.icp_description_text ?? f.icp_description_text,
      user_offering: p.user_offering ?? f.user_offering,
      blacklist_companies: p.blacklist?.companies ?? [],
      blacklist_personas: p.blacklist?.personas ?? [],
      max_km_radius: p.configurable_weights?.max_km_radius ?? f.max_km_radius,
      industry_weight: p.configurable_weights?.industry_weight ?? f.industry_weight,
      size_weight: p.configurable_weights?.size_weight ?? f.size_weight,
      revenue_weight: p.configurable_weights?.revenue_weight ?? f.revenue_weight,
      tech_stack_weight: p.configurable_weights?.tech_stack_weight ?? f.tech_stack_weight,
      firmographic_weight: p.configurable_weights?.firmographic_weight ?? f.firmographic_weight,
      intent_weight: p.configurable_weights?.intent_weight ?? f.intent_weight,
      fit_weight: p.configurable_weights?.fit_weight ?? f.fit_weight,
      reachability_weight: p.configurable_weights?.reachability_weight ?? f.reachability_weight,
      timing_weight: p.configurable_weights?.timing_weight ?? f.timing_weight,
      functional_weight: p.configurable_weights?.functional_weight ?? f.functional_weight,
      authority_weight: p.configurable_weights?.authority_weight ?? f.authority_weight,
      company_limit: p.company_limit != null ? String(p.company_limit) : f.company_limit,
      run_async: p.run_async ?? f.run_async,
      auto_approve_all: p.auto_approve_all ?? f.auto_approve_all,
      auto_start_outreach: p.auto_start_outreach ?? f.auto_start_outreach,
      refresh_frequency: p.refresh_frequency ?? f.refresh_frequency,
      sender_company: p.sender_company ?? f.sender_company,
      sender_elevator_pitch: p.sender_elevator_pitch ?? f.sender_elevator_pitch,
      offer_name: p.offer_name ?? f.offer_name,
      solution_summary: p.solution_summary ?? f.solution_summary,
      cta: p.cta ?? f.cta,
      // Legacy rows may store the removed per_step value — treat as per_step_and_message.
      approval_mode:
        (p.approval_mode as string | undefined) === "per_step"
          ? "per_step_and_message"
          : (p.approval_mode ?? f.approval_mode),
      use_native_language: p.use_native_language ?? f.use_native_language,
      message_language: p.message_language ?? f.message_language,
      has_inmail_credits: p.has_inmail_credits ?? f.has_inmail_credits,
      debug_mode: p.debug_mode ?? f.debug_mode,
      send_enabled: p.send_enabled ?? f.send_enabled,
      max_touches: p.max_touches != null ? String(p.max_touches) : f.max_touches,
      max_days: p.max_days != null ? String(p.max_days) : f.max_days,
      preferred_first_channel: p.preferred_first_channel ?? f.preferred_first_channel,
      seq_vary_tone: p.sequence_options?.vary_tone ?? f.seq_vary_tone,
      seq_include_breakup: p.sequence_options?.include_breakup ?? f.seq_include_breakup,
      seq_reference_previous: p.sequence_options?.reference_previous ?? f.seq_reference_previous,
      seq_escalate_urgency: p.sequence_options?.escalate_urgency ?? f.seq_escalate_urgency,
      seq_cross_channel: p.sequence_options?.cross_channel ?? f.seq_cross_channel,
      stage_instructions: p.stage_instructions ?? f.stage_instructions,
      base_template: p.personality_config?.base_template ?? f.base_template,
      custom_template_description:
        p.personality_config?.custom_template_description ?? f.custom_template_description,
      personality_traits: p.personality_config?.personality_traits ?? [],
      always_include_phrases: p.personality_config?.always_include_phrases ?? [],
      never_use_phrases: p.personality_config?.never_use_phrases ?? [],
      voice_samples: p.personality_config?.voice_samples ?? [],
      urgency_level: p.personality_config?.urgency_level ?? f.urgency_level,
      humor_sarcasm: p.personality_config?.humor_sarcasm ?? f.humor_sarcasm,
      touchdowns_per_message:
        p.personality_config?.touchdowns_per_message != null
          ? String(p.personality_config.touchdowns_per_message)
          : "",
    }));
    setLoaded(true);
  }, [saved, loaded]);

  const body = useMemo<CampaignParams>(
    () => ({
      user_id: userId,
      campaign_name: form.campaign_name.trim() || undefined,
      icp_description_text: form.icp_description_text.trim() || undefined,
      user_offering: form.user_offering.trim() || undefined,
      blacklist: {
        companies: form.blacklist_companies,
        personas: form.blacklist_personas,
      },
      configurable_weights: {
        max_km_radius: form.max_km_radius,
        industry_weight: form.industry_weight,
        size_weight: form.size_weight,
        revenue_weight: form.revenue_weight,
        tech_stack_weight: form.tech_stack_weight,
        firmographic_weight: form.firmographic_weight,
        intent_weight: form.intent_weight,
        fit_weight: form.fit_weight,
        reachability_weight: form.reachability_weight,
        timing_weight: form.timing_weight,
        functional_weight: form.functional_weight,
        authority_weight: form.authority_weight,
      },
      company_limit: num(form.company_limit),
      run_async: form.run_async,
      auto_approve_all: form.auto_approve_all,
      auto_start_outreach: form.auto_start_outreach,
      refresh_frequency: form.refresh_frequency,
      sender_company: form.sender_company.trim() || undefined,
      sender_elevator_pitch: form.sender_elevator_pitch.trim() || undefined,
      offer_name: form.offer_name.trim() || undefined,
      solution_summary: form.solution_summary.trim() || undefined,
      cta: form.cta.trim() || undefined,
      approval_mode: form.approval_mode as CampaignParams["approval_mode"],
      use_native_language: form.use_native_language,
      message_language: form.message_language.trim() || undefined,
      has_inmail_credits: form.has_inmail_credits,
      debug_mode: form.debug_mode,
      send_enabled: form.send_enabled,
      max_touches: num(form.max_touches),
      max_days: num(form.max_days),
      preferred_first_channel: form.preferred_first_channel as CampaignParams["preferred_first_channel"],
      sequence_options: {
        vary_tone: form.seq_vary_tone,
        include_breakup: form.seq_include_breakup,
        reference_previous: form.seq_reference_previous,
        escalate_urgency: form.seq_escalate_urgency,
        cross_channel: form.seq_cross_channel,
      },
      stage_instructions:
        Object.keys(form.stage_instructions).length > 0 ? form.stage_instructions : undefined,
      personality_config: {
        base_template: form.base_template as PersonalityConfig["base_template"],
        custom_template_description:
          form.custom_template_description.trim() || undefined,
        personality_traits: form.personality_traits,
        always_include_phrases: form.always_include_phrases,
        never_use_phrases: form.never_use_phrases,
        urgency_level: form.urgency_level,
        humor_sarcasm: form.humor_sarcasm,
        touchdowns_per_message: num(form.touchdowns_per_message),
        voice_samples: form.voice_samples,
      },
    }),
    [form, userId],
  );

  /**
   * T8: make sure a draft campaign exists to own these params. The first save
   * creates one (POST /campaigns) and pins the URL to it; later saves go to
   * that same campaign. Without this every save would reuse another campaign's
   * config.
   */
  const ensureCampaign = async (): Promise<string | null> => {
    if (campaignId) return campaignId;
    try {
      const res = await api.createDraftCampaign(userId);
      setCampaignId(res.campaign_id);
      setSearchParams({ campaign_id: res.campaign_id }, { replace: true });
      qc.invalidateQueries({ queryKey: ["campaigns", userId] });
      return res.campaign_id;
    } catch (e) {
      toast.error((e as Error).message);
      return null;
    }
  };

  /**
   * Saves the whole draft (ICP text, offering, blacklist, weights, outreach
   * config, personality) to THIS campaign. Returns the campaign id, or null
   * on failure.
   */
  const persistAll = async (): Promise<string | null> => {
    setSaving(true);
    try {
      const cid = await ensureCampaign();
      if (!cid) return null;
      await api.saveCampaignParamsById(cid, body);
      qc.invalidateQueries({ queryKey: ["params", cid] });
      toast.success("Campaign parameters saved");
      return cid;
    } catch (e) {
      toast.error((e as Error).message);
      return null;
    } finally {
      setSaving(false);
    }
  };

  const saveAndLaunch = async () => {
    const cid = await persistAll();
    if (!cid) return;
    setLaunching(true);
    try {
      const res = await api.startCampaignById(cid);
      navigate(`/campaigns/${res.campaign_id}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLaunching(false);
    }
  };

  const readyToLaunch =
    form.icp_description_text.trim().length > 20 && form.user_offering.trim().length > 0;

  const icpHintsCovered = useMemo(
    () => ICP_HINTS.filter((h) => h.test(form.icp_description_text)).length,
    [form.icp_description_text],
  );

  return (
    <div className="grid gap-6 lg:grid-cols-3 animate-fade-up">
      <div className="space-y-5 lg:col-span-2">
        {/* ── Campaign name ── */}
        <Card>
          <div className="flex items-center gap-3 px-5 py-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-line bg-ink-800 text-accent-soft">
              <Rocket className="h-4 w-4" />
            </span>
            <div className="flex-1">
              <Field
                label="Campaign name"
                hint="Give this campaign config a name (e.g. 'Insurance ICP', 'Fintech Q3'). Leave empty to use the default."
              >
                <Input
                  value={form.campaign_name}
                  onChange={(e) => set("campaign_name", e.target.value)}
                  placeholder="e.g. Insurance ICP"
                />
              </Field>
            </div>
          </div>
        </Card>

        <Section
          icon={<Target className="h-4 w-4" />}
          title="Ideal Customer Profile"
          subtitle="Describe your ideal customer in one brief — the AI extracts everything from it."
        >
          <div className="space-y-4">
            <Field
              label="ICP description"
              hint="Write a natural-language description of who you want to target. The qualifier parses it into a structured ICP (industries, size, geography, roles) that drives sourcing and scoring."
            >
              <Textarea
                value={form.icp_description_text}
                onChange={(e) => set("icp_description_text", e.target.value)}
                placeholder={'e.g. "Mid-market insurance & fintech companies, 200-5000 employees, US-based, heads of risk & compliance…"'}
                className="min-h-[180px] font-mono text-xs leading-relaxed"
              />
            </Field>

            {/* What to include — live guidance */}
            <div className="rounded-xl border border-line bg-ink-900/60 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold text-slate-200">
                  What to include in your ICP text
                </p>
                <span className="text-[11px] font-medium text-mist">
                  {icpHintsCovered}/{ICP_HINTS.length} covered
                </span>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {ICP_HINTS.map((hint) => {
                  const ok = hint.test(form.icp_description_text);
                  return (
                    <div
                      key={hint.key}
                      className={cn(
                        "flex items-start gap-2.5 rounded-lg border px-3 py-2.5 transition-colors",
                        ok
                          ? "border-emerald-400/25 bg-emerald-500/[0.07]"
                          : "border-line bg-ink-800/60",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full",
                          ok ? "bg-emerald-500/25 text-emerald-300" : "bg-white/5 text-mist",
                        )}
                      >
                        {ok ? <Check className="h-2.5 w-2.5" /> : <X className="h-2.5 w-2.5" />}
                      </span>
                      <span>
                        <span
                          className={cn(
                            "block text-xs font-semibold",
                            ok ? "text-emerald-200" : "text-slate-300",
                          )}
                        >
                          {hint.label}
                        </span>
                        <span className="mt-0.5 block text-[11px] text-mist">{hint.hint}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] leading-relaxed text-mist">
                  Tip: the qualifier extracts industries, size, geography, revenue, tech stack,
                  growth/funding stage, exclusions and target roles straight from your text.
                </p>
                <Button
                  size="sm"
                  variant="ghost"
                  className="shrink-0"
                  onClick={() => set("icp_description_text", ICP_EXAMPLE)}
                >
                  <Wand2 className="h-3.5 w-3.5" /> Insert example
                </Button>
              </div>
              <div className="mt-1.5 rounded-lg border border-accent/15 bg-accent/5 px-3 py-2 text-[11px] leading-relaxed text-mist">
                💱 <span className="text-slate-200">Currency — write revenue in any currency you like</span>{" "}
                (€, $, £, S$, ₹…). We detect it, convert to USD automatically with live exchange
                rates for search & scoring, and display your original currency back to you. You
                never need to think about the rates.
              </div>
            </div>
          </div>
        </Section>

        <Section
          icon={<Package className="h-4 w-4" />}
          title="Your offering"
          subtitle="The product or service this campaign pitches."
        >
          <Field
            label="User offering"
            hint="Used for ICP context and as fallback for outreach solution summaries."
          >
            <Textarea
              value={form.user_offering}
              onChange={(e) => set("user_offering", e.target.value)}
              placeholder="e.g. NudgeShield is a cyber-risk & underwriting intelligence platform that helps insurers detect emerging threats and score account risk…"
              className="min-h-[100px] font-mono text-xs"
            />
          </Field>
        </Section>

        <Section
          icon={<Ban className="h-4 w-4" />}
          title="Blacklist"
          subtitle="Companies and personas excluded from sourcing (persisted per user)."
        >
          <div className="space-y-4">
            <Field label="Company blacklist" hint="Names, domains or regex patterns — case-insensitive match.">
              <TagInput
                tags={form.blacklist_companies}
                onChange={(v) => set("blacklist_companies", v)}
                placeholder="e.g. Acme Corp, *.gov"
              />
            </Field>
            <Field label="Persona blacklist" hint="LinkedIn profile URLs to exclude.">
              <TagInput
                tags={form.blacklist_personas}
                onChange={(v) => set("blacklist_personas", v)}
                placeholder="https://www.linkedin.com/in/…"
              />
            </Field>
          </div>
        </Section>

        <Section
          icon={<Scale className="h-4 w-4" />}
          title="Scoring weights"
          subtitle="How strongly each signal counts toward company & persona scores."
        >
          <div className="space-y-4">
            <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
              <Field label="Industry weight">
                <Slider value={form.industry_weight} min={0} max={1} step={0.05} onChange={(v) => set("industry_weight", v)} format={(v) => v.toFixed(2)} />
              </Field>
              <Field label="Size weight">
                <Slider value={form.size_weight} min={0} max={1} step={0.05} onChange={(v) => set("size_weight", v)} format={(v) => v.toFixed(2)} />
              </Field>
              <Field label="Revenue weight">
                <Slider value={form.revenue_weight} min={0} max={1} step={0.05} onChange={(v) => set("revenue_weight", v)} format={(v) => v.toFixed(2)} />
              </Field>
              <Field label="Tech stack weight">
                <Slider value={form.tech_stack_weight} min={0} max={1} step={0.05} onChange={(v) => set("tech_stack_weight", v)} format={(v) => v.toFixed(2)} />
              </Field>
              <Field label="Firmographic share (of total score)">
                <Slider value={form.firmographic_weight} min={0} max={1} step={0.05} onChange={(v) => set("firmographic_weight", v)} format={(v) => v.toFixed(2)} />
              </Field>
              <Field label="Intent share (of total score)">
                <Slider value={form.intent_weight} min={0} max={1} step={0.05} onChange={(v) => set("intent_weight", v)} format={(v) => v.toFixed(2)} />
              </Field>
              <Field label="Persona fit weight">
                <Slider value={form.fit_weight} min={0} max={1} step={0.05} onChange={(v) => set("fit_weight", v)} format={(v) => v.toFixed(2)} />
              </Field>
              <Field label="Reachability weight">
                <Slider value={form.reachability_weight} min={0} max={1} step={0.05} onChange={(v) => set("reachability_weight", v)} format={(v) => v.toFixed(2)} />
              </Field>
              <Field label="Timing weight">
                <Slider value={form.timing_weight} min={0} max={1} step={0.05} onChange={(v) => set("timing_weight", v)} format={(v) => v.toFixed(2)} />
              </Field>
              <Field label="Functional share (of fit)">
                <Slider value={form.functional_weight} min={0} max={1} step={0.05} onChange={(v) => set("functional_weight", v)} format={(v) => v.toFixed(2)} />
              </Field>
              <Field label="Authority share (of fit)">
                <Slider value={form.authority_weight} min={0} max={1} step={0.05} onChange={(v) => set("authority_weight", v)} format={(v) => v.toFixed(2)} />
              </Field>
              <Field label="Max geo radius (km)">
                <Slider value={form.max_km_radius} min={10} max={300} step={5} onChange={(v) => set("max_km_radius", v)} format={(v) => `${v}km`} />
              </Field>
            </div>
          </div>
        </Section>

        <Section
          icon={<Send className="h-4 w-4" />}
          title="Outreach settings"
          subtitle="How Phase B behaves once a lead package is ready."
        >
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Toggle
                checked={form.auto_approve_all}
                onChange={(v) => set("auto_approve_all", v)}
                label="Auto-approve companies"
                description="Off: pause after company ranking so you approve which companies proceed to personas."
              />
              <Toggle
                checked={form.auto_start_outreach}
                onChange={(v) => set("auto_start_outreach", v)}
                label="Auto-start Phase B"
                description="Kick off sequence generation automatically when Phase A finishes."
              />
              <Field label="Auto-refresh campaign">
                <Select
                  value={form.refresh_frequency}
                  onChange={(e) =>
                    set("refresh_frequency", e.target.value as "off" | "daily" | "weekly")
                  }
                >
                  <option value="off">Off — no auto-refresh</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                </Select>
              </Field>
              <Toggle
                checked={form.run_async}
                onChange={(v) => set("run_async", v)}
                label="Run Phase A in background"
                description="Return immediately and poll the pipeline live."
              />
              <Toggle
                checked={form.use_native_language}
                onChange={(v) => set("use_native_language", v)}
                label="Native language messages"
                description="Generate in the prospect's detected language."
              />
              <Toggle
                checked={form.has_inmail_credits}
                onChange={(v) => set("has_inmail_credits", v)}
                label="LinkedIn InMail credits"
                description="Allow InMail steps in sequences."
              />
              <Toggle
                checked={form.send_enabled}
                onChange={(v) => set("send_enabled", v)}
                label="Real sends enabled"
                description="Master safety switch — off means mocked sends."
              />
              <Toggle
                checked={form.debug_mode}
                onChange={(v) => set("debug_mode", v)}
                label="Debug mode"
                description="Verbose logging across outreach modules."
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Sender company" optional>
                <Input value={form.sender_company} onChange={(e) => set("sender_company", e.target.value)} placeholder="My Company" />
              </Field>
              <Field label="Offer name" optional>
                <Input value={form.offer_name} onChange={(e) => set("offer_name", e.target.value)} placeholder="Default Offer" />
              </Field>
              <Field label="Approval mode">
                <Select value={form.approval_mode} onChange={(e) => set("approval_mode", e.target.value)}>
                  <option value="per_sequence">Per sequence — approve the whole plan once</option>
                  <option value="per_step_and_message">Per message — approve each message before it sends</option>
                </Select>
              </Field>
              <Field label="Message language" optional>
                <Input value={form.message_language} onChange={(e) => set("message_language", e.target.value)} placeholder="fr / de / es…" />
              </Field>
            </div>
            <Field label="Sender elevator pitch" optional>
              <Textarea value={form.sender_elevator_pitch} onChange={(e) => set("sender_elevator_pitch", e.target.value)} placeholder="One-paragraph pitch about your company…" className="min-h-[80px]" />
            </Field>
            <Field label="Solution summary" optional>
              <Textarea value={form.solution_summary} onChange={(e) => set("solution_summary", e.target.value)} placeholder="What your solution does in one or two lines…" className="min-h-[80px]" />
            </Field>
            <Field label="Call to action" optional>
              <Input value={form.cta} onChange={(e) => set("cta", e.target.value)} placeholder="e.g. Book a 15-min intro call" />
            </Field>
          </div>
        </Section>

        <Section
          icon={<ListOrdered className="h-4 w-4" />}
          title="AI sequence options"
          subtitle="Constraints forwarded to the sequence generator."
        >
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Max touches" optional>
                <Input type="number" value={form.max_touches} onChange={(e) => set("max_touches", e.target.value)} placeholder="6" />
              </Field>
              <Field label="Max days" optional>
                <Input type="number" value={form.max_days} onChange={(e) => set("max_days", e.target.value)} placeholder="14" />
              </Field>
              <Field label="Preferred first channel">
                <Select value={form.preferred_first_channel} onChange={(e) => set("preferred_first_channel", e.target.value)}>
                  <option value="linkedin_dm">LinkedIn DM</option>
                  <option value="email">Email</option>
                  <option value="linkedin_inmail">LinkedIn InMail</option>
                </Select>
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Toggle checked={form.seq_vary_tone} onChange={(v) => set("seq_vary_tone", v)} label="Vary tone across steps" />
              <Toggle checked={form.seq_include_breakup} onChange={(v) => set("seq_include_breakup", v)} label="Include break-up email" />
              <Toggle checked={form.seq_reference_previous} onChange={(v) => set("seq_reference_previous", v)} label="Reference previous steps" />
              <Toggle checked={form.seq_escalate_urgency} onChange={(v) => set("seq_escalate_urgency", v)} label="Escalate urgency" />
              <Toggle checked={form.seq_cross_channel} onChange={(v) => set("seq_cross_channel", v)} label="Mix channels" />
            </div>
          </div>
        </Section>

        <Section
          icon={<Sparkles className="h-4 w-4" />}
          title="Personality & voice"
          subtitle="How the message generator writes — traits, tone, phrases to avoid."
        >
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Base template">
                <Select value={form.base_template} onChange={(e) => set("base_template", e.target.value)}>
                  <option value="soft_sell">Soft sell</option>
                  <option value="value_based">Value based</option>
                  <option value="spin_selling">Spin selling</option>
                  <option value="direct">Direct</option>
                  <option value="consultative">Consultative</option>
                  <option value="custom">Custom</option>
                </Select>
              </Field>
              <Field label="Urgency level (1-5)">
                <Slider value={form.urgency_level} min={1} max={5} step={1} onChange={(v) => set("urgency_level", v)} />
              </Field>
              <Field label="Humor / sarcasm (0-10)">
                <Slider value={form.humor_sarcasm} min={0} max={10} step={1} onChange={(v) => set("humor_sarcasm", v)} />
              </Field>
              <Field label="Hooks per message" optional>
                <Input type="number" value={form.touchdowns_per_message} onChange={(e) => set("touchdowns_per_message", e.target.value)} placeholder="2" />
              </Field>
            </div>
            {form.base_template === "custom" && (
              <Field label="Custom template description">
                <Textarea value={form.custom_template_description} onChange={(e) => set("custom_template_description", e.target.value)} placeholder="Describe your ideal writing style…" />
              </Field>
            )}
            <Field label="Personality traits" optional>
              <TagInput tags={form.personality_traits} onChange={(v) => set("personality_traits", v)} placeholder="e.g. data-driven" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Always include phrases" optional>
                <TagInput tags={form.always_include_phrases} onChange={(v) => set("always_include_phrases", v)} placeholder="e.g. measurable ROI" />
              </Field>
              <Field label="Never use phrases" optional>
                <TagInput tags={form.never_use_phrases} onChange={(v) => set("never_use_phrases", v)} placeholder="e.g. leverage" />
              </Field>
            </div>
            <Field label="Voice samples" optional>
              <TagInput tags={form.voice_samples} onChange={(v) => set("voice_samples", v)} placeholder="Paste or describe a sample…" />
            </Field>
          </div>
        </Section>
      </div>

      {/* ── Right rail: launch panel ── */}
      <div className="lg:sticky lg:top-24 h-fit space-y-4">
        <Card>
          <div className="p-5">
            <p className="eyebrow">Launch panel</p>
            <h3 className="mt-1 text-base font-bold text-slate-100">Ready to run?</h3>
            <p className="mt-1 text-xs leading-relaxed text-mist">
              Saves every field to this campaign's own draft (<span className="font-mono">user_campaign_inputs</span>,
              <span className="font-mono"> blacklist_entries</span>, <span className="font-mono">campaign_weights</span>),
              then starts the Phase A pipeline{campaignId ? (
                <span className="font-mono text-slate-300"> for campaign {campaignId.slice(0, 8)}…</span>
              ) : (
                <span> for <span className="font-mono text-slate-300">{userId}</span> — a new draft is created on save</span>
              )}.
            </p>

            <ul className="mt-4 space-y-2 text-xs">
              {[
                { ok: form.icp_description_text.trim().length >= 20, label: `ICP brief — ${icpHintsCovered}/${ICP_HINTS.length} hint${icpHintsCovered === 1 ? "" : "s"} covered` },
                { ok: form.user_offering.trim().length > 0, label: "User offering" },
                { ok: true, label: `Blacklist (${form.blacklist_companies.length + form.blacklist_personas.length} entries)` },
                { ok: true, label: "Scoring weights" },
                { ok: form.auto_start_outreach, label: "Auto-start Phase B on completion" },
                { ok: form.approval_mode === "per_sequence" || form.approval_mode === "per_step_and_message", label: `Approval mode: ${form.approval_mode}` },
              ].map((item) => (
                <li key={item.label} className="flex items-center gap-2">
                  <span
                    className={cn(
                      "flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold",
                      item.ok ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/20 text-amber-300",
                    )}
                  >
                    {item.ok ? "✓" : "!"}
                  </span>
                  <span className={item.ok ? "text-slate-300" : "text-amber-200"}>{item.label}</span>
                </li>
              ))}
            </ul>

            <div className="mt-5 space-y-2">
              <Button
                variant="primary"
                className="w-full"
                disabled={!readyToLaunch}
                loading={saving || launching}
                onClick={saveAndLaunch}
              >
                <Rocket className="h-4 w-4" /> Save &amp; launch campaign
              </Button>
              <Button
                className="w-full"
                disabled={!readyToLaunch}
                loading={saving}
                onClick={persistAll}
              >
                <Save className="h-4 w-4" /> Save draft only
              </Button>
              <Button
                variant="ghost"
                className="w-full"
                disabled={loadingSaved || !campaignId}
                onClick={() => setLoaded(false)}
                title={
                  campaignId
                    ? "Reload this campaign's saved params"
                    : "Nothing saved yet — save once to create this campaign's draft"
                }
              >
                <Download className="h-4 w-4" />
                {loadingSaved ? "Loading…" : "Reload saved params"}
              </Button>
            </div>

            {loadingSaved && (
              <p className="mt-3 flex items-center gap-2 text-[11px] text-mist">
                <Loader2 className="h-3 w-3 animate-spin" /> Loading saved configuration…
              </p>
            )}
          </div>
        </Card>

        <Card>
          <div className="p-5">
            <p className="eyebrow">What happens next</p>
            <ol className="mt-3 space-y-3">
              {[
                ["Phase A", "ICP extracted → companies sourced & scored → intent → personas sourced & scored → top personas per approved company enriched."],
                ["Phase B", autoStartLabel(form.auto_start_outreach)],
                ["You approve", "Review the generated sequence, approve (or reject), and messages are generated & dispatched per step."],
              ].map(([t, d], i) => (
                <li key={t} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent to-glow text-[10px] font-bold text-white">
                    {i + 1}
                  </span>
                  <span>
                    <span className="block text-xs font-semibold text-slate-200">{t}</span>
                    <span className="mt-0.5 block text-[11px] leading-relaxed text-mist">{d}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </Card>
      </div>
    </div>
  );
}

function autoStartLabel(enabled: boolean): string {
  return enabled
    ? "Auto-starts the moment the lead package is ready — sequence generation runs automatically."
    : "You'll trigger it manually from the campaign's Outreach tab.";
}
