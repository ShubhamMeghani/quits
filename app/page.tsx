import { CreateGroupForm } from "./_components/create-group-form";
import { RecentGroups } from "./_components/recent-groups";
import { Card } from "./_components/ui";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-[640px] flex-1 flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-4xl font-bold text-brand">Quits</h1>
        <p className="text-lg">Split bills. Settle up. Call it quits.</p>
        <p className="text-muted">
          Free bill splitting for students: itemized receipts, the fewest possible payments, and UPI QR settle-up with the amount filled in.
        </p>
      </header>
      <RecentGroups />
      <Card>
        <h2 className="mb-4 text-xl font-bold">Start a group</h2>
        <CreateGroupForm />
      </Card>
    </main>
  );
}
