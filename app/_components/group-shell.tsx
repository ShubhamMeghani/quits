"use client";

// Group shell (R4, R50): identity gate with member picker, header and bottom navigation.
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addMemberAction } from "@/app/actions";
import { ActivityIcon, GroupIcon, ListIcon, SettleIcon } from "./icons";
import { IdentityProvider, useIdentity, type ShellGroup, type ShellMember } from "./identity";
import { Avatar, Button, Field, inputClass, Notice, Skeleton } from "./ui";

export function GroupShell({ group, members, children }: { group: ShellGroup; members: ShellMember[]; children: React.ReactNode }) {
  return (
    <IdentityProvider group={group} members={members}>
      <Gate>{children}</Gate>
    </IdentityProvider>
  );
}

function Gate({ children }: { children: React.ReactNode }) {
  const { me } = useIdentity();
  if (me === undefined) {
    return (
      <div className="mx-auto w-full max-w-[640px] space-y-3 px-4 py-6" aria-busy="true">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-24" />
        <Skeleton className="h-16" />
      </div>
    );
  }
  if (me === null) return <MemberPicker />;
  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-[640px] flex-1 px-4 pb-28 pt-3 motion-safe:animate-rise">{children}</main>
      <BottomNav />
    </>
  );
}

function Header() {
  const { group, meMember } = useIdentity();
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex min-h-14 w-full max-w-[640px] items-center gap-3 px-4">
        <Link href={`/g/${group.token}`} className="flex min-h-11 min-w-0 flex-1 items-center text-lg font-bold tracking-tight">
          <span className="truncate">{group.name}</span>
        </Link>
        <Link
          href={`/g/${group.token}/group`}
          className="inline-flex min-h-11 max-w-[45%] items-center gap-2 rounded-full border border-border bg-card py-1 pl-1 pr-3 text-sm font-medium transition-colors hover:bg-card-hover"
        >
          {meMember && <Avatar id={meMember.id} name={meMember.name} size="sm" />}
          <span className="truncate">You: {meMember?.name}</span>
        </Link>
      </div>
      {group.isDemo && (
        <div className="border-t border-warn-border bg-warn-soft px-4 py-1 text-center text-sm font-medium text-warn-soft-fg">Demo data — UPI IDs are fake.</div>
      )}
    </header>
  );
}

const TABS = [
  { href: "", label: "Expenses", Icon: ListIcon },
  { href: "/settle", label: "Settle", Icon: SettleIcon },
  { href: "/activity", label: "Activity", Icon: ActivityIcon },
  { href: "/group", label: "Group", Icon: GroupIcon },
] as const;

function BottomNav() {
  const { group } = useIdentity();
  const pathname = usePathname();
  const root = `/g/${group.token}`;
  const sub = pathname.slice(root.length);
  const activeTab = TABS.find((t) => t.href && sub.startsWith(t.href))?.href ?? "";
  return (
    <nav aria-label="Group" className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md">
      <ul className="mx-auto grid w-full max-w-[640px] grid-cols-4">
        {TABS.map(({ href, label, Icon }) => {
          const active = href === activeTab;
          return (
            <li key={label}>
              <Link
                href={`${root}${href}`}
                aria-current={active ? "page" : undefined}
                data-active={active || undefined}
                className={`group relative flex min-h-16 flex-col items-center justify-center gap-0.5 text-xs font-semibold transition-colors ${active ? "text-brand" : "text-muted hover:text-foreground"}`}
              >
                {/* Active tab: a top indicator and a soft pill behind the icon. */}
                <span aria-hidden="true" className={`absolute inset-x-6 top-0 h-0.5 rounded-full bg-brand transition-opacity ${active ? "opacity-100" : "opacity-0"}`} />
                <span className={`inline-flex h-8 w-14 items-center justify-center rounded-full transition-colors ${active ? "bg-brand-soft" : ""}`}>
                  <Icon className="h-6 w-6" />
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** R4: choose who you are before any group content; "I'm not on the list" adds a member. */
function MemberPicker() {
  const { group, members, setMe } = useIdentity();
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const active = members.filter((m) => !m.archived);

  const add = () =>
    start(async () => {
      setError(null);
      const r = await addMemberAction(group.token, { name }, null);
      if (!r.ok) return setError(r.fields?.name ?? r.message);
      setMe(r.data.id);
      router.refresh();
    });

  return (
    <main className="mx-auto flex w-full max-w-[480px] flex-1 flex-col gap-4 px-4 py-8">
      <div>
        <p className="text-sm font-medium text-muted">{group.name}</p>
        <h1 className="text-2xl font-bold">Who are you?</h1>
        <p className="mt-1 text-muted">Pick your name. This device will remember it for this group.</p>
      </div>
      {group.isDemo && <Notice tone="warn">Demo data — UPI IDs are fake.</Notice>}
      <ul className="flex flex-col gap-2">
        {active.map((m) => (
          <li key={m.id}>
            <button
              type="button"
              onClick={() => setMe(m.id)}
              className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-border bg-card px-4 text-left text-lg font-semibold shadow-card transition-colors hover:border-brand"
            >
              <Avatar id={m.id} name={m.name} />
              {m.name}
            </button>
          </li>
        ))}
      </ul>
      {!adding ? (
        <Button variant="secondary" onClick={() => setAdding(true)}>
          I&apos;m not on the list
        </Button>
      ) : (
        <form
          className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <Field label="Your name" htmlFor="new-member" error={error ?? undefined}>
            <input id="new-member" className={inputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={30} autoFocus />
          </Field>
          <Button type="submit" disabled={pending || !name.trim()}>
            {pending ? "Adding…" : "Add me to the group"}
          </Button>
        </form>
      )}
      <p className="text-sm text-muted">Anyone with this link can view and edit this group. Choosing a name is not a login.</p>
    </main>
  );
}
