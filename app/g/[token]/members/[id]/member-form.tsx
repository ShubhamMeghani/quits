"use client";

// R6: rename and UPI ID; R60 (Should): fill the UPI ID from a screenshot of your own UPI QR,
// decoded in the browser — only the UPI ID and name are sent, never the image; R7: archive.
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { archiveMemberAction, updateMemberAction } from "@/app/actions";
import { QrIcon } from "@/app/_components/icons";
import { useIdentity } from "@/app/_components/identity";
import { Button, Field, inputClass, Notice } from "@/app/_components/ui";
import { decodeQrFromFile } from "@/app/_lib/qr-decode";
import { isValidUpiId, parseUpiUri } from "@/lib/upi";

export function MemberForm({ id }: { id: string }) {
  const { group, members, me } = useIdentity();
  const router = useRouter();
  const member = members.find((m) => m.id === id);
  const [name, setName] = useState(member?.name ?? "");
  const [upiId, setUpiId] = useState(member?.upiId ?? "");
  const [upiName, setUpiName] = useState<string | null>(member?.upiName ?? null);
  const [qrMessage, setQrMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  if (!member) return <Notice tone="error">Member not found.</Notice>;

  const onQr = async (file: File | undefined) => {
    setQrMessage(null);
    if (!file) return;
    try {
      const text = await decodeQrFromFile(file);
      const parsed = text ? parseUpiUri(text) : null;
      if (!parsed) return setQrMessage({ tone: "error", text: "No UPI QR code found" });
      setUpiId(parsed.pa);
      setUpiName(parsed.pn);
      setQrMessage({ tone: "ok", text: `Found ${parsed.pn ? `${parsed.pn} · ` : ""}${parsed.pa}. Tap Save to keep it.` });
    } catch {
      setQrMessage({ tone: "error", text: "No UPI QR code found" });
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const save = () =>
    start(async () => {
      setError(null);
      setErrors({});
      setSaved(false);
      const trimmed = upiId.trim();
      if (trimmed && !isValidUpiId(trimmed)) return setErrors({ upiId: "Invalid UPI ID" });
      const nameChangedId = trimmed !== (member.upiId ?? "");
      const r = await updateMemberAction(
        group.token,
        id,
        { name, upiId: trimmed, upiName: nameChangedId || upiName !== member.upiName ? (trimmed ? upiName : null) : undefined },
        me ?? null,
      );
      if (!r.ok) {
        setErrors(r.fields ?? {});
        return setError(r.fields ? null : r.message);
      }
      setSaved(true);
    });

  const archive = () =>
    start(async () => {
      setError(null);
      const r = await archiveMemberAction(group.token, id, me ?? null);
      if (!r.ok) return setError(r.message);
      router.push(`/g/${group.token}/members`);
    });

  return (
    <div className="flex flex-col gap-4">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field label="Name" htmlFor="m-name" error={errors.name}>
          <input id="m-name" className={inputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={30} />
        </Field>
        <Field label="UPI ID (optional)" htmlFor="m-upi" error={errors.upiId} hint="Others scan a QR with this ID to pay you.">
          <input
            id="m-upi"
            className={inputClass}
            value={upiId}
            onChange={(e) => {
              setUpiId(e.target.value);
              setUpiName(null);
            }}
            placeholder="name@okicici"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        </Field>
        <div className="flex flex-col gap-2 rounded-2xl border border-dashed border-border p-3">
          <p className="text-sm text-muted">
            Or use a screenshot of your own UPI QR (from GPay, PhonePe or Paytm). It&apos;s read on this device; only the UPI ID and name are saved.
          </p>
          <label className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 font-semibold">
            <QrIcon className="h-5 w-5" />
            Set from my UPI QR
            <input ref={fileRef} type="file" accept="image/*" className="sr-only" onChange={(e) => onQr(e.target.files?.[0])} />
          </label>
          {qrMessage && <Notice tone={qrMessage.tone}>{qrMessage.text}</Notice>}
        </div>
        {error && <Notice tone="error">{error}</Notice>}
        {saved && <Notice tone="ok">Saved.</Notice>}
        <Button type="submit" disabled={pending || !name.trim()}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </form>
      {!member.archived && (
        <Button variant="danger" onClick={archive} disabled={pending}>
          Archive member
        </Button>
      )}
    </div>
  );
}
