// Copies pdf.js runtime assets into public/pdfjs/ so the worker can load them from our own origin
// (no CDN, the PDF never leaves the device):
//   standard_fonts  outlines for the 14 standard PDF fonts, so unembedded text still renders
//   cmaps           character maps for CJK and other CID fonts
//   wasm            JPEG 2000 / JBIG2 image decoders
// Runs before `npm run dev` and `npm run build`. public/pdfjs/ is generated, so it is git-ignored.
import { cpSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const from = fileURLToPath(new URL('../node_modules/pdfjs-dist/', import.meta.url));
const to = fileURLToPath(new URL('../public/pdfjs/', import.meta.url));

rmSync(to, { recursive: true, force: true });
for (const dir of ['standard_fonts', 'cmaps', 'wasm']) {
  cpSync(from + dir, to + dir, { recursive: true });
}
console.log('pdf.js assets copied to public/pdfjs/');
