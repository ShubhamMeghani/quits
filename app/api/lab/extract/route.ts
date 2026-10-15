// Phase 1 lab route (P1-6). Deleted in task 1.21 once the Gemini check passes.
import { connection } from "next/server";
import { extractReceipt } from "@/lib/receipt";
import { geminiReceiptClient, geminiModel } from "@/server/gemini";
import { MAX_RECEIPT_BYTES, sniffImage } from "@/server/image";

export const maxDuration = 60;

export async function POST(request: Request) {
  await connection();
  const form = await request.formData().catch(() => null);
  const file = form?.get("image");
  if (!(file instanceof Blob)) return Response.json({ error: "No image" }, { status: 400 });
  if (file.size > MAX_RECEIPT_BYTES) return Response.json({ error: "Image too large" }, { status: 413 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mimeType = sniffImage(bytes);
  if (!mimeType) return Response.json({ error: "Unsupported image type" }, { status: 415 });

  const result = await extractReceipt(
    { base64: Buffer.from(bytes).toString("base64"), mimeType },
    geminiReceiptClient,
  );
  if (!result.ok) {
    console.error(`lab extract failed: ${result.reason}`);
    return Response.json({ error: "Couldn't read this receipt", reason: result.reason }, { status: 502 });
  }
  return Response.json({ model: geminiModel(), bytes: bytes.length, latencyMs: result.latencyMs, data: result.data });
}
