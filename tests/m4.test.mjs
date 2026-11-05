// Milestone 4 tests: rendering, ink detection and margins. Run: npm test
// Uses pdf.js's Node build; pdf.js renders through its own optional @napi-rs/canvas dependency.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { PDFDocument, rgb } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { preflight } from '../src/engine/preflight.js';
import { scanEdge } from '../src/engine/ink.js';
import { groupIssues } from '../src/engine/runChecks.js';
import { fixtures, makeTextBook, makePdf } from './fixtures/make-fixtures.mjs';

const specs = JSON.parse(readFileSync(new URL('../src/config/kdp-specs.json', import.meta.url)));
let passed = 0;
const test = async (name, fn) => { await fn(); passed++; console.log('✓', name); };

const NO_BLEED = { trim: '6x9', inkPaper: 'bw_white', bleed: false };
const BLEED = { ...NO_BLEED, bleed: true };
const env = { pdfjs, docOptions: { standardFontDataUrl: 'node_modules/pdfjs-dist/standard_fonts/' } };
const run = (bytes, settings = NO_BLEED, extra = {}) => preflight(specs, bytes, settings, { ...env, ...extra });
const margins = (issues) => issues.filter((i) => i.checkId === 'margins');
const near = (measured, expected, tol = 0.02) =>
  assert.ok(Math.abs(parseFloat(measured) - expected) <= tol, `${measured} not within ${tol} of ${expected}`);

/** Draws filled boxes onto existing PDF bytes. Boxes are [pageIndex, x, y, w, h] in inches from bottom-left. */
async function withBoxes(bytes, boxes) {
  const doc = await PDFDocument.load(bytes);
  for (const [i, x, y, w, h] of boxes) {
    doc.getPage(i).drawRectangle({ x: x * 72, y: y * 72, width: w * 72, height: h * 72, color: rgb(0.2, 0.3, 0.6) });
  }
  return doc.save();
}

await test('scanEdge: splits text from art, measures inset from each page edge', () => {
  // 10x10 px page at 10 DPI (1" x 1"). Dark pixels at (2,1) [text] and (8,5) [art].
  const W = 10, H = 10;
  const rgba = new Uint8ClampedArray(W * H * 4).fill(255);
  const ink = (x, y) => rgba.fill(0, (y * W + x) * 4, (y * W + x) * 4 + 3);
  ink(2, 1); ink(8, 5);
  const render = { widthPx: W, heightPx: H, dpi: 10, rgba, textRects: [[1.5, 0.5, 3.5, 2]] };
  const page = { widthIn: 1, heightIn: 1 };
  const top = scanEdge(render, page, 'top', 0.3, 250);
  assert.equal(top.text.insetIn, 0.1);
  assert.deepEqual(top.text.bboxPx, [2, 1, 3, 2]);
  assert.equal(top.art, null);
  const right = scanEdge(render, page, 'right', 0.3, 250);
  assert.equal(right.text, null);
  assert.ok(Math.abs(right.art.insetIn - 0.1) < 1e-9); // 1" - 9px/10
  assert.deepEqual(scanEdge(render, page, 'bottom', 0.3, 250), { text: null, art: null });
});

await test('good-6x9-120p: real text inside the margins passes everything', async () => {
  const progress = [];
  const r = await run(await fixtures['good-6x9-120p'](), NO_BLEED, { onProgress: (p) => progress.push(p) });
  assert.deepEqual(r.issues, []);
  assert.deepEqual(progress.at(-1), { done: 120, total: 120 });
  assert.equal(progress.length, 121);
});

await test('tiny-margins: text 0.15" from every edge fails top, bottom, outside and gutter', async () => {
  const r = await run(await fixtures['tiny-margins']());
  const m = margins(r.issues);
  assert.equal(m.length, 24 * 4);
  assert.ok(m.every((i) => i.severity === 'fail' && i.accuracy === 'verified' && i.bbox));
  for (const i of m) near(i.measured, 0.15);
  const groups = groupIssues(m);
  assert.deepEqual(groups.map((g) => g.groupKey).sort(),
    ['margins|bottom|text', 'margins|inside|text', 'margins|outside|text', 'margins|top|text']);
  assert.ok(groups.every((g) => g.pages.length === 24 && g.worstPage != null));
  const outside = m.find((i) => i.id === 'margins-outside-text-p1');
  assert.match(outside.message, /KDP requires at least 0\.25" from the outside edge of the page/);
  // 24 pages is below the first gutter band's max (150): 0.375".
  assert.match(m.find((i) => i.id === 'margins-inside-text-p1').message, /requires a 0\.375" inside margin/);
});

await test('gutter-212p: text 0.31" from the binding fails the 0.5" gutter, mirrored per page', async () => {
  const r = await run(await fixtures['gutter-212p']());
  const m = margins(r.issues);
  assert.equal(m.length, 212);
  assert.ok(m.every((i) => i.id.startsWith('margins-inside-text-')));
  const p47 = m.find((i) => i.page === 47);
  assert.match(p47.message,
    /^Text inside the gutter zone \(inside margin\)\. Your book has 212 pages, so KDP requires a 0\.5" inside margin; this text sits 0\.3\d" from the binding edge\.$/);
  assert.equal(p47.fix, 'Increase the inside margin to at least 0.5" in your document and re-export the PDF.');
  near(p47.measured, 0.31);
  // Odd pages bind on the left, even pages on the right: the offending ink is on that side.
  assert.ok(m.find((i) => i.page === 1).bbox.x < 1);
  assert.ok(m.find((i) => i.page === 2).bbox.x > 5);
});

await test('bleed: margins measured from the trim line; full-bleed art allowed; text past trim cut off', async () => {
  const safe = await makeTextBook(24, { bleed: true, top: 0.5, bottom: 0.5, inside: 0.5, outside: 0.5 });
  assert.deepEqual(margins((await run(safe, BLEED)).issues), []);

  // Text 0.3" from the trim line: fine without bleed (0.25") but not with bleed (0.375").
  const r = await run(await makeTextBook(24, { bleed: true, top: 0.3, bottom: 0.6, inside: 0.6, outside: 0.6 }), BLEED);
  const top = margins(r.issues);
  assert.equal(top.length, 24);
  near(top[0].measured, 0.3);
  assert.match(top[0].message, /0\.375" from the trim line \(where the top of the page is cut\) in books with bleed/);

  // A full-bleed band across the top of page 1 (reaches the page edge) is bleed art: allowed.
  // A box 0.2" inside the trim at the outside of page 2 (not touching the edge) is flagged.
  const art = await withBoxes(safe, [[0, 0, 9.25 - 0.6, 6.125, 0.6], [1, 0.125 + 0.2, 4, 0.5, 0.5]]);
  const a = margins((await run(art, BLEED)).issues);
  assert.deepEqual(a.map((i) => [i.id, i.severity, i.accuracy]), [['margins-outside-art-p2', 'warn', 'best-effort']]);
  near(a[0].measured, 0.2);

  // Text 0.05" above the trim line (in the bleed area) will be cut off.
  const cut = await run(await makeTextBook(24, { bleed: true, top: -0.05, bottom: 0.6, inside: 0.6, outside: 0.6 }), BLEED);
  assert.match(margins(cut.issues)[0].message, /runs 0\.0\d" past the trim line, so it will be cut off/);
});

await test('no bleed: art in the margin warns; a box well inside the margins is fine', async () => {
  const book = await makeTextBook(24, { top: 0.6, bottom: 0.6, inside: 0.6, outside: 0.6 });
  const r = await run(await withBoxes(book, [[0, 6 - 0.1 - 0.5, 4, 0.5, 0.5], [1, 1.5, 3, 3, 3]]));
  const m = margins(r.issues);
  assert.deepEqual(m.map((i) => [i.id, i.severity]), [['margins-outside-art-p1', 'warn']]);
  near(m[0].measured, 0.1);
  assert.match(m[0].fix, /choose "Bleed"/);
});

await test('wrong-size pages are not margin-checked (the page size check reports them)', async () => {
  const sizes = Array.from({ length: 24 }, () => [6, 9]);
  sizes[2] = [8.5, 11];
  const r = await run(await makePdf(sizes));
  assert.deepEqual(r.issues.map((i) => i.checkId), ['pageSize']);
});

await test('unreadable file returns the loader error', async () => {
  const r = await run(new TextEncoder().encode('not a pdf'));
  assert.match(r.error, /could not be read/);
});

console.log(`\n${passed} tests passed`);
