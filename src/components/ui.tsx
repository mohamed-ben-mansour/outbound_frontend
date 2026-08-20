import {
  useEffect,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { X, AlertTriangle, Loader2, ChevronDown } from "lucide-react";
import { cn, scoreBar, scoreColor } from "@/lib/utils";

// ── Button ────────────────────────────────────────────────

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}

export function Button({
  variant = "secondary",
  size = "md",
  loading,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  const sizes = {
    sm: "px-3 py-1.5 text-xs rounded-lg",
    md: "px-4 py-2.5 text-sm rounded-xl",
    lg: "px-5 py-3 text-sm rounded-xl",
  };
  const variants: Record<ButtonVariant, string> = {
    primary: "btn-primary",
    secondary: "btn-secondary",
    ghost: "btn-ghost",
    danger:
      "inline-flex items-center justify-center gap-2 rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm font-medium text-danger transition-colors hover:bg-danger/20 active:scale-[0.98] disabled:opacity-50",
  };
  return (
    <button
      className={cn(sizes[size], variants[variant], className)}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

// ── Badge ─────────────────────────────────────────────────

export type Tone = "ok" | "warn" | "danger" | "neutral" | "accent";

const toneClasses: Record<Tone, string> = {
  ok: "bg-emerald-500/10 text-emerald-300 border-emerald-400/25",
  warn: "bg-amber-500/10 text-amber-300 border-amber-400/25",
  danger: "bg-rose-500/10 text-rose-300 border-rose-400/25",
  neutral: "bg-white/5 text-slate-300 border-white/10",
  accent: "bg-indigo-500/10 text-indigo-300 border-indigo-400/25",
};

export function Badge({
  tone = "neutral",
  children,
  className,
  dot,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold capitalize",
        toneClasses[tone],
        className,
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

// ── Card ──────────────────────────────────────────────────

export function Card({
  children,
  className,
  hover,
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
}) {
  return <div className={cn("card", hover && "card-hover", className)}>{children}</div>;
}

export function CardHeader({
  title,
  subtitle,
  icon,
  right,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3 px-5 pt-5", className)}>
      <div className="flex items-start gap-3">
        {icon && (
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-line bg-ink-800 text-accent-soft">
            {icon}
          </div>
        )}
        <div>
          <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-mist">{subtitle}</p>}
        </div>
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}

// ── Form primitives ───────────────────────────────────────

export function Field({
  label,
  hint,
  children,
  className,
  optional,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
  optional?: boolean;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 flex items-baseline gap-2 text-[13px] font-medium text-slate-300">
        {label}
        {optional && <span className="text-[11px] text-slate-600">optional</span>}
      </span>
      {children}
      {hint && <span className="mt-1.5 block text-[11px] leading-relaxed text-slate-500">{hint}</span>}
    </label>
  );
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn("input", className)} {...rest} />;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn("input min-h-[110px] resize-y", className)} {...rest} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="relative block">
      <select className={cn("input appearance-none pr-9", className)} {...rest}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mist" />
    </span>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 rounded-xl border border-line bg-ink-900/60 px-4 py-3 text-left transition-colors hover:border-accent/30"
    >
      <span>
        <span className="block text-sm font-medium text-slate-200">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-mist">{description}</span>}
      </span>
      <span
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200",
          checked ? "bg-accent" : "bg-ink-600",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-200",
            checked ? "left-[22px]" : "left-0.5",
          )}
        />
      </span>
    </button>
  );
}

export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  format,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-ink-600 accent-[#6366f1]"
        style={{
          background: `linear-gradient(to right, #6366f1 ${pct}%, rgba(255,255,255,0.08) ${pct}%)`,
        }}
      />
      <span className="w-14 shrink-0 text-right font-mono text-xs text-accent-soft">
        {format ? format(value) : value}
      </span>
    </div>
  );
}

// ── Tag / chip input ──────────────────────────────────────

export function TagInput({
  tags,
  onChange,
  placeholder,
  validator,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  validator?: (value: string) => string | null;
}) {
  const [draft, setDraft] = useState("");

  const commit = (raw: string) => {
    const value = raw.trim();
    if (!value) return;
    const error = validator?.(value);
    if (error) {
      setDraft(error); // show hint via placeholder swap is messy — just ignore invalid
      setDraft("");
      return;
    }
    if (!tags.includes(value)) onChange([...tags, value]);
    setDraft("");
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <span
            key={tag}
            className="group inline-flex items-center gap-1.5 rounded-lg border border-accent/25 bg-accent/10 px-2.5 py-1 text-xs font-medium text-indigo-200"
          >
            {tag}
            <button
              type="button"
              onClick={() => onChange(tags.filter((t) => t !== tag))}
              className="text-indigo-300/60 transition-colors hover:text-white"
              aria-label={`Remove ${tag}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commit(draft);
          } else if (e.key === "Backspace" && !draft && tags.length) {
            onChange(tags.slice(0, -1));
          }
        }}
        onBlur={() => commit(draft)}
        placeholder={tags.length ? placeholder ?? "Add another…" : placeholder ?? "Type and press Enter"}
        className="input mt-2"
      />
    </div>
  );
}

// ── Score bar ─────────────────────────────────────────────

export function ScoreBar({
  score,
  label,
  className,
}: {
  score: number | null | undefined;
  label?: string;
  className?: string;
}) {
  const value = score ?? 0;
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-700/80">
        <div
          className={cn(
            "h-full rounded-full bg-gradient-to-r animate-bar-grow",
            scoreBar(score),
          )}
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
      </div>
      <span className={cn("w-10 text-right font-mono text-xs font-semibold", scoreColor(score))}>
        {label ?? (score === null || score === undefined ? "—" : Math.round(value))}
      </span>
    </div>
  );
}

// ── Stat ──────────────────────────────────────────────────

export function Stat({
  label,
  value,
  icon,
  tone,
  sub,
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  tone?: Tone;
  sub?: ReactNode;
}) {
  return (
    <Card className="p-4" hover>
      <div className="flex items-start justify-between">
        <span className="eyebrow">{label}</span>
        {icon && (
          <span
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg border",
              tone === "ok" && "border-emerald-400/20 bg-emerald-500/10 text-emerald-300",
              tone === "warn" && "border-amber-400/20 bg-amber-500/10 text-amber-300",
              tone === "danger" && "border-rose-400/20 bg-rose-500/10 text-rose-300",
              tone === "accent" && "border-indigo-400/20 bg-indigo-500/10 text-indigo-300",
              (!tone || tone === "neutral") && "border-line bg-ink-800 text-mist",
            )}
          >
            {icon}
          </span>
        )}
      </div>
      <div className="mt-3 text-2xl font-semibold tracking-tight text-slate-50">{value}</div>
      {sub && <div className="mt-1 text-xs text-mist">{sub}</div>}
    </Card>
  );
}

// ── Skeleton ──────────────────────────────────────────────

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} />;
}

// ── Empty state ───────────────────────────────────────────

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/10 px-6 py-14 text-center">
      {icon && <div className="mb-1 text-mist/60">{icon}</div>}
      <p className="text-sm font-semibold text-slate-200">{title}</p>
      {description && <p className="max-w-sm text-xs leading-relaxed text-mist">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

// ── Alert ─────────────────────────────────────────────────

export function Alert({
  tone = "danger",
  title,
  children,
}: {
  tone?: "danger" | "warn" | "ok";
  children?: ReactNode;
  title: string;
}) {
  const tones = {
    danger: "border-rose-400/25 bg-rose-500/10 text-rose-200",
    warn: "border-amber-400/25 bg-amber-500/10 text-amber-200",
    ok: "border-emerald-400/25 bg-emerald-500/10 text-emerald-200",
  };
  return (
    <div className={cn("rounded-xl border p-4 text-sm", tones[tone])}>
      <div className="flex items-center gap-2 font-semibold">
        <AlertTriangle className="h-4 w-4" />
        {title}
      </div>
      {children && <div className="mt-1.5 text-xs opacity-90 leading-relaxed">{children}</div>}
    </div>
  );
}

// ── Modal ─────────────────────────────────────────────────

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      <div
        className={cn(
          "relative w-full animate-fade-up rounded-2xl border border-line bg-ink-850 shadow-softglow",
          wide ? "max-w-3xl" : "max-w-lg",
        )}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
          <button onClick={onClose} className="text-mist transition-colors hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

// ── Tabs ──────────────────────────────────────────────────

export interface TabItem {
  key: string;
  label: string;
  icon?: ReactNode;
  count?: number;
}

export function Tabs({
  items,
  active,
  onChange,
}: {
  items: TabItem[];
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1 rounded-2xl border border-line bg-ink-850/60 p-1">
      {items.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={cn(
            "flex items-center gap-2 rounded-xl px-3.5 py-2 text-[13px] font-medium transition-all duration-150",
            active === tab.key
              ? "bg-gradient-to-b from-accent/25 to-accent/10 text-white shadow-glow"
              : "text-mist hover:bg-white/5 hover:text-slate-200",
          )}
        >
          {tab.icon}
          {tab.label}
          {tab.count !== undefined && tab.count > 0 && (
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                active === tab.key ? "bg-white/15 text-white" : "bg-white/10 text-mist",
              )}
            >
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// ── Progress (indeterminate pulse) ────────────────────────

export function PulseBar({ className }: { className?: string }) {
  return (
    <div className={cn("h-1 w-full overflow-hidden rounded-full bg-ink-700/70", className)}>
      <div className="h-full w-1/3 animate-[shimmer_1.2s_linear_infinite] rounded-full bg-gradient-to-r from-transparent via-accent-soft to-transparent bg-[length:200%_100%]" />
    </div>
  );
}
