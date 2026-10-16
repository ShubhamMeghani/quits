// Base UI primitives: 44 px minimum tap targets, labelled fields, AA colours (R50, R51).
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { BackIcon } from "./icons";

type Variant = "primary" | "secondary" | "danger" | "ghost";

const variants: Record<Variant, string> = {
  primary: "bg-brand text-brand-fg hover:bg-brand-dark disabled:opacity-60",
  secondary: "border border-border bg-card text-foreground hover:bg-slate-50 disabled:opacity-60",
  danger: "border border-red-200 bg-card text-danger hover:bg-red-50 disabled:opacity-60",
  ghost: "text-brand hover:bg-teal-50 disabled:opacity-60",
};

export function buttonClass(variant: Variant = "primary", extra = "") {
  return `inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-base font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${variants[variant]} ${extra}`;
}

export function Button({ variant = "primary", className = "", ...props }: ComponentProps<"button"> & { variant?: Variant }) {
  return <button type="button" className={buttonClass(variant, className)} {...props} />;
}

export function LinkButton({ variant = "primary", className = "", ...props }: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={buttonClass(variant, className)} {...props} />;
}

export function Card({ className = "", ...props }: ComponentProps<"div">) {
  return <div className={`rounded-2xl border border-border bg-card p-4 ${className}`} {...props} />;
}

/**
 * Input styling without width or horizontal padding. Tailwind orders utilities in the stylesheet,
 * not by class order, so combining `w-full` with `w-28` (or `px-3` with `px-2`) is unreliable:
 * pick exactly one width via `inputClass` (full width) or `inputFixed(...)`.
 */
export const inputBase =
  "min-h-11 rounded-xl border border-border bg-card text-base text-foreground placeholder:text-slate-500 focus:border-brand focus:outline-none focus:ring-2 focus:ring-teal-200 disabled:bg-slate-100 aria-[invalid=true]:border-danger aria-[invalid=true]:bg-red-50";

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
        <Link href={back} aria-label="Back" className="-ml-2 inline-flex h-11 w-11 items-center justify-center rounded-full hover:bg-slate-100">
          <BackIcon />
        </Link>
      )}
      <h1 className="min-w-0 flex-1 truncate text-xl font-bold">{title}</h1>
      {right}
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "error" | "ok"; children: ReactNode }) {
  const tones = {
    info: "border-teal-200 bg-teal-50 text-teal-900",
    warn: "border-amber-300 bg-amber-50 text-amber-900",
    error: "border-red-200 bg-red-50 text-red-900",
    ok: "border-green-200 bg-green-50 text-green-900",
  };
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-xl border px-3 py-2 text-sm ${tones[tone]}`}>
      {children}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border px-4 py-10 text-center">
      <p className="font-semibold">{title}</p>
      {children && <div className="text-sm text-muted">{children}</div>}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-slate-200 ${className}`} />;
}
