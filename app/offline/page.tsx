export const metadata = { title: "Offline — Quits" };

export default function OfflinePage() {
  return (
    <main className="mx-auto flex w-full max-w-[640px] flex-1 flex-col items-center justify-center gap-3 px-4 py-16 text-center">
      <h1 className="text-2xl font-bold">You&apos;re offline</h1>
      <p className="text-muted">Quits needs a connection to load and save expenses. Reconnect and try again.</p>
    </main>
  );
}
