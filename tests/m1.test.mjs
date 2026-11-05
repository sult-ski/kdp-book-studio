// Milestone 1 tests. Run: npm test
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { PDFDocument, degrees } from 'pdf-lib';
import { loadPdf } from '../src/engine/loadPdf.js';
import { summarize, formatPageList } from '../src/engine/summarize.js';
import { expectedPageSize, pageCountRange, gutterFor, outsideMarginFor, listTrims } from '../src/engine/specs.js';

const specs = JSON.parse(readFileSync(new URL('../src/config/kdp-specs.json', import.meta.url)));
let passed = 0;
const test = async (name, fn) => { await fn(); passed++; console.log('✓', name); };

async function makePdf(sizesIn, rotateIdx = -1) {
  const doc = await PDFDocument.create();
  sizesIn.forEach(([w, h], i) => {
    const p = doc.addPage([w * 72, h * 72]);
    if (i === rotateIdx) p.setRotation(degrees(90));
  });
  return doc.save();
}

await test('spec lookups', () => {
  assert.deepEqual(expectedPageSize(specs, '6x9', false), { width: 6, height: 9 });
  assert.deepEqual(expectedPageSize(specs, '6x9', true), { width: 6.125, height: 9.25 });
  assert.deepEqual(pageCountRange(specs, '8.5x11', 'bw_cream'), [24, 550]);
  assert.deepEqual(pageCountRange(specs, '6x9', 'color_standard'), [72, 600]);
  assert.equal(pageCountRange(specs, '8.27x11.69', 'color_standard'), null);
  assert.equal(gutterFor(specs, 212), 0.5);
  assert.equal(gutterFor(specs, 150), 0.375);
  assert.equal(gutterFor(specs, 900), null);
  assert.equal(outsideMarginFor(specs, true), 0.375);
  assert.equal(listTrims(specs).length, 27);
});

await test('reads page sizes, sides and rotation', async () => {
  const pdf = await loadPdf(await makePdf([[6, 9], [6, 9], [8.5, 11], [9, 6]], 3));
  assert.equal(pdf.pageCount, 4);
  assert.equal(pdf.pages[0].side, 'right');
  assert.equal(pdf.pages[1].side, 'left');
  assert.equal(pdf.pages[2].widthIn, 8.5);
  assert.equal(pdf.pages[3].widthIn, 6); // 9x6 rotated 90° reads as 6x9
});

await test('groups pages by size', async () => {
  const pdf = await loadPdf(await makePdf([[6, 9], [6, 9], [8.5, 11], [6, 9]]));
  const s = summarize(specs, pdf, { trim: '6x9', inkPaper: 'bw_white', bleed: false });
  assert.equal(s.sizeGroups.length, 2);
  assert.deepEqual(s.sizeGroups[0].pages, [1, 2, 4]);
  assert.deepEqual(s.allowedRange, [24, 828]);
});

await test('rejects non-PDF input', async () => {
  const pdf = await loadPdf(new TextEncoder().encode('not a pdf'));
  assert.ok(pdf.error);
});

await test('formats page lists', () => {
  assert.equal(formatPageList([1, 2, 3, 7, 9, 10, 11, 12]), '1-3, 7, 9-12');
});

console.log(`\n${passed} tests passed`);
