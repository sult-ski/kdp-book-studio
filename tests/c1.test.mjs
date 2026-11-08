// Phase 2, milestone C1 tests: cover specs, spine width, full cover size, layout and the PDF template.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { spineWidth, coverSize, latestVerified } from '../src/engine/specs.js';
import { coverLayout } from '../src/engine/cover/layout.js';
import { makeCoverTemplate } from '../src/engine/cover/template.js';
import { inches3 } from '../src/engine/format.js';

const specs = JSON.parse(readFileSync(new URL('../src/config/kdp-specs.json', import.meta.url)));
let passed = 0;
const test = async (name, fn) => { await fn(); passed++; console.log('✓', name); };
const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} ≈ ${b}`);

await test('cover section: every rule has a source URL and lastVerified 2026-11-06', () => {
  const c = specs.cover;
  for (const key of ['size', 'spine', 'safeArea', 'spineText', 'fold', 'barcode', 'fonts', 'images']) {
    assert.ok(c[key], `cover.${key} exists`);
    assert.match(specs._meta.sources[c[key].source], /^https:\/\/kdp\.amazon\.com\//, `cover.${key} source`);
    assert.equal(c[key].lastVerified, '2026-11-06');
  }
  assert.match(specs._meta.sources.barcode, /G5HDYGP4BXLX4RUW/);
  assert.match(specs._meta.sources.fontSize, /G201113520/);
});

await test('spine width per page, for each ink and paper', () => {
  near(spineWidth(specs, 'bw_white', 100), 0.2252);
  near(spineWidth(specs, 'bw_cream', 100), 0.25);
  near(spineWidth(specs, 'bw_groundwood', 100), 0.235);
  near(spineWidth(specs, 'color_premium', 100), 0.2347);
  near(spineWidth(specs, 'color_standard', 100), 0.2252);
  assert.throws(() => spineWidth(specs, 'nope', 100));
});

await test('full cover size = bleed + back + spine + front + bleed; height = bleed + trim + bleed', () => {
  const s = coverSize(specs, '6x9', 'bw_white', 100);
  near(s.spineIn, 0.2252);
  near(s.widthIn, 0.125 + 6 + 0.2252 + 6 + 0.125);
  near(s.heightIn, 9.25);
  const real = coverSize(specs, '5.5x8.5', 'bw_cream', 64); // the owner's 63-page book prints 64 pages
  near(real.spineIn, 0.16);
  near(real.widthIn, 11.41);
  near(real.heightIn, 8.75);
});

await test('spine text: allowed from 79 pages, with a Cover Creator note at 79', () => {
  assert.equal(coverLayout(specs, { trim: '6x9', inkPaper: 'bw_white', pages: 78 }).spineText.allowed, false);
  const at79 = coverLayout(specs, { trim: '6x9', inkPaper: 'bw_white', pages: 79 }).spineText;
  assert.equal(at79.allowed, true);
  assert.match(at79.note, /Cover Creator/);
  assert.equal(coverLayout(specs, { trim: '6x9', inkPaper: 'bw_white', pages: 80 }).spineText.note, null);
});

await test('layout: back on the left, spine, front on the right; safe areas 0.25" inside trim', () => {
  const L = coverLayout(specs, { trim: '6x9', inkPaper: 'bw_white', pages: 200 });
  const spine = 200 * 0.002252;
  near(L.rects.back.x, 0.125); near(L.rects.back.y, 0.125); near(L.rects.back.width, 6); near(L.rects.back.height, 9);
  near(L.rects.spine.x, 6.125); near(L.rects.spine.width, spine);
  near(L.rects.front.x, 6.125 + spine); near(L.rects.front.width, 6);
  near(L.rects.backSafe.x, 0.375); near(L.rects.backSafe.width, 5.5); near(L.rects.backSafe.height, 8.5);
  near(L.rects.frontSafe.x, 6.125 + spine + 0.25);
  // Spine text keeps 0.0625" clear of each fold.
  near(L.rects.spineSafe.x, 6.125 + 0.0625); near(L.rects.spineSafe.width, spine - 0.125);
  // Fold lines with KDP's ±0.0625" variance.
  near(L.folds[0].x, 6.125); near(L.folds[1].x, 6.125 + spine);
  near(L.folds[0].band.x, 6.125 - 0.0625); near(L.folds[0].band.width, 0.125);
  assert.ok(L.inRange);
});

await test('barcode box: 2" x 1.2", 0.25" from the spine and the bottom trim, on the back cover', () => {
  const L = coverLayout(specs, { trim: '6x9', inkPaper: 'bw_cream', pages: 120 });
  const b = L.rects.barcode;
  near(b.width, 2); near(b.height, 1.2);
  near(L.rects.spine.x - (b.x + b.width), 0.25);
  near((L.rects.back.y + L.rects.back.height) - (b.y + b.height), 0.25);
  assert.ok(b.x >= L.rects.back.x);
});

await test('page counts outside the range for the trim and paper are reported, not silently used', () => {
  const low = coverLayout(specs, { trim: '6x9', inkPaper: 'bw_white', pages: 10 });
  assert.equal(low.inRange, false);
  assert.deepEqual(low.pageRange, [24, 828]);
  const none = coverLayout(specs, { trim: '8.27x11.69', inkPaper: 'color_standard', pages: 100 });
  assert.equal(none.pageRange, null);
  assert.equal(none.inRange, false);
});

await test('template PDF: one page at the full cover size, with the guide notes', async () => {
  const bytes = await makeCoverTemplate(specs, { trim: '5.5x8.5', inkPaper: 'bw_cream', pages: 64 });
  const doc = await PDFDocument.load(bytes);
  assert.equal(doc.getPageCount(), 1);
  const { width, height } = doc.getPage(0).getSize();
  near(width, 11.41 * 72, 1e-6);
  near(height, 8.75 * 72, 1e-6);
  assert.match(doc.getTitle(), /KDP cover template/);
  // Text is readable by pdf.js (labels are real text, not outlines).
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes), verbosity: 0 }).promise;
  const text = (await (await pdf.getPage(1)).getTextContent()).items.map((i) => i.str).join(' ');
  for (const word of ['BACK COVER', 'FRONT COVER', 'SPINE', 'Barcode', 'Safe area', 'Delete']) assert.match(text, new RegExp(word));
});

await test("matches KDP's own cover calculator: 5.5x8.5, white, 63 pages (count as entered)", () => {
  const L = coverLayout(specs, { trim: '5.5x8.5', inkPaper: 'bw_white', pages: 63 });
  assert.equal(inches3(L.spineIn), '0.142"');
  assert.equal(inches3(L.widthIn), '11.392"');
  assert.equal(inches3(L.heightIn), '8.750"');
  assert.equal(inches3(L.rects.spineSafe.width), '0.017"');
  assert.equal(inches3(11.4075), '11.408"'); // half up, despite 11.4075 being stored as 11.40749…
});

await test('footer date: the latest lastVerified anywhere in the config', () => {
  assert.equal(latestVerified(specs), '2026-11-08');
  assert.equal(latestVerified({ _meta: { lastVerified: '2026-01-02' }, a: { lastVerified: '2025-12-31' }, b: { c: { lastVerified: '2026-03-04' } } }), '2026-03-04');
});

console.log(`${passed} tests passed`);
