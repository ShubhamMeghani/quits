"use client";

import { Button, Notice } from "@/app/_components/ui";

// R51: human-readable error with a retry (re-fetches the segment); no internals are shown.
export default function GroupError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div className="flex flex-col gap-3 py-6">
      <Notice tone="error">Something went wrong while loading this page. Please try again.</Notice>
      <Button onClick={() => retry()}>Try again</Button>
    </div>
  );
}
