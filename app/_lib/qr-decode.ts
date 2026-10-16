// R60: decode a QR code from an image entirely in the browser. The image never leaves the device.
// Uses the built-in BarcodeDetector when available (Chrome on Android), otherwise jsQR.

type Detector = { detect(source: ImageBitmapSource): Promise<{ rawValue: string }[]> };
type DetectorCtor = new (opts: { formats: string[] }) => Detector;

async function decodeWithJsQr(bitmap: ImageBitmap): Promise<string | null> {
  const { default: jsQR } = await import("jsqr");
  // Try the full image, then smaller copies (large screenshots decode better when downscaled).
  for (const maxEdge of [1600, 1000, 700]) {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);
    const code = jsQR(data, w, h, { inversionAttempts: "attemptBoth" });
    if (code?.data) return code.data;
  }
  return null;
}

export async function decodeQrFromFile(file: Blob): Promise<string | null> {
  const bitmap = await createImageBitmap(file);
  try {
    const Ctor = (globalThis as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
    if (Ctor) {
      try {
        const found = await new Ctor({ formats: ["qr_code"] }).detect(bitmap);
        if (found[0]?.rawValue) return found[0].rawValue;
      } catch {
        // fall back to jsQR
      }
    }
    return await decodeWithJsQr(bitmap);
  } finally {
    bitmap.close();
  }
}
