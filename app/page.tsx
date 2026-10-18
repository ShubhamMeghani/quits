import { CreateGroupForm } from "./_components/create-group-form";
import { RecentGroups } from "./_components/recent-groups";
import { DemoLink } from "./_components/demo-buttons";

// R73 (SPEC v1.7): "Your groups" first (when this device has any, R5), then "Start a group" as the
// primary action, with the demo as a small secondary link directly under its button.
export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-[640px] flex-1 flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-4xl font-bold tracking-tight text-brand">Quits</h1>
        <p className="text-lg">Split bills. Settle up. Call it quits.</p>
        <p className="text-muted">
          Free bill splitting for students: itemized receipts, the fewest possible payments, and UPI QR settle-up with the amount filled in.
        </p>
      </header>
      <RecentGroups />
      {/* Own classes, not <Card>: Card already sets padding and border colour (one value each, no conflicts). */}
      <section aria-labelledby="start-h" className="rounded-2xl border border-brand-border bg-card p-5 shadow-card" data-testid="start-group">
        <h2 id="start-h" className="mb-1 text-2xl font-bold tracking-tight">
          Start a group
        </h2>
        <p className="mb-4 text-sm text-muted">Add the people you share costs with. It takes a minute.</p>
        <CreateGroupForm belowSubmit={<DemoLink />} />
      </section>
    </main>
  );
}
