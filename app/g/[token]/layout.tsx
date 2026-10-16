import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GroupShell } from "@/app/_components/group-shell";
import { findGroupByToken, loadMembers } from "@/server/context";

export const metadata: Metadata = { robots: { index: false, follow: false } };

// The token is resolved here, before any streaming, so unknown tokens get a real 404 (R1).
export default async function GroupLayout({ children, params }: LayoutProps<"/g/[token]">) {
  const { token } = await params;
  const group = await findGroupByToken(token);
  if (!group) notFound();
  const members = await loadMembers(group.id);
  return (
    <GroupShell
      group={{ token: group.shareToken, name: group.name, baseCurrency: group.baseCurrency, isDemo: group.isDemo }}
      members={members.map((m) => ({ id: m.id, name: m.name, upiId: m.upiId, upiName: m.upiName, archived: m.archived }))}
    >
      {children}
    </GroupShell>
  );
}
