// Base UI primitives: 44 px minimum tap targets, labelled fields, AA colours in both themes (R50, R51, R71).
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { avatarColor, initials } from "@/lib/avatar";
import { BackIcon, InboxIcon } from "./icons";

type Variant = "primary" | "secondary" | "danger" | "ghost";

const variants: Record<Variant, string> = {
  primary:
    "bg-linear-to-br from-brand-from to-brand-to text-brand-fg shadow-brand hover:brightness-110 active:scale-[0.98] disabled:opacity-60 disabled:shadow-none disabled:active:scale-100",
  secondary: "border border-border bg-card text-foreground hover:bg-card-hover active:scale-[0.98] disabled:opacity-60",
  danger: "border border-danger-border bg-card text-danger hover:bg-danger-soft active:scale-[0.98] disabled:opacity-60",
  ghost: "text-brand hover:bg-brand-soft disabled:opacity-60",
};

export function buttonClass(variant: Variant = "primary", extra = "") {
  return `inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-base font-semibold transition-[background-color,filter,transform] duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${variants[variant]} ${extra}`;
}

export function Button({ variant = "primary", className = "", ...props }: ComponentProps<"button"> & { variant?: Variant }) {
  return <button type="button" className={buttonClass(variant, className)} {...props} />;
}

export function LinkButton({ variant = "primary", className = "", ...props }: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={buttonClass(variant, className)} {...props} />;
}

/** Elevated surface: slightly lighter than the page in dark, white with a soft shadow in light. */
export const cardClass = "rounded-2xl border border-border bg-card shadow-card";

export function Card({ className = "", ...props }: ComponentProps<"div">) {
  return <div className={`${cardClass} p-4 ${className}`} {...props} />;
}

/**
 * Input styling without width or horizontal padding. Tailwind orders utilities in the stylesheet,
 * not by class order, so combining `w-full` with `w-28` (or `px-3` with `px-2`) is unreliable:
 * pick exactly one width via `inputClass` (full width) or `inputFixed(...)`.
 */
export const inputBase =
  "min-h-11 rounded-xl border border-border bg-card text-base text-foreground placeholder:text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/40 disabled:bg-track aria-[invalid=true]:border-danger aria-[invalid=true]:bg-danger-soft";

export const inputClass = `${inputBase} w-full px-3`;

/** Multi-line text: same look, taller (no competing min-h utilities). */
export const textareaClass = `${inputBase.replace("min-h-11", "min-h-20")} w-full px-3 py-2`;

/** A fixed-width input that never squeezes the label next to it (e.g. "w-28", "w-14 px-1 text-center"). */
export function inputFixed(size: string): string {
  return `${inputBase} shrink-0 ${/\bpx-/.test(size) ? "" : "px-3 "}${size}`;
}

export function Field({ label, error, hint, children, htmlFor }: { label: string; error?: string; hint?: ReactNode; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-sm text-muted">{hint}</p>}
      {error && (
        <p className="text-sm font-medium text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function PageHeader({ title, back, right }: { title: string; back?: string; right?: ReactNode }) {
  return (
    <div className="mb-4 flex min-h-11 items-center gap-2">
      {back && (
        <Link href={back} aria-label="Back" className="-ml-2 inline-flex h-11 w-11 items-center justify-center rounded-full transition-colors hover:bg-card-hover">
          <BackIcon />
        </Link>
      )}
      <h1 className="min-w-0 flex-1 truncate text-xl font-bold tracking-tight">{title}</h1>
      {right}
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "error" | "ok"; children: ReactNode }) {
  const tones = {
    info: "border-brand-border bg-brand-soft text-brand-soft-fg",
    warn: "border-warn-border bg-warn-soft text-warn-soft-fg",
    error: "border-danger-border bg-danger-soft text-danger-soft-fg",
    ok: "border-ok-border bg-ok-soft text-ok-soft-fg",
  };
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-xl border px-3 py-2 text-sm ${tones[tone]}`}>
      {children}
    </div>
  );
}

/** Polished empty state: a soft icon tile, a title and an optional hint. */
export function Empty({ title, children, icon }: { title: string; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-card/40 px-4 py-10 text-center">
      <span className="mb-1 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft text-brand" aria-hidden="true">
        {icon ?? <InboxIcon className="h-6 w-6" />}
      </span>
      <p className="font-semibold">{title}</p>
      {children && <div className="max-w-xs text-sm text-muted">{children}</div>}
    </div>
  );
}

/** Loading placeholder with a soft shimmer (static for reduced motion). */
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`rounded-xl bg-track bg-[linear-gradient(90deg,transparent,var(--card-hover),transparent)] bg-size-[200%_100%] motion-safe:animate-shimmer ${className}`}
    />
  );
}

/** Small pill label, e.g. "Simplified" or "Demo". */
export function Badge({ tone = "brand", children }: { tone?: "brand" | "warn" | "ok"; children: ReactNode }) {
  const tones = {
    brand: "border-brand-border bg-brand-soft text-brand-soft-fg",
    warn: "border-warn-border bg-warn-soft text-warn-soft-fg",
    ok: "border-ok-border bg-ok-soft text-ok-soft-fg",
  };
  return <span className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${tones[tone]}`}>{children}</span>;
}

/** Coloured initials; the colour is stable per member id (lib/avatar.ts). Decorative: the name is always shown next to it. */
export function Avatar({ id, name, size = "md" }: { id: string; name: string; size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "h-7 w-7 text-xs", md: "h-9 w-9 text-sm", lg: "h-12 w-12 text-base" };
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 select-none items-center justify-center rounded-full font-bold text-white ${sizes[size]}`}
      style={{ backgroundColor: avatarColor(id) }}
    >
      {initials(name)}
    </span>
  );
}
