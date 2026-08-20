import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  Rocket,
  ArrowRight,
  SlidersHorizontal,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Radar,
  Users,
  ClipboardList,
} from "lucide-react";
import { Badge, Button, Card, CardHeader, EmptyState, PulseBar, Skeleton, Stat } from "@/components/ui";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useCampaigns, useHealth } from "@/hooks/queries";
import { phaseAIndex, RUNNING_STAGES, statusTone } from "@/lib/stages";
import { timeAgo } from "@/lib/utils";

export default function Dashboard() {
  const { userId } = useWorkspace();
  const { data: health } = useHealth();
  const { data: campaigns, isLoading } = useCampaigns(userId, 10_000);

  const stats = useMemo(() => {
    const list = campaigns?.campaigns ?? [];
    const running = list.filter(
      (c) => c.status === "running" && RUNNING_STAGES.has(c.stage),
    );
    const completed = list.filter((c) => c.status === "completed");
    const failed = list.filter((c) => c.status === "failed");
    return { total: list.length, running, completed, failed, list };
  }, [campaigns]);

  const mostRecent = stats.list[0];

  const activeIdx = mostRecent ? phaseAIndex(mostRecent.stage) : -1;
  const progress = mostRecent
    ? Math.round(((activeIdx < 0 ? 10 : activeIdx) / 10) * 100)
    : 0;

  return (
    <div className="space-y-8 animate-fade-up">
      {/* ── Hero ── */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Workspace · {userId}</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-white">
            Welcome back — let's find your next <span className="gradient-text">ideal leads</span>
          </h2>
          <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-mist">
            Configure your ICP &amp; offering, launch a campaign, watch Phase A discover and score
            companies &amp; personas, then approve Phase B sequences for dispatch.
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/setup">
            <Button variant="secondary">
              <SlidersHorizontal className="h-4 w-4" /> Configure
            </Button>
          </Link>
          <Link to="/campaigns">
            <Button variant="primary">
              <Rocket className="h-4 w-4" /> Launch campaign
            </Button>
          </Link>
        </div>
      </div>

      {!health || health.status !== "ok" ? (
        <div className="flex items-center gap-3 rounded-2xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          <AlertCircle className="h-4 w-4 shrink-0" />
          Global Orchestrator is unreachable. Start it (<code className="font-mono">:8100</code>) to
          use the console.
        </div>
      ) : null}

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat
          label="Campaigns"
          value={isLoading ? "—" : stats.total}
          icon={<Rocket className="h-4 w-4" />}
          sub={`workspace ${userId}`}
        />
        <Stat
          label="Running now"
          value={isLoading ? "—" : stats.running.length}
          icon={<Loader2 className="h-4 w-4" />}
          tone="accent"
          sub="Phase A in progress"
        />
        <Stat
          label="Completed"
          value={isLoading ? "—" : stats.completed.length}
          icon={<CheckCircle2 className="h-4 w-4" />}
          tone="ok"
          sub="lead packages ready"
        />
        <Stat
          label="Failed"
          value={isLoading ? "—" : stats.failed.length}
          icon={<AlertCircle className="h-4 w-4" />}
          tone="danger"
          sub="see campaign details"
        />
      </div>

      {/* ── Active campaign / recent list ── */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h3 className="eyebrow">Recent campaigns</h3>
            <Link to="/campaigns" className="text-xs font-medium text-accent-soft hover:text-white">
              View all →
            </Link>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : stats.list.length === 0 ? (
            <EmptyState
              icon={<Radar className="h-8 w-8" />}
              title="No campaigns yet"
              description="Set up your ICP, offering, blacklist and outreach config, then launch your first campaign."
              action={
                <Link to="/setup">
                  <Button variant="primary">
                    <SlidersHorizontal className="h-4 w-4" /> Start configuring
                  </Button>
                </Link>
              }
            />
          ) : (
            <div className="space-y-3">
              {stats.list.slice(0, 5).map((c) => {
                const tone = statusTone(c.status);
                const idx = phaseAIndex(c.stage);
                return (
                  <Link
                    key={c.id}
                    to={`/campaigns/${c.id}`}
                    className="card card-hover block p-4"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-line bg-ink-800 text-accent-soft">
                        <ClipboardList className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-100">
                          {c.campaign_name || (c.raw_icp ? c.raw_icp.slice(0, 80) : "Campaign")}
                        </p>
                        <p className="mt-0.5 flex items-center gap-2 text-[11px] text-mist">
                          <span>{timeAgo(c.created_at)}</span>
                          <span className="text-slate-600">·</span>
                          <span className="capitalize">{c.stage.replace(/_/g, " ")}</span>
                        </p>
                        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-ink-700">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-accent to-glow transition-all duration-500"
                            style={{ width: `${c.status === "completed" ? 100 : Math.max(6, (idx / 10) * 100)}%` }}
                          />
                        </div>
                      </div>
                      <Badge tone={tone.tone}>{c.status}</Badge>
                      <ArrowRight className="h-4 w-4 shrink-0 text-mist" />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Right rail ── */}
        <div className="space-y-4">
          <Card>
            <CardHeader
              icon={<Users className="h-4 w-4" />}
              title="Campaign pulse"
              subtitle="Most recent campaign"
            />
            <div className="p-5 pt-3">
              {mostRecent ? (
                <div className="space-y-3">
                  <p className="text-xs leading-relaxed text-mist">
                    {mostRecent.raw_icp?.slice(0, 120)}
                  </p>
                  <div>
                    <div className="mb-1.5 flex items-center justify-between text-[11px]">
                      <span className="text-mist">Phase A progress</span>
                      <span className="font-mono font-semibold text-accent-soft">{progress}%</span>
                    </div>
                    {mostRecent.status === "running" && RUNNING_STAGES.has(mostRecent.stage) ? (
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
                  <Link to={`/campaigns/${mostRecent.id}`} className="block">
                    <Button variant="secondary" className="w-full">
                      Open campaign <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  </Link>
                </div>
              ) : (
                <p className="py-4 text-center text-xs text-mist">No campaign yet.</p>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader
              icon={<AlertCircle className="h-4 w-4" />}
              title="Approval queue"
              subtitle="Sequences waiting for your review"
            />
            <div className="p-5 pt-3">
              <p className="text-xs leading-relaxed text-mist">
                Open a campaign's <span className="text-slate-300">Outreach</span> tab to review and
                approve generated sequences before they dispatch.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
