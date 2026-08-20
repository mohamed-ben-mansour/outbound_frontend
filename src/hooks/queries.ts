import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as api from "@/lib/api";
import type { CampaignParams, OutreachThread } from "@/lib/types";

// ── Health ────────────────────────────────────────────────

export function useHealth() {
  return useQuery({
    queryKey: ["health"],
    queryFn: api.getHealth,
    staleTime: 20_000,
    refetchInterval: 15_000,
    retry: 1,
  });
}

// ── Campaign params (draft, per campaign — T8) ────────────

export function useCampaignParams(userId: string | null) {
  return useQuery({
    queryKey: ["params", userId],
    queryFn: () => api.getCampaignParams(userId!),
    enabled: !!userId,
    retry: 1,
  });
}

export function useCampaignParamsById(campaignId: string | null) {
  return useQuery({
    queryKey: ["params", campaignId],
    queryFn: () => api.getCampaignParamsById(campaignId!),
    enabled: !!campaignId,
    retry: 1,
  });
}

export function useSaveCampaignParams() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CampaignParams) => api.saveCampaignParams(body),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["params", vars.user_id] });
    },
  });
}

export function useSaveCampaignParamsById(campaignId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CampaignParams) =>
      api.saveCampaignParamsById(campaignId!, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["params", campaignId] });
    },
  });
}

export function useCreateDraftCampaign() {
  return useMutation({
    mutationFn: (userId: string) => api.createDraftCampaign(userId),
  });
}

// ── Campaigns ─────────────────────────────────────────────

export function useCampaigns(userId: string | null, pollIntervalMs?: number) {
  return useQuery({
    queryKey: ["campaigns", userId],
    queryFn: () => api.listCampaigns(userId!),
    enabled: !!userId,
    refetchInterval: (query) => {
      const list = query.state.data?.campaigns ?? [];
      return list.some((c) => c.status === "running")
        ? pollIntervalMs ?? 8_000
        : false;
    },
  });
}

export function useStartCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => api.startCampaign(userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaigns"] });
    },
  });
}

export function useStartCampaignById() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (campaignId: string) => api.startCampaignById(campaignId),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      qc.invalidateQueries({ queryKey: ["campaign", res.campaign_id] });
    },
  });
}

export function useStopCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (campaignId: string) => api.stopCampaign(campaignId),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      qc.invalidateQueries({ queryKey: ["campaign", res.campaign_id] });
    },
  });
}

export function useDuplicateAndStartCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      sourceCampaignId,
      userId,
    }: {
      sourceCampaignId: string;
      userId: string;
    }) => api.duplicateAndStartCampaign(sourceCampaignId, userId),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      qc.invalidateQueries({ queryKey: ["campaign", res.campaign_id] });
    },
  });
}

export function useCampaign(campaignId: string | null, pollIntervalMs?: number) {
  return useQuery({
    queryKey: ["campaign", campaignId],
    queryFn: () => api.getCampaign(campaignId!),
    enabled: !!campaignId,
    refetchInterval: (query) => {
      const data = query.state.data;
      const status = data?.campaign?.status;
      // Keep polling while a refresh pass is in flight so "last refreshed" and
      // the refresh result update live once it finishes (a refresh can run on
      // a completed campaign, where the normal running-state poll is off).
      const refreshing = data?.refresh?.in_progress ?? false;
      return status === "running" || refreshing
        ? pollIntervalMs ?? 4_000
        : false;
    },
  });
}

export function useCampaignUsage(campaignId: string | null) {
  return useQuery({
    queryKey: ["campaign-usage", campaignId],
    queryFn: () => api.getCampaignUsage(campaignId!),
    enabled: !!campaignId,
    // Live-updating: refreshes, message gen, and sequence gen all push new
    // usage rows, so keep polling while the tab is open.
    refetchInterval: campaignId ? 10_000 : false,
  });
}

// ── Phase A results ───────────────────────────────────────

export function useRankedCompanies(campaignId: string | null) {
  return useQuery({
    queryKey: ["companies", campaignId],
    queryFn: () => api.getRankedCompanies(campaignId!),
    enabled: !!campaignId,
    select: (data) => data.companies,
  });
}

export function useRankedPersonas(campaignId: string | null) {
  return useQuery({
    queryKey: ["personas", campaignId],
    queryFn: () => api.getRankedPersonas(campaignId!),
    enabled: !!campaignId,
    select: (data) => data.personas,
  });
}

export function useDeclineCompanies(campaignId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (companyIds: string[]) =>
      api.declineCompanies(campaignId, companyIds),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["companies", campaignId] });
      qc.invalidateQueries({ queryKey: ["campaign", campaignId] });
    },
  });
}

export function useApproveCompanies(campaignId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (companyIds: string[]) =>
      api.approveCompanies(campaignId, companyIds),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["companies", campaignId] });
      qc.invalidateQueries({ queryKey: ["campaign", campaignId] });
    },
  });
}

// ── Campaign auto-refresh ─────────────────────────────────

export function useRefreshCampaign(campaignId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.refreshCampaign(campaignId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaign", campaignId] });
      qc.invalidateQueries({ queryKey: ["companies", campaignId] });
      qc.invalidateQueries({ queryKey: ["personas", campaignId] });
    },
  });
}

export function useRestartOutreachLead(campaignId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ leadId, stopExisting }: { leadId: string; stopExisting: boolean }) =>
      api.restartOutreachLead(campaignId, leadId, stopExisting),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaign", campaignId] });
      qc.invalidateQueries({ queryKey: ["threads", campaignId] });
    },
  });
}

export function useApproveRefreshCandidates(campaignId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (companyIds: string[]) =>
      api.approveRefreshCandidates(campaignId, companyIds),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaign", campaignId] });
      qc.invalidateQueries({ queryKey: ["companies", campaignId] });
      qc.invalidateQueries({ queryKey: ["personas", campaignId] });
    },
  });
}

// ── Phase B — outreach ────────────────────────────────────

export function useOutreachThreads(
  campaignId: string | null,
  pollIntervalMs?: number,
  campaignActive = false,
) {
  return useQuery({
    queryKey: ["threads", campaignId],
    queryFn: () => api.listOutreachThreads(campaignId!),
    enabled: !!campaignId,
    refetchInterval: (query) => {
      // Poll while the campaign is still active (Phase A / auto-started Phase B
      // may create threads at any moment) even before the first thread exists.
      if (campaignActive) return pollIntervalMs ?? 5_000;
      // refetchInterval reads the RAW query state, NOT the select-transformed
      // data.  query.state.data is { campaign_id, threads } (the API shape),
      // so extract .threads explicitly — never cast the object as an array.
      const raw = query.state.data as
        | { campaign_id?: string; threads?: OutreachThread[] }
        | undefined;
      const threads = raw?.threads ?? [];
      const active = threads.some((t) =>
        ["awaiting_approval", "action_required", "pending", "in_progress"].includes(
          t.status,
        ),
      );
      return active ? pollIntervalMs ?? 5_000 : false;
    },
    select: (data) => data.threads,
  });
}

export function useStartOutreach(campaignId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (leadIds?: string[]) => api.startOutreach(campaignId, leadIds),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["threads", campaignId] });
      qc.invalidateQueries({ queryKey: ["campaign", campaignId] });
    },
  });
}

export function useApproveThread(campaignId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      threadId,
      body,
    }: {
      threadId: string;
      body: { approved: boolean; feedback?: string };
    }) => api.approveThread(campaignId, threadId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["threads", campaignId] });
      qc.invalidateQueries({ queryKey: ["campaign", campaignId] });
      qc.invalidateQueries({ queryKey: ["workflowState"] });
    },
  });
}

export function useStopThread(campaignId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (threadId: string) => api.stopThread(campaignId, threadId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["threads", campaignId] });
      qc.invalidateQueries({ queryKey: ["campaign", campaignId] });
      qc.invalidateQueries({ queryKey: ["workflowState"] });
    },
  });
}

export function useResumeThread(campaignId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (threadId: string) => api.resumeThread(campaignId, threadId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["threads", campaignId] });
      qc.invalidateQueries({ queryKey: ["campaign", campaignId] });
      qc.invalidateQueries({ queryKey: ["workflowState"] });
    },
  });
}

export function useDeleteThread(campaignId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (threadId: string) => api.deleteThread(campaignId, threadId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["threads", campaignId] });
      qc.invalidateQueries({ queryKey: ["campaign", campaignId] });
      qc.invalidateQueries({ queryKey: ["workflowState"] });
    },
  });
}

export function useEditWorkflowStep(campaignId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      workflowId,
      stepNum,
      messageText,
      subjectText,
    }: {
      workflowId: string;
      stepNum: number;
      messageText: string;
      subjectText?: string | null;
    }) => api.editWorkflowStep(campaignId, workflowId, stepNum, messageText, subjectText),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["campaign", campaignId] });
      qc.invalidateQueries({ queryKey: ["threads", campaignId] });
      qc.invalidateQueries({ queryKey: ["workflowState", campaignId, vars.workflowId] });
    },
  });
}

export function useResolveStepAction(campaignId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      workflowId,
      stepNum,
      action,
    }: {
      workflowId: string;
      stepNum: number;
      action: string;
    }) => api.resolveWorkflowAction(campaignId, workflowId, stepNum, action),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaign", campaignId] });
      qc.invalidateQueries({ queryKey: ["threads", campaignId] });
      qc.invalidateQueries({ queryKey: ["workflowState"] });
    },
  });
}

export function useUpdateWorkflowSequence(campaignId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ workflowId, steps }: { workflowId: string; steps: api.UpdateSequenceStep[] }) =>
      api.updateWorkflowSequence(campaignId, workflowId, steps),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["campaign", campaignId] });
      qc.invalidateQueries({ queryKey: ["threads", campaignId] });
      qc.invalidateQueries({ queryKey: ["workflowState", campaignId, vars.workflowId] });
    },
  });
}

export function useModifyThread(campaignId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ threadId, steps }: { threadId: string; steps: api.UpdateSequenceStep[] }) =>
      api.modifyThread(campaignId, threadId, steps),
    onSuccess: (_data) => {
      qc.invalidateQueries({ queryKey: ["campaign", campaignId] });
      qc.invalidateQueries({ queryKey: ["threads", campaignId] });
    },
  });
}

export function useWorkflowState(
  campaignId: string | null,
  workflowId: string | null,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["workflowState", campaignId, workflowId],
    queryFn: () => api.getWorkflowState(campaignId!, workflowId!),
    enabled: !!campaignId && !!workflowId && enabled,
    retry: 1,
  });
}

export function useSignalStep(campaignId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      workflowId,
      signal,
      stepNum,
      feedback,
    }: {
      workflowId: string;
      signal: "approve-step" | "skip-step" | "regenerate-step";
      stepNum: number;
      feedback?: string;
    }) =>
      api.signalWorkflowStep(
        campaignId,
        workflowId,
        signal,
        stepNum,
        feedback,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaign", campaignId] });
      qc.invalidateQueries({ queryKey: ["threads", campaignId] });
      qc.invalidateQueries({ queryKey: ["workflowState"] });
    },
  });
}

export function useAuditTrail(campaignId: string | null) {
  return useQuery({
    queryKey: ["audit", campaignId],
    queryFn: () => api.getAuditTrail(campaignId!),
    enabled: !!campaignId,
    select: (data) => data.events,
  });
}

export function useObservability(campaignId: string | null) {
  return useQuery({
    queryKey: ["observability", campaignId],
    queryFn: () => api.getObservability(campaignId!),
    enabled: !!campaignId,
    retry: 1,
  });
}

export function useProspectReply(campaignId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.handleProspectReply(campaignId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["threads", campaignId] });
      qc.invalidateQueries({ queryKey: ["campaign", campaignId] });
    },
  });
}

// Re-export the raw detail type for useCampaign
export type CampaignDetailRaw = Awaited<ReturnType<typeof api.getCampaign>>;
