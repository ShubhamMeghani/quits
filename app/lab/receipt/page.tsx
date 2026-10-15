"use client";

// Phase 1 check P1-6: photo/camera/paste → browser compression → Gemini JSON. Deleted in task 1.21.
import { useCallback, useEffect, useState } from "react";
import { compressImage, imageFromClipboard, CompressError } from "@/app/_lib/compress";

type LabResult = { model: string; bytes: number; latencyMs: number; data: unknown } | { error: string; reason?: string };

export default function LabReceiptPage() {
  const [status, setStatus] = useState("Pick, capture or paste a receipt photo.");
  const [original, setOriginal] = useState<number | null>(null);
  const [compressed, setCompressed] = useState<number | null>(null);
  const [result, setResult] = useState<LabResult | null>(null);
  const [busy, setBusy] = useState(false);

  const handle = useCallback(async (file: Blob) => {
    setBusy(true);
    setResult(null);
    setOriginal(file.size);
    setCompressed(null);
    try {
      setStatus("Compressing…");
      const blob = await compressImage(file);
      setCompressed(blob.size);
      setStatus("Reading with Gemini…");
      const form = new FormData();
      form.append("image", blob, "receipt.jpg");
      const t0 = performance.now();
      const res = await fetch("/api/lab/extract", { method: "POST", body: form });
      const json = (await res.json()) as LabResult;
      setResult(json);
      setStatus(`HTTP ${res.status} in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
    } catch (e) {
      setStatus(e instanceof CompressError ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = imageFromClipboard(e);
      if (file) {
        e.preventDefault();
        void handle(file);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [handle]);

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) void handle(f);
    e.target.value = "";
  };

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Lab: receipt → Gemini</h1>
      <p className="text-sm text-muted">The photo is sent to Google Gemini to read it and is not stored by Quits.</p>
      <label className="flex min-h-11 cursor-pointer items-center justify-center rounded-xl bg-brand px-4 font-semibold text-brand-fg">
        Take photo
        <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={onPick} disabled={busy} />
      </label>
      <label className="flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-border bg-card px-4 font-semibold">
        Choose image
        <input type="file" accept="image/jpeg,image/png,image/webp,image/*" className="sr-only" onChange={onPick} disabled={busy} />
      </label>
      <p className="text-sm text-muted">On desktop: copy an image and press Ctrl+V here.</p>
      <div className="rounded-xl border border-border bg-card p-3 text-sm" aria-live="polite">
        <p>{status}</p>
        {original !== null && <p>Original: {original.toLocaleString("en-IN")} bytes</p>}
        {compressed !== null && (
          <p>
            Uploaded: {compressed.toLocaleString("en-IN")} bytes {compressed <= 1_000_000 ? "✓ ≤ 1 MB" : "✗ over 1 MB"}
          </p>
        )}
      </div>
      {result && (
        <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-xl border border-border bg-card p-3 text-xs">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}
