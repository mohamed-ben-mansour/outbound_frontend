import { useMemo, useState } from "react";
import {
  Check,
  X,
  MessageSquareText,
  Send,
  CircleAlert,
  Linkedin,
  Mail,
  RotateCcw,
  Sparkles,
  Square,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Modal, PulseBar, Skeleton } from "@/components/ui";
import { initials, timeAgo } from "@/lib/utils";
import { mergeSteps } from "@/lib/enrich";
import {
  useApproveThread,
  useDeleteThread,
  useEditWorkflowStep,
  useModifyThread,
  useResolveStepAction,
  useResumeThread,
  useSignalStep,
  useStopThread,
  useUpdateWorkflowSequence,
  useWorkflowState,
} from "@/hooks/queries";
import type { CampaignDetail, OutreachThread } from "@/lib/types";
import SequenceTimeline from "@/components/SequenceTimeline";

export default function ThreadReview({
  campaignId,
  thread,
  detail,
}: {
  campaignId: string;
  thread: OutreachThread;
  detail: CampaignDetail | undefined;
}) {
  const [feedback, setFeedback] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [expanded, setExpanded] = useState(true);

  // thread_id is the LangGraph approval thread (api_thread_*), not a
  // Temporal workflow. Temporal exists only after sequence approval.
  const workflowId =
    thread.workflow_id && !thread.workflow_id.startsWith("api_thread_")
      ? thread.workflow_id
      : null;
  const workflowState = useWorkflowState(
    campaignId,
    workflowId,
    !!workflowId && expanded,
  );

  // Before approval, persisted blueprint steps are keyed by the LangGraph
  // thread_id. After approval, they are keyed by the Temporal workflow_id.
  const stepStorageId = workflowId || thread.thread_id || null;
  const dbSteps = useMemo(
    () => (detail?.outreach_steps ?? []).filter((s) => s.workflow_id === stepStorageId),
    [detail?.outreach_steps, stepStorageId],
  );

  const steps = useMemo(
    () => mergeSteps(dbSteps, workflowState.data),
    [dbSteps, workflowState.data],
  );

  const approve = useApproveThread(campaignId);
  const signal = useSignalStep(campaignId);
  const editStep = useEditWorkflowStep(campaignId);
  const updateSequence = useUpdateWorkflowSequence(campaignId);
  const modifyThread = useModifyThread(campaignId);

  const awaiting = ["awaiting_approval", "pending", "action_required"].includes(
    thread.status,
  );
  const inProgress = thread.status === "in_progress";
  const isDeleted = thread.status === "deleted";
  const isStopped = thread.status === "stopped";
  // Approval mode drives what the step timeline shows: per_sequence workflows
  // have no per-step approval gates, so step-level buttons must be hidden.
  const approvalMode =
    (
      (detail?.campaign?.outreach_config as Record<string, unknown> | null | undefined)
        ?.approval_mode as string | undefined
    ) ?? "per_sequence";

  const stop = useStopThread(campaignId);
  const resume = useResumeThread(campaignId);
  const remove = useDeleteThread(campaignId);
  const resolveAction = useResolveStepAction(campaignId);
  const [confirmStop, setConfirmStop] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const threadRef = thread.thread_id ?? thread.id;

  const onStop = () => {
    stop.mutate(threadRef, {
      onSuccess: () => {
        toast.success("Sequence paused — restart to resume");
        setConfirmStop(false);
      },
      onError: (e) => toast.error(e.message),
    });
  };

  const onResume = () => {
    resume.mutate(threadRef, {
      onSuccess: () => {
        toast.success("Sequence resumed — remaining steps will continue");
      },
      onError: (e) => toast.error(e.message),
    });
  };

  const onDelete = () => {
    remove.mutate(threadRef, {
      onSuccess: () => {
        toast.success("Sequence deleted — kept in the record, workflow stopped");
        setConfirmDelete(false);
      },
      onError: (e) => toast.error(e.message),
    });
  };

  const onResolveStepAction = (stepNum: number, action: string) => {
    if (!workflowId) return;
    resolveAction.mutate(
      { workflowId, stepNum, action },
      {
        onSuccess: () =>
          toast.success(`Step ${stepNum}: resolution applied — workflow resumed`),
        onError: (e) => toast.error(e.message),
      },
    );
  };

  const onApprove = (approved: boolean) => {
    approve.mutate(
      { threadId: thread.thread_id ?? thread.id, body: { approved, feedback } },
      {
        onSuccess: () => {
          toast.success(approved ? "Sequence approved — dispatch underway" : "Sequence rejected");
          setFeedback("");
        },
        onError: (e) => toast.error(e.message),
      },
    );
  };

  const onSignalStep = (
    sig: "approve-step" | "skip-step" | "regenerate-step",
    stepNum: number,
    fb?: string,
  ) => {
    if (!workflowId) return;
    signal.mutate(
      { workflowId, signal: sig, stepNum, feedback: fb },
      {
        onSuccess: () =>
          toast.success(
            sig === "approve-step"
              ? `Step ${stepNum} approved`
              : sig === "skip-step"
                ? `Step ${stepNum} skipped`
                : `Regenerating step ${stepNum}…`,
          ),
        onError: (e) => toast.error(e.message),
      },
    );
  };

  const hasWorkflowSteps = steps.length > 0;

  const onEditStep = (stepNum: number, messageText: string, subjectText?: string | null) => {
    if (!workflowId) return;
    editStep.mutate(
      { workflowId, stepNum, messageText, subjectText },
      {
        onSuccess: () => toast.success(`Step ${stepNum} saved — approve it when ready`),
        onError: (e) => toast.error(e.message),
      },
    );
  };

  const onEditSequence = (sequenceSteps: Array<{
    step_num: number;
    action_type: string;
    channel: string;
    scheduled_date: string;
    scheduled_time: string;
    strategy_notes: string;
  }>) => {
    if (workflowId) {
      updateSequence.mutate(
        { workflowId, steps: sequenceSteps },
        {
          onSuccess: () => toast.success("Sequence saved — no messages regenerated or sent"),
          onError: (e) => toast.error(e.message),
        },
      );
    } else if (thread.thread_id) {
      modifyThread.mutate(
        { threadId: thread.thread_id, steps: sequenceSteps },
        {
          onSuccess: () => toast.success("Sequence updated — approve to dispatch this version"),
          onError: (e) => toast.error(e.message),
        },
      );
    }
  };

  return (
    <div className={`card overflow-hidden ${isDeleted ? "opacity-60" : ""}`}>
      {/* ── Prospect header ── */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-white/[0.02]"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent to-glow text-xs font-bold text-white">
          {initials(thread.prospect_name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold text-slate-100">
              {thread.prospect_name || "Unknown prospect"}
            </p>
            <Badge
              tone={
                thread.status === "awaiting_approval" || thread.status === "action_required"
                  ? "warn"
                  : thread.status.includes("failed")
                    ? "danger"
                    : thread.status === "approved" || thread.status === "dispatched"
                      ? "ok"
                      : "accent"
              }
              dot
            >
              {thread.status.replace(/_/g, " ")}
            </Badge>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-mist">
            {thread.prospect_job_title && <span>{thread.prospect_job_title}</span>}
            {thread.prospect_company && <span>· {thread.prospect_company}</span>}
            {thread.prospect_country && <span>· {thread.prospect_country}</span>}
          </div>
        </div>
        <div className="hidden shrink-0 items-center gap-2 sm:flex">
          {thread.prospect_email && (
            <a
              href={`mailto:${thread.prospect_email}`}
              title={thread.prospect_email}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-mist transition-colors hover:border-accent/40 hover:text-white"
            >
              <Mail className="h-3.5 w-3.5" />
            </a>
          )}
          {thread.prospect_linkedin_url && (
            <a
              href={thread.prospect_linkedin_url}
              target="_blank"
              rel="noreferrer"
              title="LinkedIn profile"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-mist transition-colors hover:border-accent/40 hover:text-white"
            >
              <Linkedin className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
        <span className="shrink-0 text-[10px] text-mist">{timeAgo(thread.created_at)}</span>
      </button>

      {expanded && (
        <div className="border-t border-line px-5 py-4">
          {(thread.sequence_score != null || thread.sequence_critique) && (
            <div className="mb-4 flex flex-wrap items-start gap-3 rounded-xl border border-accent/20 bg-accent/[0.06] px-3.5 py-3">
              {thread.sequence_score != null && (
                <div className="flex shrink-0 flex-col items-center rounded-lg border border-accent/30 bg-ink-900/60 px-3 py-1.5">
                  <span className="text-[9px] uppercase tracking-wider text-mist">AI score</span>
                  <span className="font-mono text-lg font-bold text-accent-soft">{Math.round(thread.sequence_score)}</span>
                </div>
              )}
              {thread.sequence_critique && (
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-mist">Sequence critique</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-300">{thread.sequence_critique}</p>
                </div>
              )}
            </div>
          )}
          {workflowState.isFetching && steps.length === 0 ? (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : hasWorkflowSteps ? (
            <SequenceTimeline
              steps={steps}
              threadStatus={thread.status}
              approvalMode={approvalMode}
              onSignal={onSignalStep}
              onEditStep={onEditStep}
              onEditSequence={onEditSequence}
              onResolveAction={onResolveStepAction}
              isConnected={thread.is_connected_on_linkedin}
              hasInmailCredits={
                !!(
                  detail?.campaign?.outreach_config as Record<string, unknown> | null | undefined
                )?.has_inmail_credits
              }
              // Channel availability — mirrors the backend enforcement so the
              // editor hides/blocks channels this prospect can't reach.
              hasEmail={!!thread.prospect_email?.trim()}
              emailUsable={
                !!thread.prospect_email?.trim() &&
                !["catchall", "risky"].includes((thread.prospect_email_status || "").toLowerCase())
              }
              hasLinkedin={
                !!thread.prospect_linkedin_url?.trim() ||
                !!thread.prospect_linkedin_profile_id?.trim()
              }
              busySignal={
                signal.isPending ||
                editStep.isPending ||
                updateSequence.isPending ||
                modifyThread.isPending ||
                resolveAction.isPending
                  ? `step-action-${signal.variables?.stepNum ?? "sequence"}`
                  : null
              }
            />
          ) : (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <MessageSquareText className="h-6 w-6 text-mist/50" />
              <p className="text-xs text-mist">
                {thread.status === "awaiting_approval"
                  ? "Sequence is generating — steps will appear here."
                  : "No sequence steps recorded for this thread yet."}
              </p>
              {workflowState.isFetching && <PulseBar className="mt-1 w-40" />}
            </div>
          )}

          {/* ── Stop / delete / restart actions ── */}
          {!isDeleted && !isStopped && (
            <div className="mt-4 flex items-center justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setConfirmStop(true)}>
                <Square className="h-3.5 w-3.5" /> Stop
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-rose-300 hover:text-rose-200"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </Button>
            </div>
          )}
          {isStopped && (
            <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-amber-400/25 bg-amber-500/[0.06] p-3">
              <p className="text-[11px] text-mist">
                Sequence stopped — past steps are locked, pending steps stay editable.
              </p>
              <Button size="sm" variant="primary" loading={resume.isPending} onClick={onResume}>
                <RotateCcw className="h-3.5 w-3.5" /> Restart sequence
              </Button>
            </div>
          )}
          {isDeleted && (
            <div className="mt-4 rounded-xl border border-line bg-ink-900/60 p-3 text-[11px] text-mist">
              Sequence deleted — kept in the database for the record. No further actions possible.
            </div>
          )}

          {/* ── Approve / reject bar ── */}
          {(awaiting || inProgress) && (
            <div className="mt-4 rounded-xl border border-accent/20 bg-accent/[0.06] p-3.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                  {awaiting ? (
                    <>
                      <CircleAlert className="h-4 w-4 text-warn" />
                      This sequence is paused awaiting your decision
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 text-accent-soft" />
                      Sequence is live — approve steps as they arrive
                    </>
                  )}
                </div>
                <div className="flex shrink-0 gap-2">
                  {awaiting && (
                    <>
                      <Button variant="danger" size="sm" onClick={() => setShowReject(true)}>
                        <X className="h-3.5 w-3.5" /> Reject
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        loading={approve.isPending}
                        onClick={() => onApprove(true)}
                      >
                        <Check className="h-3.5 w-3.5" /> Approve sequence
                      </Button>
                    </>
                  )}
                </div>
              </div>
              {awaiting && (
                <input
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="Optional feedback (approval notes, edit requests)…"
                  className="input mt-3 !py-2 text-xs"
                />
              )}
              {inProgress && (
                <div className="mt-2.5 flex items-center gap-2 text-[11px] text-mist">
                  <Send className="h-3 w-3" />
                  Per-step approval enabled — use Approve / Skip / Regenerate above.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <Modal open={showReject} onClose={() => setShowReject(false)} title="Reject this sequence?">
        <p className="text-xs leading-relaxed text-mist">
          Rejecting cancels this prospect's outreach sequence entirely. The thread is marked
          <span className="text-rose-300"> rejected </span> and no messages will be sent.
        </p>
        <textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          className="input mt-3"
          rows={3}
          placeholder="Reason for rejection (recorded in the audit trail)…"
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={() => setShowReject(false)}>Keep sequence</Button>
          <Button
            variant="danger"
            loading={approve.isPending}
            onClick={() => {
              onApprove(false);
              setShowReject(false);
            }}
          >
            <X className="h-3.5 w-3.5" /> Reject sequence
          </Button>
        </div>
      </Modal>

      <Modal open={confirmStop} onClose={() => setConfirmStop(false)} title="Stop this sequence?">
        <p className="text-xs leading-relaxed text-mist">
          The sequence is paused — no further steps will be sent until you restart it. The sequence
          stays in this list and all data is kept.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={() => setConfirmStop(false)}>Keep running</Button>
          <Button variant="danger" loading={stop.isPending} onClick={onStop}>
            <Square className="h-3.5 w-3.5" /> Stop sequence
          </Button>
        </div>
      </Modal>

      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete this sequence?">
        <p className="text-xs leading-relaxed text-mist">
          The workflow is stopped and the sequence is greyed out — it can no longer send. Nothing is
          physically removed: the thread, its steps and the messages already sent stay in the database
          for the record.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={() => setConfirmDelete(false)}>Cancel</Button>
          <Button variant="danger" loading={remove.isPending} onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" /> Delete sequence
          </Button>
        </div>
      </Modal>
    </div>
  );
}
