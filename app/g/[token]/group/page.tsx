import Link from "next/link";
import { ChevronIcon } from "@/app/_components/icons";
import { cardClass, PageHeader } from "@/app/_components/ui";
import { ThemeToggle } from "@/app/_components/theme-toggle";
import { requireGroup } from "@/server/context";
import { ResetDemoButton } from "@/app/_components/demo-buttons";
import { YouCard } from "./you-card";

const row = "flex min-h-13 items-center gap-3 px-4 py-1.5 transition-colors hover:bg-card-hover";

// Group tab (R50): members, share, settings, stats, export and about.
export default async function GroupHubPage({ params }: PageProps<"/g/[token]/group">) {
  const { token } = await params;
  const group = await requireGroup(token);
  const links: { href: string; label: string; hint: string }[] = [
    { href: `/g/${token}/share`, label: "Share invite link", hint: "Anyone with the link can edit" },
    { href: `/g/${token}/members`, label: "Members", hint: "Names and UPI IDs" },
    { href: `/g/${token}/settings`, label: "Group settings", hint: "Name, currency, default split" },
    { href: `/g/${token}/search`, label: "Search & stats", hint: "Find expenses and see charts" },
    { href: `/g/${token}/recurring`, label: "Recurring expenses", hint: "Rent, Wi-Fi and other repeats" },
    { href: "/about", label: "About Quits", hint: "How it works and accuracy" },
  ];
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={group.name} />
      <YouCard />
      <nav aria-label="Group options">
        <ul className={`divide-y divide-border overflow-hidden ${cardClass}`}>
          {links.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className={row}>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{l.label}</span>
                  <span className="block text-sm text-muted">{l.hint}</span>
                </span>
                <ChevronIcon className="h-5 w-5 text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <section aria-labelledby="appearance" className={`${cardClass} flex flex-col gap-2 p-4`}>
        <h2 id="appearance" className="font-semibold">
          Appearance
        </h2>
        <ThemeToggle />
        <p className="text-sm text-muted">Saved on this device. UPI QR codes always stay black on white so they scan.</p>
      </section>
      <a href={`/api/g/${token}/export.csv`} download className={`flex min-h-14 items-center justify-center px-4 font-semibold text-brand transition-colors hover:bg-card-hover ${cardClass}`}>
        Export expenses (CSV)
      </a>
      <ResetDemoButton />
    </div>
  );
}
