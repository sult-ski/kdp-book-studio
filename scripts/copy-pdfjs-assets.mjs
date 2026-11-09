// Copies runtime assets into public/ so the app loads them from our own origin (no CDN, the PDF never leaves
// the device). Runs before `npm run dev` and `npm run build`. public/pdfjs/ and public/ocr/ are generated
// (git-ignored).
//
// pdf.js (public/pdfjs/):
//   standard_fonts  outlines for the 14 standard PDF fonts, so unembedded text still renders
//   cmaps           character maps for CJK and other CID fonts
//   wasm            JPEG 2000 / JBIG2 image decoders
// Tesseract.js OCR (public/ocr/), loaded only when a cover panel has no real text:
//   worker.min.js   Tesseract's worker script, bundled here (the npm package doesn't ship a built one)
//   core/           the OCR engine (WebAssembly, LSTM-only builds: plain, SIMD and relaxed-SIMD; a device loads one)
//   lang/           English model (4.0.0_best_int, ~3 MB gzipped)
import { cpSync, rmSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const nm = (p) => fileURLToPath(new URL(`../node_modules/${p}`, import.meta.url));
const pub = (p) => fileURLToPath(new URL(`../public/${p}`, import.meta.url));

rmSync(pub('pdfjs'), { recursive: true, force: true });
for (const dir of ['standard_fonts', 'cmaps', 'wasm']) {
  cpSync(nm(`pdfjs-dist/${dir}`), pub(`pdfjs/${dir}`), { recursive: true });
}
console.log('pdf.js assets copied to public/pdfjs/');

rmSync(pub('ocr'), { recursive: true, force: true });
mkdirSync(pub('ocr/core'), { recursive: true });
mkdirSync(pub('ocr/lang'), { recursive: true });
for (const f of ['tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm.js']) {
  cpSync(nm(`tesseract.js-core/${f}`), pub(`ocr/core/${f}`));
}
cpSync(nm('@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz'), pub('ocr/lang/eng.traineddata.gz'));
await build({
  entryPoints: [nm('tesseract.js/src/worker-script/browser/index.js')],
  outfile: pub('ocr/worker.min.js'),
  bundle: true,
  minify: true,
  format: 'iife',
  platform: 'browser',
  define: { global: 'self' },
  // Tesseract only needs two checks from wasm-feature-detect, whose build uses syntax our esbuild can't parse.
  // Same byte probes as wasm-feature-detect 1.8 (Apache-2.0).
  plugins: [{
    name: 'wasm-feature-detect-shim',
    setup(b) {
      b.onResolve({ filter: /^wasm-feature-detect$/ }, () => ({ path: 'wfd', namespace: 'shim' }));
      b.onLoad({ filter: /.*/, namespace: 'shim' }, () => ({
        contents: `
          const ok = (bytes) => async () => WebAssembly.validate(new Uint8Array(bytes));
          module.exports = {
            simd: ok([0,97,115,109,1,0,0,0,1,5,1,96,0,1,123,3,2,1,0,10,10,1,8,0,65,0,253,15,253,98,11]),
            relaxedSimd: ok([0,97,115,109,1,0,0,0,1,5,1,96,0,1,123,3,2,1,0,10,15,1,13,0,65,1,253,15,65,2,253,15,253,128,2,11]),
          };`,
        loader: 'js',
      }));
    },
  }],
  legalComments: 'none',
  logLevel: 'warning',
});
console.log('Tesseract.js assets copied to public/ocr/');
