import type { Metadata } from "next";
import { DemoStarter } from "@/app/_components/demo-buttons";

// R73 (Should, SPEC v1.7): a shareable link that opens a fresh demo group, e.g. for evaluators.
export const metadata: Metadata = {
  title: "Demo — Quits",
  robots: { index: false, follow: false },
};

export default function DemoPage() {
  return (
    <main className="mx-auto flex w-full max-w-[480px] flex-1 flex-col items-center justify-center px-4 py-16">
      <DemoStarter />
    </main>
  );
}
