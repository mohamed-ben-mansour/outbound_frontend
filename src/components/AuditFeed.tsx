import { User, Bot, History } from "lucide-react";
import { cn, formatTime } from "@/lib/utils";
import type { AuditEvent } from "@/lib/types";

export default function AuditFeed({ events }: { events: AuditEvent[] | undefined }) {
  if (!events?.length) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center">
        <History className="h-6 w-6 text-mist/40" />
        <p className="text-xs text-mist">No audit events yet.</p>
      </div>
    );
  }

  return (
    <ol className="relative space-y-3">
      {events.map((e) => (
        <li key={e.id} className="relative flex gap-3">
          <span
            className={cn(
              "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border",
              e.actor === "human"
                ? "border-accent/30 bg-accent/15 text-accent-soft"
                : "border-line bg-ink-800 text-mist",
            )}
          >
            {e.actor === "human" ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
          </span>
          <div className="min-w-0 flex-1 pb-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold capitalize text-slate-200">
                {e.event_type.replace(/_/g, " ")}
              </span>
              <span className="text-[10px] uppercase tracking-wide text-mist">
                by {e.actor}
              </span>
              <span className="ml-auto text-[10px] text-slate-500">{formatTime(e.created_at)}</span>
            </div>
            {e.payload && Object.keys(e.payload).length > 0 && (
              <pre className="mt-1.5 overflow-x-auto rounded-lg border border-line bg-ink-950/70 p-2.5 font-mono text-[10px] leading-relaxed text-slate-400">
                {JSON.stringify(e.payload, null, 2)}
              </pre>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
