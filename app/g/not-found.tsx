import Link from "next/link";
import { MarkGroupUnavailable } from "@/app/_components/recent-groups";
import { ApplyStoredTheme } from "@/app/_components/theme-toggle";
import { inter } from "@/app/_lib/fonts";

// R1: the same generic page for malformed and unknown tokens.
// R5: a group in this device's list that is now gone is marked "No longer available" (browser only).
// R71: Next renders this 404 on the client in its own error document, without the root layout's
// <html> attributes or <head> script, so the page applies the stored theme and the font itself.
export default function GroupNotFound() {
  return (
    <main className={`${inter.variable} mx-auto flex w-full max-w-[640px] flex-1 flex-col items-center justify-center gap-3 px-4 py-16 text-center font-sans`}>
      <ApplyStoredTheme />
      <MarkGroupUnavailable />
      <h1 className="text-2xl font-bold">Group not found</h1>
      <p className="text-muted">Check the link you were sent, or ask for a new one.</p>
      <Link href="/" className="flex min-h-11 items-center rounded-xl bg-linear-to-br from-brand-from to-brand-to px-4 font-semibold text-brand-fg shadow-brand">
        Go to Quits
      </Link>
    </main>
  );
}
