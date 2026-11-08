// Milestone 6 tests: bleed art, blank pages, minimum font size, transparency. Run: npm test
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { PDFDocument, rgb } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { preflight } from '../src/engine/preflight.js';
import { checkBlankPages } from '../src/engine/checks/blankPages.js';
import { groupIssues } from '../src/engine/runChecks.js';
import { fixtures, makeTextBook, embedGaramond } from './fixtures/make-fixtures.mjs';

const specs = JSON.parse(readFileSync(new URL('../src/config/kdp-specs.json', import.meta.url)));
let passed = 0;
const test = async (name, fn) => { await fn(); passed++; console.log('✓', name); };

const NO_BLEED = { trim: '6x9', inkPaper: 'bw_white', bleed: false };
const BLEED = { ...NO_BLEED, bleed: true };
const env = { pdfjs, docOptions: { standardFontDataUrl: 'node_modules/pdfjs-dist/standard_fonts/' } };
const run = async (bytes, settings = NO_BLEED) => (await preflight(specs, bytes, settings, env)).issues;
const of = (issues, checkId) => issues.filter((i) => i.checkId === checkId);
const PT = 72;
// Measurements come from 100 DPI rendering: accurate to about 0.01".
const near = (measured, expected) =>
  assert.ok(Math.abs(parseFloat(measured) - expected) <= 0.011, `${measured} not within 0.01" of ${expected}`);

/** Loads bytes, lets `edit(doc)` draw on it, saves. */
async function edited(bytes, edit) {
  const doc = await PDFDocument.load(bytes);
  await edit(doc);
  return doc.save();
}

// ---------- blank pages ----------

await test('checkBlankPages: 4 in a row mid-book is fine, 5 warns; start run uses the same limit', () => {
  const pages = (n, blanks) => Array.from({ length: n }, (_, i) => blanks.includes(i + 1));
  assert.deepEqual(checkBlankPages(specs, pages(30, [5, 6, 7, 8])), []);
  const mid = checkBlankPages(specs, pages(30, [5, 6, 7, 8, 9]));
  assert.deepEqual(mid.map((i) => [i.id, i.severity, i.page]), [['blankPages-5-9', 'warn', null]]);
  assert.match(mid[0].message, /^Pages 5-9 are blank: 5 blank pages in a row in the middle of the book\. KDP allows at most 4 in a row at the start or middle of a book and 10 at the end/);
  assert.match(checkBlankPages(specs, pages(30, [1, 2, 3, 4, 5]))[0].message, /in a row at the start of the book\./);
});

await test('checkBlankPages: up to 10 at the end is fine, 11 warns; unrendered pages break a run', () => {
  const tail = (n, count) => Array.from({ length: n }, (_, i) => i >= n - count);
  assert.deepEqual(checkBlankPages(specs, tail(40, 10)), []);
  const end = checkBlankPages(specs, tail(40, 11));
  assert.deepEqual(end.map((i) => i.id), ['blankPages-30-40']);
  assert.match(end[0].message, /11 blank pages in a row at the end of the book\./);
  // null = not rendered (e.g. wrong size): treated as not blank.
  assert.deepEqual(checkBlankPages(specs, [false, true, true, true, null, true, true, true, false]), []);
});

await test('6-consecutive-blanks fixture: one warning for pages 5-10, nothing else', async () => {
  const issues = await run(await fixtures['6-consecutive-blanks']());
  assert.deepEqual(issues.map((i) => [i.id, i.severity]), [['blankPages-5-10', 'warn']]);
  assert.match(issues[0].fix, /View → Formatting Marks/);
});

// ---------- minimum font size ----------

/** 24-page text book with one extra line at `sizePt` on page 3 (optionally white = invisible). */
async function withLine(sizePt, color = rgb(0, 0, 0)) {
  return edited(await makeTextBook(24), async (doc) => {
    const font = await embedGaramond(doc);
    doc.getPage(2).drawText('Footnote text here', { font, size: sizePt, x: 1.5 * PT, y: 2 * PT, color });
  });
}

await test('text under 7 pt warns (best-effort) with the smallest size and a sample', async () => {
  const issues = of(await run(await withLine(6)), 'fontSize');
  assert.deepEqual(issues.map((i) => [i.id, i.severity, i.accuracy, i.measured, i.required]),
    [['fontSize-p3', 'info', 'best-effort', '6 pt', '7 pt']]);
  assert.match(issues[0].message, /smaller than 7 pt \(smallest 6 pt, for example "Footnote text here"\)/);
  assert.ok(issues[0].bbox.width > 0 && issues[0].bbox.height > 0);
  assert.match(issues[0].fix, /LibreOffice/);
});

await test('7 pt text is fine; invisible (white) small text is ignored', async () => {
  assert.deepEqual(of(await run(await withLine(7)), 'fontSize'), []);
  assert.deepEqual(of(await run(await withLine(5, rgb(1, 1, 1))), 'fontSize'), []);
});

// ---------- bleed ----------

await test('no bleed + art touching the outside edge: bleed warning instead of a margin warning', async () => {
  const bytes = await edited(await makeTextBook(24, { top: 0.6, bottom: 0.6, inside: 0.6, outside: 0.6 }), (doc) => {
    // Page 1 binds on the left, so the outside edge is the right edge (x = 6").
    doc.getPage(0).drawRectangle({ x: 5 * PT, y: 4 * PT, width: 1 * PT, height: 1 * PT, color: rgb(0.2, 0.4, 0.7) });
  });
  const issues = await run(bytes);
  assert.deepEqual(issues.map((i) => [i.id, i.severity, i.accuracy]), [['bleed-edge-outside-p1', 'warn', 'best-effort']]);
  assert.match(issues[0].message, /touches the outside edge of the page \(0" away\), but you chose "No bleed"/);
  assert.match(issues[0].fix, /make your pages 6\.125" x 9\.25" and extend it 0\.125" past the trim line/);
});

await test('no bleed + art running into the binding edge: says bleed does not apply there', async () => {
  const bytes = await edited(await makeTextBook(24, { top: 0.6, bottom: 0.6, inside: 0.6, outside: 0.6 }), (doc) => {
    doc.getPage(0).drawRectangle({ x: 0, y: 4 * PT, width: 0.3 * PT, height: 1 * PT, color: rgb(0.2, 0.4, 0.7) });
  });
  const issues = await run(bytes);
  assert.deepEqual(issues.map((i) => i.id), ['bleed-edge-inside-p1']);
  assert.match(issues[0].message, /Bleed doesn't apply at the binding/);
});

await test('bleed-art-short fixture: art stopping at the trim line is an info note (best-effort)', async () => {
  const issues = await run(await fixtures['bleed-art-short'](), BLEED);
  assert.deepEqual(issues.map((i) => [i.id, i.severity, i.accuracy]), [['bleed-short-top-p1', 'info', 'best-effort']]);
  near(issues[0].measured, 0.125);
  assert.match(issues[0].message, /stops 0\.1[23]" before the edge of the page, at about the trim line/);
});

await test('bleed: full-bleed art is fine; art stopping between trim line and page edge is also short', async () => {
  const base = await makeTextBook(24, { bleed: true, top: 1.2 });
  const full = await edited(base, (doc) => doc.getPage(0).drawRectangle(
    { x: 0, y: 8.45 * PT, width: 6.125 * PT, height: 0.8 * PT, color: rgb(0.2, 0.4, 0.7) })); // to the page edge
  assert.deepEqual(await run(full, BLEED), []);
  const partial = await edited(base, (doc) => doc.getPage(0).drawRectangle(
    { x: 0, y: 8.4 * PT, width: 6.125 * PT, height: 0.8 * PT, color: rgb(0.2, 0.4, 0.7) })); // stops 0.05" short
  const short = await run(partial, BLEED);
  assert.deepEqual(short.map((i) => i.id), ['bleed-short-top-p1']);
  near(short[0].measured, 0.05);
});

await test('bleed issues on many pages group per edge, worst page first', async () => {
  const bytes = await edited(await makeTextBook(24, { top: 0.6, bottom: 0.6, inside: 0.6, outside: 0.6 }), (doc) => {
    for (const i of [0, 2, 4]) {
      doc.getPage(i).drawRectangle({ x: 5 * PT, y: 4 * PT, width: 1 * PT, height: 1 * PT, color: rgb(0.2, 0.4, 0.7) });
    }
  });
  const groups = groupIssues(of(await run(bytes), 'bleed'));
  assert.deepEqual(groups.map((g) => [g.groupKey, g.pages]), [['bleed|edge|outside', [1, 3, 5]]]);
});

// ---------- transparency ----------

await test('transparency: an info note under each page that uses it', async () => {
  const bytes = await edited(await makeTextBook(24), (doc) => {
    doc.getPage(2).drawRectangle({ x: 2 * PT, y: 3 * PT, width: 2 * PT, height: 2 * PT, color: rgb(0.2, 0.4, 0.7), opacity: 0.5 });
  });
  const issues = await run(bytes);
  assert.deepEqual(issues.map((i) => [i.id, i.severity, i.page]), [['transparency-p3', 'info', 3]]);
  // A book with no transparency gets no note.
  assert.deepEqual(of(await run(await makeTextBook(24)), 'transparency'), []);
});

console.log(`\n${passed} tests passed`);
