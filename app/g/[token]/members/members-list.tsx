"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { addMemberAction } from "@/app/actions";
import { ChevronIcon } from "@/app/_components/icons";
import { useIdentity } from "@/app/_components/identity";
import { Avatar, Button, cardClass, Field, inputClass } from "@/app/_components/ui";

export function MembersList() {
  const { group, members, me } = useIdentity();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const active = members.filter((m) => !m.archived);
  const archived = members.filter((m) => m.archived);

  const add = () =>
    start(async () => {
      setError(null);
      const r = await addMemberAction(group.token, { name }, me ?? null);
      if (!r.ok) return setError(r.fields?.name ?? r.message);
      setName("");
    });

  return (
    <div className="flex flex-col gap-4">
      <ul className={`divide-y divide-border overflow-hidden ${cardClass}`}>
        {active.map((m) => (
          <li key={m.id}>
            <Link href={`/g/${group.token}/members/${m.id}`} className="flex min-h-14 items-center gap-3 px-4 py-2 transition-colors hover:bg-card-hover">
              <Avatar id={m.id} name={m.name} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">
                  {m.name}
                  {m.id === me && <span className="font-normal text-muted"> (you)</span>}
                </span>
                <span className="block truncate text-sm text-muted">{m.upiId ?? "No UPI ID yet"}</span>
              </span>
              <ChevronIcon className="h-5 w-5 text-muted" />
            </Link>
          </li>
        ))}
      </ul>
      <form
        className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <Field label="Add a member" htmlFor="add-member" error={error ?? undefined}>
          <input id="add-member" className={inputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={30} placeholder="Name" />
        </Field>
        <Button type="submit" disabled={pending || !name.trim()}>
          {pending ? "Adding…" : "Add member"}
        </Button>
      </form>
      {archived.length > 0 && (
        <section>
          <h2 className="mb-2 font-bold text-muted">Archived</h2>
          <ul className="divide-y divide-border rounded-2xl border border-border bg-card text-muted">
            {archived.map((m) => (
              <li key={m.id} className="flex min-h-12 items-center px-4">
                {m.name}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
