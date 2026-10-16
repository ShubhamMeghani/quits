// R30–R32: receipt extraction. Size and type are checked before anything else, then the daily
// scan limits; only then is Gemini called. The image is never stored or logged.
import { connection } from "next/server";
import { extractReceipt } from "@/lib/receipt";
import { findGroupByToken } from "@/server/context";
import { geminiModel, geminiReceiptClient } from "@/server/gemini";
import { MAX_RECEIPT_BYTES, sniffImage } from "@/server/image";
import { bumpScanLimits, createReceiptDraft } from "@/server/receipts";

export const maxDuration = 60;

const json = (body: unknown, status: number) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request, ctx: RouteContext<"/api/g/[token]/receipts/extract">) {
  await connection();
  const { token } = await ctx.params;
  const group = await findGroupByToken(token);
  if (!group) return json({ error: "Group not found" }, 404);

  // Reject obviously oversized bodies before reading them (multipart adds a little overhead).
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_RECEIPT_BYTES + 64 * 1024) return json({ error: "Image too large (max 1 MB)" }, 413);

  const form = await request.formData().catch(() => null);
  const file = form?.get("image");
  if (!(file instanceof Blob)) return json({ error: "No image received" }, 400);
  if (file.size > MAX_RECEIPT_BYTES) return json({ error: "Image too large (max 1 MB)" }, 413);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mimeType = sniffImage(bytes);
  if (!mimeType) return json({ error: "Unsupported image type. Use a JPEG, PNG or WebP photo." }, 415);

  if (!(await bumpScanLimits(group.id))) {
    return json({ error: "Daily scan limit reached — enter items manually" }, 429);
  }

  const result = await extractReceipt({ base64: Buffer.from(bytes).toString("base64"), mimeType }, geminiReceiptClient, {
    fallbackCurrency: group.baseCurrency,
  });
  if (!result.ok) {
    console.error(`receipt extract failed: ${result.reason}`);
    return json({ error: "Couldn't read this receipt", reason: result.reason }, 502);
  }
  let parsedRaw: unknown = null;
  try {
    parsedRaw = JSON.parse(result.raw);
  } catch {
    parsedRaw = null;
  }
  const receiptId = await createReceiptDraft(group, result.data, { model: geminiModel(), extracted: parsedRaw });
  return json({ receiptId, latencyMs: result.latencyMs }, 200);
}
