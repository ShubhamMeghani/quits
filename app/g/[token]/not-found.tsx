import Link from "next/link";

// R1: the same generic page for malformed and unknown tokens.
export default function GroupNotFound() {
  return (
    <main className="mx-auto flex w-full max-w-[640px] flex-1 flex-col items-center justify-center gap-3 px-4 py-16 text-center">
      <h1 className="text-2xl font-bold">Group not found</h1>
      <p className="text-muted">Check the link you were sent, or ask for a new one.</p>
      <Link href="/" className="flex min-h-11 items-center rounded-xl bg-brand px-4 font-semibold text-brand-fg">
        Go to Quits
      </Link>
    </main>
  );
}
