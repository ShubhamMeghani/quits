import { notFound } from "next/navigation";
import { findGroupByToken } from "@/server/context";

// Phase 3 placeholder: resolves the token (R1). The full group UI arrives in Phase 4.
export default async function GroupPage({ params }: PageProps<"/g/[token]">) {
  const { token } = await params;
  const group = await findGroupByToken(token);
  if (!group) notFound();
  return (
    <main className="mx-auto w-full max-w-[640px] px-4 py-8">
      <h1 className="text-2xl font-bold">{group.name}</h1>
    </main>
  );
}
