"use client";

// Phase 1 check P1-8: upi:// link + QR on a real phone. Nothing entered here is stored.
import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { buildUpiLink, isValidUpiId } from "@/lib/upi";
import { parseMajorInput } from "@/lib/money";

export default function LabUpiPage() {
  const [vpa, setVpa] = useState("");
  const [name, setName] = useState("Test Payee");
  const [amount, setAmount] = useState("1.00");
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const amountMinor = parseMajorInput(amount, 2);
  const valid = isValidUpiId(vpa) && amountMinor !== null && amountMinor > 0;
  const link = useMemo(
    () => (valid ? buildUpiLink({ pa: vpa, pn: name, amountMinor: amountMinor!, groupName: "Lab test" }) : null),
    [valid, vpa, name, amountMinor],
  );

  useEffect(() => {
    if (!link) return;
    let cancelled = false;
    QRCode.toDataURL(link, { width: 240, margin: 1 }).then((url) => !cancelled && setQr(url));
    return () => {
      cancelled = true;
    };
  }, [link]);

  const field = "min-h-11 w-full rounded-xl border border-border bg-card px-3";

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Lab: UPI link + QR</h1>
      <label className="flex flex-col gap-1 text-sm">
        UPI ID (yours, for testing)
        <input className={field} value={vpa} onChange={(e) => setVpa(e.target.value)} placeholder="name@okicici" autoComplete="off" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Payee name
        <input className={field} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Amount (₹)
        <input className={field} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
      </label>
      {link ? (
        <>
          <a href={link} className="flex min-h-11 items-center justify-center rounded-xl bg-brand px-4 font-semibold text-brand-fg">
            Pay via UPI
          </a>
          <button
            type="button"
            className="min-h-11 rounded-xl border border-border bg-card px-4 font-semibold"
            onClick={async () => {
              await navigator.clipboard.writeText(vpa.trim());
              setCopied(true);
            }}
          >
            {copied ? "Copied" : "Copy UPI ID"}
          </button>
          {qr && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="UPI payment QR code" width={240} height={240} className="mx-auto rounded-xl border border-border bg-white" />
          )}
          <code className="break-all rounded-xl border border-border bg-card p-3 text-xs">{link}</code>
        </>
      ) : (
        <p className="text-sm text-muted">Enter a valid UPI ID and amount.</p>
      )}
    </div>
  );
}
