"use client";

// R2 share screen (access notice, copy link, native share) and R3 group-link QR (Should).
import QRCode from "qrcode";
import { useEffect, useState, useSyncExternalStore } from "react";
import { CopyIcon, ShareIcon } from "@/app/_components/icons";
import { useIdentity } from "@/app/_components/identity";
import { Button, Card, Notice } from "@/app/_components/ui";

const noop = () => () => undefined;

export function SharePanel({ created }: { created: boolean }) {
  const { group } = useIdentity();
  const origin = useSyncExternalStore(noop, () => window.location.origin, () => "");
  const canShare = useSyncExternalStore(noop, () => typeof navigator.share === "function", () => false);
  const url = origin ? `${origin}/g/${group.token}` : "";
  const [copied, setCopied] = useState(false);
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    QRCode.toDataURL(url, { width: 360, margin: 2 }).then((u) => !cancelled && setQr(u));
    return () => {
      cancelled = true;
    };
  }, [url]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  };
  const share = async () => {
    try {
      await navigator.share({ title: group.name, text: `Join "${group.name}" on Quits to split expenses`, url });
    } catch {
      // user cancelled
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {created && <Notice tone="ok">Group created. Share the link with everyone in the group.</Notice>}
      <Notice tone="warn">Anyone with this link can view and edit this group.</Notice>
      <Card className="flex flex-col gap-3">
        <p className="break-all rounded-xl bg-track px-3 py-2 font-mono text-sm">{url || "…"}</p>
        <div className={`grid gap-2 ${canShare ? "grid-cols-2" : "grid-cols-1"}`}>
          <Button onClick={copy} disabled={!url}>
            <CopyIcon className="h-5 w-5" />
            {copied ? "Copied" : "Copy link"}
          </Button>
          {canShare && (
            <Button variant="secondary" onClick={share}>
              <ShareIcon className="h-5 w-5" />
              Share
            </Button>
          )}
        </div>
      </Card>
      <Card className="flex flex-col items-center gap-2">
        <p className="text-sm font-medium text-muted">Open on another phone: scan this</p>
        {qr ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qr} alt="QR code of the group link" width={220} height={220} className="h-[220px] w-[220px]" />
        ) : (
          <div className="h-[220px] w-[220px] animate-pulse rounded-xl bg-track" />
        )}
      </Card>
    </div>
  );
}
