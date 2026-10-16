// Per-member rows of the expense form (R9, R10). Presentational, so a test can render every mode
// and check that each row shows its member's name (BUG-1: names were squeezed to zero width).
import { inputFixed } from "@/app/_components/ui";

export type RowPerson = { id: string; name: string };
export type SplitMode = "equal" | "exact" | "percent" | "shares";

const labelOf = (p: RowPerson, me: string | null | undefined) => (p.id === me ? `${p.name} (you)` : p.name);

export function SplitRows(props: {
  people: RowPerson[];
  me: string | null | undefined;
  mode: SplitMode;
  included: ReadonlySet<string>;
  exact: Readonly<Record<string, string>>;
  percent: Readonly<Record<string, string>>;
  shares: Readonly<Record<string, string>>;
  /** Formatted computed share per member (shown under the name), if known. */
  owed: Readonly<Record<string, string>>;
  highlight?: ReadonlySet<string>;
  onToggle: (id: string, checked: boolean) => void;
  onValue: (mode: Exclude<SplitMode, "equal">, id: string, value: string) => void;
}) {
  const { people, me, mode } = props;
  return (
    <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-card" data-testid="split-rows">
      {people.map((p) => {
        const label = labelOf(p, me);
        const owed = props.owed[p.id];
        const flagged = props.highlight?.has(p.id);
        return (
          <li key={p.id} data-member={p.id} className={`flex min-h-14 items-center gap-3 px-3 py-2 ${flagged ? "bg-amber-50" : ""}`}>
            {mode === "equal" && (
              <input
                id={`sp-${p.id}`}
                type="checkbox"
                className="h-5 w-5 shrink-0 accent-teal-700"
                checked={props.included.has(p.id)}
                onChange={(e) => props.onToggle(p.id, e.target.checked)}
              />
            )}
            <label htmlFor={`sp-${p.id}`} className="flex min-h-11 min-w-0 flex-1 flex-col justify-center">
              <span className="truncate font-medium" data-testid="member-name">
                {label}
              </span>
              {mode !== "exact" && <span className="text-xs text-muted">{owed ?? "—"}</span>}
            </label>
            {mode === "exact" && (
              <input
                id={`sp-${p.id}`}
                aria-label={`Amount for ${p.name}`}
                className={inputFixed("w-28")}
                inputMode="decimal"
                placeholder="0.00"
                value={props.exact[p.id] ?? ""}
                onChange={(e) => props.onValue("exact", p.id, e.target.value)}
              />
            )}
            {mode === "percent" && (
              <span className="flex shrink-0 items-center gap-1">
                <input
                  id={`sp-${p.id}`}
                  aria-label={`Percent for ${p.name}`}
                  className={inputFixed("w-20")}
                  inputMode="decimal"
                  placeholder="0"
                  value={props.percent[p.id] ?? ""}
                  onChange={(e) => props.onValue("percent", p.id, e.target.value)}
                />
                <span aria-hidden="true">%</span>
              </span>
            )}
            {mode === "shares" && (
              <span className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  aria-label={`Fewer shares for ${p.name}`}
                  className="h-11 w-11 rounded-xl border border-border text-lg"
                  onClick={() => props.onValue("shares", p.id, String(Math.max(0, Number(props.shares[p.id] || 0) - 1)))}
                >
                  −
                </button>
                <input
                  id={`sp-${p.id}`}
                  aria-label={`Shares for ${p.name}`}
                  className={inputFixed("w-12 px-1 text-center")}
                  inputMode="numeric"
                  value={props.shares[p.id] ?? ""}
                  onChange={(e) => props.onValue("shares", p.id, e.target.value)}
                />
                <button
                  type="button"
                  aria-label={`More shares for ${p.name}`}
                  className="h-11 w-11 rounded-xl border border-border text-lg"
                  onClick={() => props.onValue("shares", p.id, String(Math.min(999, Number(props.shares[p.id] || 0) + 1)))}
                >
                  +
                </button>
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** "Multiple people paid" rows: one amount per payer (R10). */
export function PayerRows(props: {
  people: RowPerson[];
  me: string | null | undefined;
  amounts: Readonly<Record<string, string>>;
  onValue: (id: string, value: string) => void;
}) {
  return (
    <ul className="flex flex-col gap-2" data-testid="payer-rows">
      {props.people.map((p) => (
        <li key={p.id} data-member={p.id} className="flex min-h-11 items-center gap-3">
          <label htmlFor={`pay-${p.id}`} className="min-w-0 flex-1 truncate" data-testid="member-name">
            {labelOf(p, props.me)}
          </label>
          <input
            id={`pay-${p.id}`}
            className={inputFixed("w-32")}
            inputMode="decimal"
            placeholder="0.00"
            value={props.amounts[p.id] ?? ""}
            onChange={(e) => props.onValue(p.id, e.target.value)}
          />
        </li>
      ))}
    </ul>
  );
}
