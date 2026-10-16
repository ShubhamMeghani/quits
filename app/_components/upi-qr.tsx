"use client";

// QR-first UPI settle-up (R24–R26, R59; SPEC v0.5 D-18). Quits never processes payments:
// nothing here records anything — only "Mark as paid" does (R25).
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { buildUpiLink, UPI_SOFT_LIMIT_MINOR } from "@/lib/upi";
import { money } from "@/app/_lib/format";
import { CloseIcon, CopyIcon, DownloadIcon, ExpandIcon } from "./icons";
import { Button } from "./ui";

export type UpiPayee = { name: string; upiId: string; upiName: string | null };

function useQrDataUrl(text: string, width: number) {
  const [url, setUrl] = useState<{ text: string; url: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(text, { width, margin: 2, errorCorrectionLevel: "M" }).then((u) => !cancelled && setUrl({ text, url: u }));
    return () => {
      cancelled = true;
    };
  }, [text, width]);
  return url?.text === text ? url.url : null;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** A PNG with the QR plus payee and amount, for scanning from the gallery in any UPI app. */
async function saveQrImage(link: string, payee: UpiPayee, amountMinor: number) {
  const qr = await loadImage(await QRCode.toDataURL(link, { width: 640, margin: 2, errorCorrectionLevel: "M" }));
  const canvas = document.createElement("canvas");
  canvas.width = 720;
  canvas.height = 1000;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#0f172a";
  ctx.textAlign = "center";
  ctx.font = "600 34px system-ui, sans-serif";
  ctx.fillText(`Pay ${payee.upiName ?? payee.name}`, 360, 70);
  ctx.font = "700 64px system-ui, sans-serif";
  ctx.fillText(money(amountMinor, "INR"), 360, 150);
  ctx.drawImage(qr, 40, 190, 640, 640);
  ctx.font = "400 30px system-ui, sans-serif";
  ctx.fillText(payee.upiId, 360, 880);
  ctx.fillStyle = "#475569";
  ctx.font = "400 24px system-ui, sans-serif";
  ctx.fillText("Scan with any UPI app · then tap “Mark as paid” in Quits", 360, 940);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
  if (!blob) throw new Error("PNG failed");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `quits-pay-${(payee.name || "upi").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${amountMinor / 100}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function UpiQr({ payee, amountMinor, groupName }: { payee: UpiPayee; amountMinor: number; groupName: string }) {
  const link = buildUpiLink({ pa: payee.upiId, pn: payee.upiName ?? payee.name, amountMinor, groupName });
  const qr = useQrDataUrl(link, 480);
  const [full, setFull] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFull(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [full]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(payee.upiId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  };

  const save = async () => {
    setSaveState("saving");
    try {
      await saveQrImage(link, payee, amountMinor);
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-white p-3">
        {qr ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qr} alt={`UPI QR code to pay ${payee.name} ${money(amountMinor, "INR")}`} width={220} height={220} className="h-[220px] w-[220px]" />
        ) : (
          <div className="h-[220px] w-[220px] animate-pulse rounded-xl bg-slate-200" aria-label="Loading QR code" />
        )}
        <p className="text-center text-sm text-muted">Scan with any UPI app — amount is filled in</p>
      </div>

      {/* Stacked on phones so "Save QR image" and "Show full screen" stay on one line (R24 labels). */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Button variant="secondary" onClick={save} disabled={saveState === "saving"}>
          <DownloadIcon className="h-5 w-5" />
          {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : "Save QR image"}
        </Button>
        <Button variant="secondary" onClick={() => setFull(true)}>
          <ExpandIcon className="h-5 w-5" />
          Show full screen
        </Button>
      </div>
      {saveState === "saved" && <p className="text-sm text-muted">Saved to Downloads. In your UPI app, choose “scan from gallery”.</p>}
      {saveState === "error" && <p className="text-sm font-medium text-danger">Couldn&apos;t save the image. Take a screenshot of the QR instead.</p>}

      <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3">
        <div className="min-w-0 flex-1">
          <p className="text-2xl font-bold">{money(amountMinor, "INR")}</p>
          <p className="truncate text-sm text-muted">to {payee.upiId}</p>
        </div>
        <Button variant="secondary" onClick={copy} aria-label={`Copy UPI ID ${payee.upiId}`}>
          <CopyIcon className="h-5 w-5" />
          {copied ? "Copied" : "Copy UPI ID"}
        </Button>
      </div>

      {amountMinor > UPI_SOFT_LIMIT_MINOR && (
        <p className="text-sm font-medium text-amber-800">UPI apps may limit a single payment to ₹1,00,000. You may need to pay in parts.</p>
      )}

      <a href={link} className="inline-flex min-h-11 flex-col items-center justify-center rounded-xl px-3 text-center text-sm font-semibold text-brand hover:bg-teal-50">
        Pay via UPI app
        <span className="text-xs font-normal text-muted">May be blocked by some UPI apps</span>
      </a>

      {full && (
        <div role="dialog" aria-modal="true" aria-label="UPI QR code, full screen" className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-white p-4">
          <button type="button" onClick={() => setFull(false)} aria-label="Close" className="absolute right-3 top-3 inline-flex h-12 w-12 items-center justify-center rounded-full border border-border">
            <CloseIcon />
          </button>
          <p className="text-lg font-semibold">Pay {payee.upiName ?? payee.name}</p>
          <p className="text-4xl font-bold">{money(amountMinor, "INR")}</p>
          {qr && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="UPI QR code" className="aspect-square w-[min(90vw,62vh)]" />
          )}
          <p className="text-muted">{payee.upiId}</p>
        </div>
      )}
    </div>
  );
}
