// Renders the app icons from public/icons/icon.svg. Run once after changing the SVG:
//   node scripts/make-icons.mjs
// Uses @napi-rs/canvas, which pdfjs-dist installs for Node (not a direct dependency of the app).
// The PNGs are committed, so a normal build doesn't need this script.
import { readFileSync, writeFileSync } from 'node:fs';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const dir = new URL('../public/icons/', import.meta.url);
const svg = await loadImage(readFileSync(new URL('icon.svg', dir)));

function render(size, { maskable = false } = {}) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  if (maskable) {
    // Maskable icons get cropped to a circle or squircle: fill edge to edge, keep the art in the middle 80%.
    ctx.fillStyle = '#1e4d3b';
    ctx.fillRect(0, 0, size, size);
    const inner = size * 0.8;
    ctx.drawImage(svg, (size - inner) / 2, (size - inner) / 2, inner, inner);
  } else {
    ctx.drawImage(svg, 0, 0, size, size);
  }
  return canvas.toBuffer('image/png');
}

const out = {
  'icon-192.png': render(192),
  'icon-512.png': render(512),
  'maskable-512.png': render(512, { maskable: true }),
  'apple-touch-icon.png': render(180, { maskable: true }), // iOS rounds the corners itself
};
for (const [name, png] of Object.entries(out)) {
  writeFileSync(new URL(name, dir), png);
  console.log('wrote public/icons/' + name, png.length, 'bytes');
}
