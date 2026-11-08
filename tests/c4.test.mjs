// Phase 2, milestone C4 tests: cover fonts, image DPI, text under 7 pt and the barcode area (best-effort).
// 6" x 9", cream, 120 pages: spine 0.3" from x 6.125" to 6.425"; cover 12.55" x 9.25".
// Barcode box (suggested 2" x 1.2"): x 3.875"-5.875", y 7.875"-9.075"; minimum 1.4" x 0.8": x 4.475", y 8.275".
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { makeCover } from './fixtures/make-cover.mjs';
import { preflightCover } from '../src/engine/cover/preflightCover.js';

const specs = JSON.parse(readFileSync(new URL('../src/config/kdp-specs.json', import.meta.url)));
const env = { pdfjs, docOptions: { standardFontDataUrl: 'node_modules/pdfjs-dist/standard_fonts/' } };
let passed = 0;
const test = async (name, fn) => { await fn(); passed++; console.log('✓', name); };

const S = { trim: '6x9', inkPaper: 'bw_cream', pages: 120 };
const run = async (o = {}) => preflightCover(specs, await makeCover({ w: 12.55, h: 9.25, ...o }), S, env);
const ids = (r) => r.issues.map((i) => i.id);
const byCheck = (r, c) => r.issues.filter((i) => i.checkId === c);
const TITLE = { str: 'The Quiet Harbour', cx: 9.425, cy: 2, size: 24 };
const COVER_SRC = specs._meta.sources.cover;

await test('clean cover: no font, DPI, size or barcode issues', async () => {
  const r = await run({ text: [TITLE], images: [{ pxW: 1800, pxH: 2700, x: 6.6, y: 0.3, w: 5.8, h: 8.65 }] });
  for (const c of ['fonts', 'images', 'fontSize', 'coverBarcode']) assert.deepEqual(byCheck(r, c), [], c);
});

await test('unembedded font on the cover: fail, verified', async () => {
  const r = await run({ text: [TITLE], unembedded: true });
  const [i] = byCheck(r, 'fonts');
  assert.equal(i.severity, 'fail');
  assert.equal(i.page, 1);
  assert.match(i.message, /Helvetica/);
});

await test('fonts only on extra pages are not reported twice (multi-page cover is already a Must fix)', async () => {
  const r = await run({ text: [TITLE], pages: 2 });
  assert.ok(r.issues.every((i) => i.page == null || i.page === 1), ids(r).join());
});

await test('150 DPI cover image: warn, with the cover source', async () => {
  const low = await run({ images: [{ pxW: 870, pxH: 1298, x: 6.6, y: 0.3, w: 5.8, h: 8.65 }] });
  const [i] = byCheck(low, 'images');
  assert.equal(i.severity, 'warn');
  assert.equal(i.measured, '150 DPI');
  assert.match(i.message, /our threshold/);
  assert.equal(i.source, COVER_SRC);
});

await test('text under 7 pt on the cover: warn, best-effort, with cover-specific source', async () => {
  const r = await run({ text: [TITLE, { str: 'tiny print', cx: 9.4, cy: 5, size: 5 }] });
  const [i] = byCheck(r, 'fontSize');
  assert.equal(i.severity, 'warn');
  assert.equal(i.accuracy, 'best-effort');
  assert.equal(i.measured, '5 pt');
  assert.equal(i.source, specs._meta.sources.fontSize);
});

await test('art over the whole barcode area: warn, best-effort, says ignore if own barcode', async () => {
  const r = await run({ fills: [{ x: 0, y: 0, w: 6.2, h: 9.25 }] });
  const [i] = byCheck(r, 'coverBarcode');
  assert.equal(i.id, 'cover-barcode-blocked');
  assert.equal(i.severity, 'warn');
  assert.equal(i.accuracy, 'best-effort');
  assert.match(i.message, /1\.4" x 0\.8"/);
  assert.match(i.message, /own barcode/);
  assert.equal(i.source, specs._meta.sources.barcode);
  assert.ok(i.bbox && Math.abs(i.bbox.width - 2) < 1e-9);
});

await test('art in the suggested box but the minimum box clear: info, "minimum is clear"', async () => {
  const r = await run({ fills: [{ x: 3.9, y: 7.9, w: 0.4, h: 0.3 }] });
  const [i] = byCheck(r, 'coverBarcode');
  assert.equal(i.id, 'cover-barcode-small');
  assert.equal(i.severity, 'info');
});

await test('art just outside the barcode box (0.25" clearance strip): no barcode issue', async () => {
  const r = await run({ fills: [{ x: 5.95, y: 0, w: 0.175, h: 9.25 }, { x: 0, y: 9.12, w: 6.125, h: 0.13 }] });
  assert.deepEqual(byCheck(r, 'coverBarcode'), []);
});

await test('wrong-size cover: barcode check skipped (size issue explains)', async () => {
  const r = await preflightCover(specs, await makeCover({ w: 12, h: 9, fills: [{ x: 0, y: 0, w: 12, h: 9 }] }), S, env);
  assert.deepEqual(byCheck(r, 'coverBarcode'), []);
});

await test('cover fixes speak Canva first, then Photoshop/Affinity, never LibreOffice', async () => {
  const r = await run({ unembedded: true, text: [TITLE, { str: 'tiny', cx: 9.4, cy: 5, size: 5 }],
    images: [{ pxW: 870, pxH: 1298, x: 6.6, y: 0.3, w: 5.8, h: 8.65 }] });
  for (const c of ['fonts', 'images', 'fontSize']) {
    const [i] = byCheck(r, c);
    assert.match(i.fix, /Canva[\s\S]*PDF Print[\s\S]*Flatten PDF[\s\S]*Photoshop or Affinity: export as PDF\/X-1a/, c);
    assert.doesNotMatch(i.fix, /LibreOffice|Word/, c);
  }
  assert.match(byCheck(r, 'images')[0].fix, /^Use a higher-resolution version \(at least 1741 x 2595 pixels/);
});

console.log(`\nC4: ${passed} tests passed`);
