// Browser-side receipt compression (R29): JPEG ≤ 1,000,000 bytes.
// Longest edge ≤ 2000 px, quality 0.85 → 0.5, then shrink dimensions.

export const MAX_UPLOAD_BYTES = 1_000_000;
const QUALITIES = [0.85, 0.75, 0.65, 0.55, 0.5];
const MAX_EDGE = 2000;
const MIN_EDGE = 500;

export class CompressError extends Error {}

async function decode(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bmp, width: bmp.width, height: bmp.height };
    } catch {
      // fall back to <img>
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight };
  } catch {
    throw new CompressError("This image could not be opened. Try a JPEG or PNG photo, or take a screenshot.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new CompressError("Compression failed"))), "image/jpeg", quality),
  );
}

export async function compressImage(file: Blob, maxBytes = MAX_UPLOAD_BYTES): Promise<Blob> {
  const { source, width, height } = await decode(file);
  if (!width || !height) throw new CompressError("This image could not be opened.");
  let edge = Math.min(MAX_EDGE, Math.max(width, height));
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new CompressError("Compression is not supported in this browser.");

  while (edge >= MIN_EDGE) {
    const scale = edge / Math.max(width, height);
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    for (const q of QUALITIES) {
      const blob = await toJpeg(canvas, q);
      if (blob.size <= maxBytes) return blob;
    }
    edge = Math.floor(edge * 0.8);
  }
  throw new CompressError("This image is too large to upload, even after compression.");
}

/** First image found in a paste event's clipboard data. */
export function imageFromClipboard(e: ClipboardEvent): File | null {
  const items = e.clipboardData?.items;
  if (!items) return null;
  for (const item of Array.from(items)) {
    if (item.kind === "file" && item.type.startsWith("image/")) return item.getAsFile();
  }
  return null;
}
