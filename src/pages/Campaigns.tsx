import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Rocket,
  ArrowRight,
  Plus,
  Loader2,
  ClipboardList,
  AlertCircle,
  CheckCircle2,
  Square,
} from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Card, EmptyState, PulseBar, Skeleton } from "@/components/ui";
import { useWorkspace } from "@/context/WorkspaceContext";
import {
  useCampaigns,
  useDuplicateAndStartCampaign,
  useStartCampaignById,
  useStopCampaign,
} from "@/hooks/queries";
import { phaseAIndex, RUNNING_STAGES, statusTone } from "@/lib/stages";
import { uiStatusLabel } from "@/lib/uiStatus";
import { formatTime } from "@/lib/utils";

export default function Campaigns() {
  const { userId } = useWorkspace();
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useCampaigns(userId, 8_000);
  const startById = useStartCampaignById();
  const duplicateStart = useDuplicateAndStartCampaign();
  const stopCampaign = useStopCampaign();
  const [launchingId, setLaunchingId] = useState<string | null>(null);
  const [stoppingId, setStoppingId] = useState<string | null>(null);

  const campaigns = data?.campaigns ?? [];

  const counts = useMemo(() => {
    const running = campaigns.filter(
      (c) => c.status === "running" && RUNNING_STAGES.has(c.stage),
    ).length;
    const completed = campaigns.filter((c) => c.status === "completed").length;
    return { running, completed };
  }, [campaigns]);

  /** Start a draft campaign with its own params (T8). */
  const launchDraft = (id: string) => {
    setLaunchingId(id);
    startById.mutate(id, {
      onSuccess: (res) => {
        toast.success("Campaign launched — Phase A started");
        navigate(`/campaigns/${res.campaign_id}`);
      },
      onError: (e) => toast.error(e.message),
      onSettled: () => setLaunchingId(null),
    });
  };

  /** Stop a running/awaiting campaign (terminal). */
  const stopRun = (id: string) => {
    setStoppingId(id);
    stopCampaign.mutate(id, {
      onSuccess: (res) => {
        toast.success(`Campaign stopped — ${res.message ?? "its companies are now re-servable"}`);
        refetch();
      },
      onError: (e) => toast.error(e.message),
      onSettled: () => setStoppingId(null),
    });
  };

  /** Re-run a finished/failed campaign: copy ITS params into a fresh draft and start it. */
  const relaunch = (id: string) => {
    setLaunchingId(id);
    duplicateStart.mutate(
      { sourceCampaignId: id, userId },
      {
        onSuccess: (res) => {
          toast.success("Campaign duplicated & launched — Phase A started");
          navigate(`/campaigns/${res.campaign_id}`);
        },
        onError: (e) => toast.error(e.message),
        onSettled: () => setLaunchingId(null),
      },
    );
  };

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">{userId} · {campaigns.length} campaign{campaigns.length === 1 ? "" : "s"}</p>
          <h2 className="mt-1 text-xl font-bold text-white">Campaigns</h2>
        </div>
        <div className="flex items-center gap-3">
          {counts.running > 0 && (
            <Badge tone="accent" dot>{counts.running} running</Badge>
          )}
          {counts.completed > 0 && (
            <Badge tone="ok" dot>{counts.completed} completed</Badge>
          )}
          <Link to="/setup">
            <Button variant="primary">
              <Plus className="h-4 w-4" /> New campaign
            </Button>
          </Link>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : isError ? (
        <Card className="p-6">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-rose-300">
              Couldn't reach the orchestrator to list campaigns.
            </p>
            <Button size="sm" onClick={() => refetch()}>Retry</Button>
          </div>
        </Card>
      ) : campaigns.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="h-8 w-8" />}
          title="No campaigns for this workspace"
          description="Configure your ICP & offering, then launch — or launch with defaults saved in the backend."
          action={
            <Link to="/setup">
              <Button variant="primary">
                <Rocket className="h-4 w-4" /> Configure & launch
              </Button>
            </Link>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {campaigns.map((c) => {
            const ui = uiStatusLabel(c.ui_status || c.status, c.stage);
            const tone = statusTone(ui.status);
            const idx = phaseAIndex(c.stage);
            const inPhaseA = idx >= 0;
            // Clamp at 100: package_ready sits at index 11 → 110% without this.
            const progress = c.status === "draft" ? 0 : c.status === "completed" ? 100 : inPhaseA ? Math.min(100, Math.round((idx / 10) * 100)) : 100;
            const runningNow = (c.status === "running" || c.status === "awaiting_approval") && RUNNING_STAGES.has(c.stage);
            const isDraft = c.status === "draft";
            return (
              <Card key={c.id} hover className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-sm font-semibold text-slate-100">
                        {c.campaign_name || (c.raw_icp ? c.raw_icp.split("\n")[0].slice(0, 60) : "Campaign")}
                      </h3>
                      <Badge tone={tone.tone === "neutral" ? "neutral" : tone.tone} dot>
                        {ui.label}
                      </Badge>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-mist">
                      {c.raw_icp?.slice(0, 140)}
                    </p>
                    <p className="mt-2 text-[10px] uppercase tracking-wide text-slate-500">
                      {formatTime(c.created_at)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-mono text-lg font-bold text-slate-100">
                      {c.status === "failed" ? (
                        <AlertCircle className="inline h-4 w-4 text-danger" />
                      ) : c.status === "stopped" ? (
                        <Square className="inline h-4 w-4 text-slate-500" />
                      ) : c.status === "completed" ? (
                        <CheckCircle2 className="inline h-4 w-4 text-ok" />
                      ) : (
                        <Loader2 className="inline h-4 w-4 animate-spin text-accent-soft" />
                      )}
                    </p>
                    <p className="text-[10px] uppercase tracking-wide text-mist">stage: {c.stage}</p>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="mb-1.5 flex items-center justify-between text-[10px] text-mist">
                    <span className="uppercase tracking-wide">Pipeline</span>
                    <span className="font-mono">{progress}%</span>
                  </div>
                  {runningNow ? (
                    <PulseBar />
                  ) : (
                    <div className="h-1 w-full overflow-hidden rounded-full bg-ink-700">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-accent to-glow"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  )}
                </div>

                <div className="mt-4 flex items-center gap-2">
                  <Link
                    to={isDraft ? `/setup?campaign_id=${c.id}` : `/campaigns/${c.id}`}
                    className="flex-1"
                  >
                    <Button variant="secondary" className="w-full">
                      {isDraft ? "Edit config" : "Open"} <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  </Link>
                  {/* Per-state CTA: waiting campaigns get an actionable button that
                      takes the user straight to the review gate they're stuck at. */}
                  {(c.ui_status === "waiting_company_approval" ||
                    c.ui_status === "waiting_sequence_approval" ||
                    c.ui_status === "waiting_approval") && (
                    <Link to={`/campaigns/${c.id}`}>
                      <Button variant="primary">Review</Button>
                    </Link>
                  )}
                  {!isDraft &&
                    c.status !== "running" &&
                    c.status !== "awaiting_approval" &&
                    ![
                      "waiting_company_approval",
                      "waiting_sequence_approval",
                      "waiting_approval",
                    ].includes(c.ui_status || "") && (
                    <Button
                      variant={c.status === "failed" ? "primary" : "ghost"}
                      loading={launchingId === c.id}
                      disabled={startById.isPending || duplicateStart.isPending}
                      onClick={() => relaunch(c.id)}
                      title="Copy this campaign's params into a new campaign and start it"
                    >
                      <Rocket className="h-3.5 w-3.5" />
                      {c.status === "failed" ? "Retry" : "Launch"}
                    </Button>
                  )}
                  {isDraft && (
                    <Button
                      variant="primary"
                      loading={launchingId === c.id}
                      disabled={startById.isPending || duplicateStart.isPending}
                      onClick={() => launchDraft(c.id)}
                      title="Launch this draft campaign"
                    >
                      <Rocket className="h-3.5 w-3.5" /> Launch
                    </Button>
                  )}
                  {/* Stop: only for campaigns that are still live (running or
                      awaiting a review gate). Terminal — aborts in-flight work
                      and frees the campaign's companies for other campaigns. */}
                  {!isDraft &&
                    (c.status === "running" || c.status === "awaiting_approval") &&
                    ![
                      "waiting_company_approval",
                      "waiting_sequence_approval",
                      "waiting_approval",
                    ].includes(c.ui_status || "") && (
                    <Button
                      variant="ghost"
                      loading={stoppingId === c.id}
                      disabled={
                        stopCampaign.isPending ||
                        startById.isPending ||
                        duplicateStart.isPending
                      }
                      onClick={() => {
                        if (
                          window.confirm(
                            "Stop this campaign? In-flight work aborts and its " +
                              "approved companies become available to other campaigns.",
                          )
                        ) {
                          stopRun(c.id);
                        }
                      }}
                      title="Stop this campaign (terminal)"
                    >
                      <Square className="h-3.5 w-3.5" /> Stop
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
