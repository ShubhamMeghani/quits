"use client";

// R27–R32: photo / camera / paste (and drag-and-drop, R28) → browser compression → extraction.
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { createManualReceiptAction } from "@/app/actions";
import { CameraIcon, ReceiptIcon } from "@/app/_components/icons";
import { useIdentity } from "@/app/_components/identity";
import { Button, Notice } from "@/app/_components/ui";
import { compressImage, CompressError, imageFromClipboard } from "@/app/_lib/compress";

type Status = { kind: "idle" } | { kind: "working"; text: string } | { kind: "error"; text: string; retry: boolean };

export function Scanner() {
  const { group } = useIdentity();
  const router = useRouter();
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [lastFile, setLastFile] = useState<Blob | null>(null);
  const [dragging, setDragging] = useState(false);
  const [manualPending, startManual] = useTransition();
  const busy = status.kind === "working";

  const handle = useCallback(
    async (file: Blob) => {
      setLastFile(file);
      try {
        setStatus({ kind: "working", text: "Compressing photo…" });
        const blob = await compressImage(file);
        setStatus({ kind: "working", text: "Reading the receipt… (usually under 10 s)" });
        const form = new FormData();
        form.append("image", blob, "receipt.jpg");
        const res = await fetch(`/api/g/${group.token}/receipts/extract`, { method: "POST", body: form });
        const body = (await res.json().catch(() => ({}))) as { receiptId?: string; error?: string };
        if (res.ok && body.receiptId) {
          router.push(`/g/${group.token}/receipts/${body.receiptId}`);
          return;
        }
        setStatus({ kind: "error", text: body.error ?? "Couldn't read this receipt", retry: res.status === 502 || res.status >= 500 });
      } catch (e) {
        setStatus({ kind: "error", text: e instanceof CompressError ? e.message : "Couldn't read this receipt", retry: !(e instanceof CompressError) });
      }
    },
    [group.token, router],
  );

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = imageFromClipboard(e);
      if (file && !busy) {
        e.preventDefault();
        void handle(file);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [handle, busy]);

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) void handle(f);
    e.target.value = "";
  };

  const manual = () =>
    startManual(async () => {
      const r = await createManualReceiptAction(group.token);
      if (r.ok) router.push(`/g/${group.token}/receipts/${r.data.id}`);
      else setStatus({ kind: "error", text: r.message, retry: false });
    });

  return (
    <div
      className={`flex flex-col gap-4 rounded-2xl ${dragging ? "outline-dashed outline-2 outline-brand" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const f = [...e.dataTransfer.files].find((x) => x.type.startsWith("image/"));
        if (f && !busy) void handle(f);
      }}
    >
      <Notice>The photo is sent to Google Gemini to read it and is not stored by Quits.</Notice>
      <label className={`flex min-h-16 cursor-pointer items-center justify-center gap-3 rounded-2xl bg-brand px-4 text-lg font-semibold text-brand-fg ${busy ? "pointer-events-none opacity-60" : ""}`}>
        <CameraIcon className="h-7 w-7" />
        Take photo
        <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={onPick} disabled={busy} />
      </label>
      <label className={`flex min-h-14 cursor-pointer items-center justify-center gap-3 rounded-2xl border border-border bg-card px-4 font-semibold ${busy ? "pointer-events-none opacity-60" : ""}`}>
        <ReceiptIcon className="h-6 w-6" />
        Choose image
        <input type="file" accept="image/jpeg,image/png,image/webp,image/*" className="sr-only" onChange={onPick} disabled={busy} />
      </label>
      <p className="text-center text-sm text-muted">On a computer: paste an image (Ctrl+V) or drag it here.</p>

      {status.kind === "working" && (
        <Notice>
          <span className="inline-flex items-center gap-2" aria-live="polite">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-teal-700 border-t-transparent" aria-hidden="true" />
            {status.text}
          </span>
        </Notice>
      )}
      {status.kind === "error" && (
        <div className="flex flex-col gap-2">
          <Notice tone="error">{status.text}</Notice>
          <div className="grid grid-cols-2 gap-2">
            {status.retry && lastFile ? (
              <Button variant="secondary" onClick={() => handle(lastFile)}>
                Retry
              </Button>
            ) : (
              <span />
            )}
            <Button onClick={manual} disabled={manualPending}>
              Enter items manually
            </Button>
          </div>
        </div>
      )}
      {status.kind !== "error" && (
        <Button variant="ghost" onClick={manual} disabled={manualPending || busy}>
          {manualPending ? "Opening…" : "Enter items manually instead"}
        </Button>
      )}
    </div>
  );
}
