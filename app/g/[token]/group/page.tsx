import Link from "next/link";
import { ChevronIcon } from "@/app/_components/icons";
import { PageHeader } from "@/app/_components/ui";
import { requireGroup } from "@/server/context";
import { YouCard } from "./you-card";

const row = "flex min-h-14 items-center gap-3 px-4 hover:bg-slate-50";

// Group tab (R50): members, share, settings, stats, export and about.
export default async function GroupHubPage({ params }: PageProps<"/g/[token]/group">) {
  const { token } = await params;
  const group = await requireGroup(token);
  const links: { href: string; label: string; hint: string }[] = [
    { href: `/g/${token}/share`, label: "Share invite link", hint: "Anyone with the link can view and edit" },
    { href: `/g/${token}/members`, label: "Members", hint: "Names and UPI IDs" },
    { href: `/g/${token}/settings`, label: "Group settings", hint: "Name, base currency, default split" },
  ];
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={group.name} />
      <YouCard />
      <nav aria-label="Group options">
        <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
          {links.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className={row}>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{l.label}</span>
                  <span className="block truncate text-sm text-muted">{l.hint}</span>
                </span>
                <ChevronIcon className="h-5 w-5 text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
