import { useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  SlidersHorizontal,
  Rocket,
  Radar,
  Activity,
  Circle,
  ChevronDown,
  Settings2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useHealth } from "@/hooks/queries";

const NAV = [
  { to: "/", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/setup", label: "Configure", icon: SlidersHorizontal, end: false },
  { to: "/campaigns", label: "Campaigns", icon: Rocket, end: false },
];

function titleFor(pathname: string): string {
  if (pathname.startsWith("/campaigns/")) return "Campaign";
  if (pathname === "/campaigns") return "Campaigns";
  if (pathname === "/setup") return "Configure campaign";
  return "Overview";
}

export default function Layout() {
  const { userId, setUserId } = useWorkspace();
  const { data: health } = useHealth();
  const location = useLocation();
  const navigate = useNavigate();
  const [draft, setDraft] = useState(userId);
  const [open, setOpen] = useState(false);

  const online = health?.status === "ok";

  /**
   * Switch workspace AND land on a user-scoped page. Campaign-scoped pages
   * (/setup?campaign_id=…, /campaigns/<id>) display a specific campaign's
   * data no matter which user is active, so switching users there shows no
   * visible change and looks broken.
   */
  const switchTo = (id: string) => {
    setUserId(id);
    setOpen(false);
    navigate("/");
  };

  return (
    <div className="flex min-h-screen">
      {/* ── Sidebar ─────────────────────────────────────── */}
      <aside className="fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-line bg-ink-950/70 backdrop-blur-xl">
        <div className="flex items-center gap-3 px-5 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-glow shadow-glow">
            <Radar className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold tracking-tight text-white">
              Nudge <span className="gradient-text">Console</span>
            </p>
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-mist">
              Outbound platform
            </p>
          </div>
        </div>

        <nav className="mt-2 flex-1 space-y-1 px-3">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all duration-150",
                  isActive
                    ? "bg-gradient-to-r from-accent/20 to-transparent text-white shadow-[inset_0_0_0_1px_rgba(99,102,241,0.25)]"
                    : "text-mist hover:bg-white/5 hover:text-slate-100",
                )
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Workspace switcher */}
        <div className="border-t border-line p-3">
          <div className="relative">
            <button
              onClick={() => setOpen((v) => !v)}
              className="flex w-full items-center gap-3 rounded-xl border border-line bg-ink-850 px-3 py-2.5 transition-colors hover:border-accent/40"
            >
              <span
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br text-[11px] font-bold text-white",
                  online ? "from-accent to-glow" : "from-slate-600 to-slate-500",
                )}
              >
                {userId.slice(0, 2).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1 text-left">
                <span className="block truncate text-xs font-semibold text-slate-200">{userId}</span>
                <span className="flex items-center gap-1.5 text-[10px] text-mist">
                  <Circle
                    className={cn(
                      "h-1.5 w-1.5",
                      online ? "fill-emerald-400 text-emerald-400" : "fill-rose-400 text-rose-400",
                    )}
                  />
                  {online ? "API online" : "API offline"}
                </span>
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-mist" />
            </button>

            {open && (
              <div className="absolute bottom-full left-0 right-0 z-50 mb-2 animate-fade-up rounded-xl border border-line bg-ink-850 p-3 shadow-softglow">
                <p className="eyebrow mb-2 px-1">Workspace (user_id)</p>
                <div className="flex gap-2">
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") switchTo(draft);
                    }}
                    className="input !py-2 text-xs"
                    placeholder="user-1"
                  />
                  <button
                    onClick={() => switchTo(draft)}
                    className="btn-primary !px-3 !py-2 text-xs"
                  >
                    Switch
                  </button>
                </div>
                <button className="btn-ghost mt-2 w-full !justify-start text-[11px]">
                  <Settings2 className="h-3.5 w-3.5" /> Every table is scoped by user_id
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* ── Main ────────────────────────────────────────── */}
      <div className="ml-60 flex min-h-screen flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-ink-900/70 px-8 py-4 backdrop-blur-xl">
          <div>
            <p className="eyebrow">Nudge Console</p>
            <h1 className="text-lg font-bold tracking-tight text-slate-50">{titleFor(location.pathname)}</h1>
          </div>
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold",
                online
                  ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-300"
                  : "border-rose-400/25 bg-rose-500/10 text-rose-300",
              )}
            >
              <Activity className="h-3 w-3" />
              {online ? "Global Orchestrator" : "Backend unreachable"}
            </span>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 px-8 py-8">
          <Outlet />
        </main>

        <footer className="px-8 py-5 text-center text-[11px] text-slate-600">
          Nudge Console · wired to the Global Orchestrator API (:8100) · Phase A sourcing &amp; qualifying → Phase B outreach
        </footer>
      </div>
    </div>
  );
}
