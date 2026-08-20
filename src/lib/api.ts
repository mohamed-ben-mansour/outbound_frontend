import type {
  ApproveCompaniesResponse,
  AuditResponse,
  CampaignDetail,
  CampaignListResponse,
  CampaignParams,
  CampaignUsage,
  CompanyListResponse,
  CreateDraftCampaignResponse,
  DeclineResponse,
  GetParamsResponse,
  Observability,
  OutreachThread,
  PersonaListResponse,
  SaveParamsResponse,
  StartCampaignResponse,
  UpdateCampaignParamsResponse,
  WorkflowState,
} from "./types";

/**
 * API client for the Nudge Global Orchestrator (FastAPI, default :8100).
 *
 * Authentication is handled via an httpOnly cookie set by the backend.
 * All requests include ``credentials: "include"`` so the browser attaches
 * the cookie automatically — no manual Authorization header needed.
 */

export const API_BASE: string =
  (import.meta.env.VITE_API_URL as string | undefined) ||
  "http://localhost:8100";

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// ── 401 handler ────────────────────────────────────────────────────────
// Registered by AuthContext/App so unauthenticated responses redirect to login.
let _onAuthFailure: (() => void) | null = null;

/** Called by App to register a 401 handler (redirects to /login). */
export function setOnAuthFailure(handler: (() => void) | null) {
  _onAuthFailure = handler;
}

// ── Core request function ──────────────────────────────────────────────
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",   // ← send httpOnly cookie cross-origin
    headers,
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (typeof body?.detail === "string") detail = body.detail;
      else if (typeof body?.message === "string") detail = body.message;
    } catch {
      /* keep default */
    }
    // On 401: cookie expired or invalid — clear auth and redirect to login
    if (res.status === 401 && _onAuthFailure) {
      _onAuthFailure();
    }
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

const post = <T>(path: string, body: unknown) =>
  request<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) });
const patch = <T>(path: string, body: unknown) =>
  request<T>(path, { method: "PATCH", body: JSON.stringify(body ?? {}) });

// ── Health ────────────────────────────────────────────────

export const getHealth = () =>
  request<{ status: string; mock?: boolean }>("/health");

// ── Auth ─────────────────────────────────────────────────

export interface AuthUserInfo {
  user_id: string;
  email: string;
  display_name: string;
}

export const authMe = () => request<AuthUserInfo>("/auth/me");

export const authLogout = () =>
  request<{ message: string }>("/auth/logout", { method: "POST" });

export interface LoginResponse {
  user_id: string;
  email: string;
  display_name: string;
}

export const authLogin = (email: string, password: string) =>
  request<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

export const authRegister = (
  email: string,
  password: string,
  display_name?: string,
) =>
  request<LoginResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, display_name: display_name ?? "" }),
  });

// ── Campaign parameters (draft persisted per campaign, T8) ─

/** Legacy user-scoped save — routes to the user's default draft campaign. */
export const saveCampaignParams = (body: CampaignParams) =>
  post<SaveParamsResponse>("/campaigns/params", body);

/** Legacy user-scoped getter — returns the user's default draft campaign params. */
export const getCampaignParams = (userId: string) =>
  request<GetParamsResponse>(`/campaigns/params/${encodeURIComponent(userId)}`);

export const patchCampaignParams = (
  userId: string,
  updates: Partial<CampaignParams>,
) =>
  patch<GetParamsResponse>(
    `/campaigns/params/${encodeURIComponent(userId)}`,
    updates,
  );

// ── Campaign lifecycle ────────────────────────────────────

/** Create a draft campaign so each campaign keeps its own ICP/offering/config. */
export const createDraftCampaign = (userId: string) =>
  post<CreateDraftCampaignResponse>("/campaigns", { user_id: userId });

/** Save draft params for a specific campaign. */
export const saveCampaignParamsById = (
  campaignId: string,
  body: CampaignParams,
) =>
  post<SaveParamsResponse>(
    `/campaigns/${encodeURIComponent(campaignId)}/params`,
    body,
  );

/** Load draft params saved on a specific campaign. */
export const getCampaignParamsById = (campaignId: string) =>
  request<GetParamsResponse>(
    `/campaigns/${encodeURIComponent(campaignId)}/params`,
  );

export const patchCampaignParamsById = (
  campaignId: string,
  updates: Partial<CampaignParams>,
) =>
  patch<UpdateCampaignParamsResponse>(
    `/campaigns/${encodeURIComponent(campaignId)}/params`,
    updates,
  );

/** Start a specific campaign with its own saved params. */
export const startCampaignById = (campaignId: string) =>
  post<StartCampaignResponse>(
    `/campaigns/${encodeURIComponent(campaignId)}/start`,
    {},
  );

/** Legacy user-scoped start — starts the user's default draft campaign. */
export const startCampaign = (userId: string) =>
  post<StartCampaignResponse>("/campaigns/start", { user_id: userId });

/**
 * Duplicate an existing campaign's params into a fresh draft and start it.
 * Used by the "Launch" / "Retry" buttons so a re-run never reuses another
 * campaign's config (T8).
 */
export const duplicateAndStartCampaign = async (
  sourceCampaignId: string,
  userId: string,
): Promise<StartCampaignResponse> => {
  const saved = await getCampaignParamsById(sourceCampaignId);
  const draft = await createDraftCampaign(userId);
  await saveCampaignParamsById(draft.campaign_id, {
    ...saved.params,
    user_id: userId,
  });
  return startCampaignById(draft.campaign_id);
};

export const listCampaigns = (userId: string) =>
  request<CampaignListResponse>(`/campaigns?user_id=${encodeURIComponent(userId)}`);

/** Stop a campaign (terminal): aborts in-flight passes, frees its companies. */
export const stopCampaign = (campaignId: string) =>
  post<{ campaign_id: string; status: string; message: string }>(
    `/campaigns/${encodeURIComponent(campaignId)}/stop`,
    {},
  );

export const getCampaign = (campaignId: string) =>
  request<CampaignDetail>(`/campaigns/${encodeURIComponent(campaignId)}`);

export const getCampaignUsage = (campaignId: string) =>
  request<CampaignUsage>(`/campaigns/${encodeURIComponent(campaignId)}/usage`);

// ── Campaign auto-refresh (user-set frequency + manual refresh) ──

/** Trigger a refresh pass now (re-fetch intent + discover new companies). */
export const refreshCampaign = (campaignId: string) =>
  post<{ campaign_id: string; status: string; message: string }>(
    `/campaigns/${encodeURIComponent(campaignId)}/refresh`,
    {},
  );

/** Approve pending_review refresh candidates (HITL campaigns). */
export const approveRefreshCandidates = (
  campaignId: string,
  companyIds: string[],
) =>
  post<{ campaign_id: string; status: string; message: string }>(
    `/campaigns/${encodeURIComponent(campaignId)}/refresh/approve`,
    { company_ids: companyIds },
  );

// ── Phase A results ───────────────────────────────────────

export const getRankedCompanies = (campaignId: string) =>
  request<CompanyListResponse>(
    `/campaigns/${encodeURIComponent(campaignId)}/companies`,
  );

export const getRankedPersonas = (campaignId: string) =>
  request<PersonaListResponse>(
    `/campaigns/${encodeURIComponent(campaignId)}/personas`,
  );

export const declineCompanies = (campaignId: string, companyIds: string[]) =>
  post<DeclineResponse>(`/campaigns/${encodeURIComponent(campaignId)}/companies/decline`, {
    company_ids: companyIds,
  });

export const approveCompanies = (campaignId: string, companyIds: string[]) =>
  post<ApproveCompaniesResponse>(
    `/campaigns/${encodeURIComponent(campaignId)}/companies/approve`,
    {
      company_ids: companyIds,
    },
  );

// ── Phase B — outreach ────────────────────────────────────

export const startOutreach = (campaignId: string, leadIds?: string[]) =>
  post<{ campaign_id: string; status: string; message: string }>(
    `/campaigns/${encodeURIComponent(campaignId)}/outreach${
      leadIds?.length
        ? `?lead_ids=${leadIds.map(encodeURIComponent).join(",")}`
        : ""
    }`,
    {},
  );

/**
 * Start/restart outreach for ONE prospect regardless of state. When
 * stopExisting is true the old thread/workflow is stopped and soft-deleted
 * first (user chose "stop old & start new"); false spawns a second workflow
 * ("run anyway" escape hatch).
 */
export const restartOutreachLead = (
  campaignId: string,
  leadId: string,
  stopExisting: boolean,
) =>
  post<{ campaign_id: string; status: string; message: string }>(
    `/campaigns/${encodeURIComponent(campaignId)}/outreach/lead/restart`,
    { lead_id: leadId, stop_existing: stopExisting },
  );

export const listOutreachThreads = (campaignId: string) =>
  request<{ campaign_id: string; threads: OutreachThread[] }>(
    `/campaigns/${encodeURIComponent(campaignId)}/outreach`,
  );

export const approveThread = (
  campaignId: string,
  threadId: string,
  body: { approved: boolean; feedback?: string },
) =>
  post<Record<string, unknown>>(
    `/campaigns/${encodeURIComponent(campaignId)}/outreach/${encodeURIComponent(
      threadId,
    )}/approve`,
    body,
  );

export const signalWorkflowStep = (
  campaignId: string,
  workflowId: string,
  signal: "approve-step" | "skip-step" | "regenerate-step",
  stepNum: number,
  feedback?: string,
) =>
  post<Record<string, unknown>>(
    `/campaigns/${encodeURIComponent(campaignId)}/outreach/workflow/${encodeURIComponent(
      workflowId,
    )}/${signal}`,
    { step_num: stepNum, feedback: feedback ?? "" },
  );

export const editWorkflowStep = (
  campaignId: string,
  workflowId: string,
  stepNum: number,
  messageText: string,
  subjectText?: string | null,
) =>
  post<Record<string, unknown>>(
    `/campaigns/${encodeURIComponent(campaignId)}/outreach/workflow/${encodeURIComponent(
      workflowId,
    )}/edit-step`,
    {
      step_num: stepNum,
      message_text: messageText,
      subject_text: subjectText ?? null,
    },
  );

export interface UpdateSequenceStep {
  step_num: number;
  action_type: string;
  channel: string;
  scheduled_date?: string | null;
  scheduled_time?: string | null;
  strategy_notes: string;
}

export const updateWorkflowSequence = (
  campaignId: string,
  workflowId: string,
  steps: UpdateSequenceStep[],
) =>
  post<Record<string, unknown>>(
    `/campaigns/${encodeURIComponent(campaignId)}/outreach/workflow/${encodeURIComponent(
      workflowId,
    )}/update-sequence`,
    { steps, approve: false },
  );

export const modifyThread = (
  campaignId: string,
  threadId: string,
  steps: UpdateSequenceStep[],
) =>
  post<Record<string, unknown>>(
    `/campaigns/${encodeURIComponent(campaignId)}/outreach/${encodeURIComponent(
      threadId,
    )}/modify`,
    { steps },
  );

export const getWorkflowState = (campaignId: string, workflowId: string) =>
  request<WorkflowState>(
    `/campaigns/${encodeURIComponent(campaignId)}/outreach/workflow/${encodeURIComponent(
      workflowId,
    )}/state`,
  );

export const resolveWorkflowAction = (
  campaignId: string,
  workflowId: string,
  stepNum: number,
  action: string,
) =>
  post<Record<string, unknown>>(
    `/campaigns/${encodeURIComponent(campaignId)}/outreach/workflow/${encodeURIComponent(
      workflowId,
    )}/resolve-action`,
    { step_num: stepNum, action },
  );

export const getAuditTrail = (campaignId: string) =>
  request<AuditResponse>(
    `/campaigns/${encodeURIComponent(campaignId)}/outreach/audit`,
  );

export const getObservability = (campaignId: string) =>
  request<Observability>(
    `/campaigns/${encodeURIComponent(campaignId)}/outreach/observability`,
  );

export const handleProspectReply = (campaignId: string) =>
  post<Record<string, unknown>>(
    `/campaigns/${encodeURIComponent(campaignId)}/reply`,
    {},
  );

export const stopThread = (campaignId: string, threadId: string) =>
  post<Record<string, unknown>>(
    `/campaigns/${encodeURIComponent(campaignId)}/outreach/${encodeURIComponent(
      threadId,
    )}/stop`,
    {},
  );

export const resumeThread = (campaignId: string, threadId: string) =>
  post<Record<string, unknown>>(
    `/campaigns/${encodeURIComponent(campaignId)}/outreach/${encodeURIComponent(
      threadId,
    )}/resume`,
    {},
  );

export const deleteThread = (campaignId: string, threadId: string) =>
  post<Record<string, unknown>>(
    `/campaigns/${encodeURIComponent(campaignId)}/outreach/${encodeURIComponent(
      threadId,
    )}/delete`,
    {},
  );
