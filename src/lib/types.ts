/**
 * TypeScript types mirroring the Nudge Global Orchestrator API
 * (nudge_ai_outbound_orchestrator/nudge-global-orchestrator/app/api/__init__.py).
 * Backend is the source of truth — update these if the API changes.
 */

// ── Campaign parameters (user draft, persisted to user_campaign_inputs) ──

export interface PersonalityConfig {
  base_template?:
    | "soft_sell"
    | "value_based"
    | "spin_selling"
    | "direct"
    | "consultative"
    | "custom";
  custom_template_description?: string;
  personality_traits?: string[];
  always_include_phrases?: string[];
  never_use_phrases?: string[];
  urgency_level?: number; // 1-5
  humor_sarcasm?: number; // 0-10
  touchdowns_per_message?: number;
  voice_samples?: string[];
}

export interface CampaignParams {
  user_id: string;
  campaign_name?: string;
  icp_description_text?: string;
  user_offering?: string;
  blacklist?: { companies?: string[]; personas?: string[] };
  configurable_weights?: Record<string, number>;
  company_limit?: number;
  run_async?: boolean;
  auto_approve_all?: boolean;
  auto_start_outreach?: boolean;
  /** Auto-refresh schedule for a started campaign: off | daily | weekly. */
  refresh_frequency?: "off" | "daily" | "weekly";
  /** ISO timestamp of the last refresh pass on this campaign (null = never). */
  last_refreshed_at?: string | null;
  sender_company?: string;
  sender_elevator_pitch?: string;
  offer_name?: string;
  solution_summary?: string;
  cta?: string;
  approval_mode?: "per_sequence" | "per_step_and_message";
  use_native_language?: boolean;
  message_language?: string;
  has_inmail_credits?: boolean;
  debug_mode?: boolean;
  send_enabled?: boolean;
  max_touches?: number;
  max_days?: number;
  preferred_first_channel?: "email" | "linkedin_dm" | "linkedin_inmail";
  sequence_options?: Record<string, boolean>;
  stage_instructions?: Record<string, string>;
  personality_config?: PersonalityConfig;
  // ICP sub-attributes (populated by pipeline or editable via PATCH)
  industries?: string[];
  target_countries?: string[];
  target_continents?: string[];
  target_roles?: string[];
  company_size?: { min?: number; max?: number };
  revenue_range?: { min?: number; max?: number };
  tech_stack?: string[];
  growth_stage?: string;
  funding_stage?: string;
  target_cities?: string[];
}

// ── Campaigns ─────────────────────────────────────────────

export type CampaignStatus =
  | "draft"
  | "running"
  | "completed"
  | "failed"
  | "stopped"
  | "cancelled"
  | "awaiting_approval";

export interface CampaignSummary {
  id: string;
  user_id: string;
  campaign_name?: string;
  status: CampaignStatus;
  stage: string;
  /** True user-facing status derived from (status, stage). */
  ui_status?: string;
  raw_icp?: string | null;
  user_offering?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Campaign {
  id: string;
  user_id: string;
  campaign_name?: string | null;
  status: CampaignStatus;
  stage: string;
  /** True user-facing status derived from (status, stage) — e.g.
   *  waiting_company_approval, waiting_sequence_approval, sending. */
  ui_status?: string;
  qualifier_campaign_id?: string | null;
  raw_icp?: string | null;
  user_offering?: string | null;
  icp_features?: Record<string, unknown> | null;
  outreach_config?: Record<string, unknown> | null;
  error?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CampaignUsage {
  campaign_id: string;
  apollo_credits: {
    lead_credits_consumed: number;
    direct_dial_credits_consumed: number;
    ai_credits_consumed: number;
  };
  modules: Record<
    string,
    {
      total_tokens: number;
      tokens_in: number;
      tokens_out: number;
      total_llm_calls: number;
    }
  >;
  totals: {
    total_tokens: number;
    tokens_in: number;
    tokens_out: number;
    total_llm_calls: number;
  };
  generated_at: string;
}

export interface Artifact {
  id: string;
  stage: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface FinalPackage {
  lead_id: string;
  package: Record<string, unknown>;
  created_at: string;
}

export interface OutreachThread {
  id: string;
  campaign_id: string;
  lead_id: string;
  thread_id?: string | null;
  workflow_id?: string | null;
  status: string;
  prospect_name?: string | null;
  prospect_job_title?: string | null;
  prospect_email?: string | null;
  prospect_email_status?: string | null;
  prospect_country?: string | null;
  prospect_city?: string | null;
  prospect_linkedin_url?: string | null;
  prospect_linkedin_profile_id?: string | null;
  prospect_company?: string | null;
  is_connected_on_linkedin: boolean;
  is_manual_sequence: boolean;
  sequence_score?: number | null;
  sequence_critique?: string | null;
  created_at: string;
  updated_at: string;
}

export interface OutreachStep {
  id: string;
  campaign_id: string;
  thread_id?: string | null;
  workflow_id?: string | null;
  step_num: number;
  action_type: string;
  channel: string;
  message_text?: string | null;
  subject?: string | null;
  ai_write: boolean;
  source?: string;
  status: string;
  quality_score?: number | null;
  quality_threshold?: number | null;
  generation_context_json?: string | null;
  generation_warnings_json?: string | null;
  error?: string | null;
  sent_at?: string | null;
  wait_delay_seconds: number;
  day_offset: number;
  time_of_day: string;
  strategy_notes?: string;
  scheduled_timestamp_utc?: string | null;
  timing_justification?: string | null;
  sequence_architecture_rationale?: string | null;
  timezone_offset?: number | null;
  timezone_name?: string | null;
  timezone_iana?: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkflowMessage {
  message?: string | null;
  subject?: string | null;
  warnings?: string[];
  memory_context?: Record<string, unknown> | null;
  generation_context?: Record<string, unknown> | null;
  quality_score?: number | null;
}

export interface WorkflowStep {
  step_num: number;
  action_type: string;
  channel: string;
  day_offset: number;
  time_of_day: string;
  wait_delay_seconds: number;
  strategy_notes?: string;
  scheduled_timestamp_utc?: string | null;
  message?: string | WorkflowMessage | null;
  subject?: string | null;
  ai_write?: boolean;
  status?: string;
  quality_score?: number | null;
  quality_threshold?: number | null;
  generation_context?: Record<string, unknown> | null;
  generation_warnings?: string[];
  error?: string | null;
  sent_at?: string | null;
  action_required?: Record<string, unknown> | string | null;
  available_actions?: Array<{ action: string; label: string }>;
  timezone_offset?: number | null;
  timezone_name?: string;
  timezone_iana?: string;
  [key: string]: unknown;
}

export interface WorkflowState {
  state?: {
    status?: string;
    steps?: WorkflowStep[];
    persona?: Record<string, unknown>;
    personality_analysis?: string;
    total_steps?: number;
    current_step?: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface RankedCompany {
  id: string;
  company_name: string;
  apollo_company_id: string;
  status: string;
  score: number | null;
  /** Outreach state derived from threads: null | 'dispatched' | 'in_progress' | 'completed' | … */
  outreach_status?: string | null;
  /** True when this company was contacted before and re-entered on fresh intent signals. */
  reengagement?: boolean;
}

export interface RankedPersona {
  id: string;
  persona_name: string;
  apollo_persona_id: string;
  apollo_company_id: string;
  linkedin_url: string;
  persona_score?: number | null;
}

export interface AuditEvent {
  id: string;
  campaign_id: string;
  workflow_id?: string | null;
  event_type: string;
  actor: string;
  payload?: Record<string, unknown> | null;
  created_at: string;
}

export interface CampaignDetail {
  campaign: Campaign;
  artifacts: Artifact[];
  packages: FinalPackage[];
  outreach_threads: OutreachThread[];
  outreach_steps: OutreachStep[];
  personas: RankedPersona[];
  /** Auto-refresh schedule + last run (added by the refresh feature). */
  refresh?: {
    refresh_frequency: "off" | "daily" | "weekly";
    last_refreshed_at: string | null;
    /** True while a refresh pass (manual or scheduler-triggered) is running. */
    in_progress: boolean;
  };
}

export interface CompanyListResponse {
  campaign_id: string;
  count: number;
  companies: RankedCompany[];
}

export interface PersonaListResponse {
  campaign_id: string;
  count: number;
  personas: RankedPersona[];
}

export interface Observability {
  [key: string]: unknown;
}

// ── API responses ─────────────────────────────────────────

export interface SaveParamsResponse {
  user_id: string;
  campaign_id?: string | null;
  status: string;
  message: string;
}

export interface UpdateCampaignParamsResponse {
  user_id: string;
  status: string;
  message: string;
  params: CampaignParams;
  updated_at: string;
}

export interface GetParamsResponse {
  user_id: string;
  params: CampaignParams;
  created_at: string;
  updated_at: string;
}

export interface StartCampaignResponse {
  campaign_id: string;
  status: string;
  stage: string;
  message: string;
}

export interface CreateDraftCampaignResponse {
  campaign_id: string;
  status: string;
  stage: string;
  message: string;
}

export interface CampaignListResponse {
  user_id: string;
  count: number;
  campaigns: CampaignSummary[];
}

export interface DeclineResponse {
  campaign_id: string;
  status: string;
  message: string;
  declined: string[];
  already_declined: string[];
  not_found: string[];
}

export interface ApproveCompaniesResponse {
  campaign_id: string;
  status: string;
  message: string;
  approved: string[];
}

export interface AuditResponse {
  campaign_id: string;
  count: number;
  events: AuditEvent[];
}
