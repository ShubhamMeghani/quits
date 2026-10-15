// Generates PWA icons from public/icon.svg and public/icon-maskable.svg (R52). Run: npm run icons
import sharp from "sharp";

const out = [
  ["public/icon.svg", "public/icons/icon-192.png", 192],
  ["public/icon.svg", "public/icons/icon-512.png", 512],
  ["public/icon-maskable.svg", "public/icons/maskable-512.png", 512],
  ["public/icon-maskable.svg", "public/icons/apple-touch-icon.png", 180],
];

for (const [src, dest, size] of out) {
  await sharp(src, { density: 300 }).resize(size, size).png().toFile(dest);
  console.log(`${dest} (${size}px)`);
}
