// Milestone 5 tests: image resolution (DPI). Run: npm test
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { PDFDocument, degrees } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { preflight } from '../src/engine/preflight.js';
import { findImagePlacements } from '../src/engine/images.js';
import { checkPageImages } from '../src/engine/checks/imageDpi.js';
import { groupIssues } from '../src/engine/runChecks.js';
import { fixtures, makeTextBook, addImage } from './fixtures/make-fixtures.mjs';

const specs = JSON.parse(readFileSync(new URL('../src/config/kdp-specs.json', import.meta.url)));
let passed = 0;
const test = async (name, fn) => { await fn(); passed++; console.log('✓', name); };

const SETTINGS = { trim: '6x9', inkPaper: 'bw_white', bleed: false };
const env = { pdfjs, docOptions: { standardFontDataUrl: 'node_modules/pdfjs-dist/standard_fonts/' } };
const images = async (bytes, settings = SETTINGS) =>
  (await preflight(specs, bytes, settings, env)).issues.filter((i) => i.checkId === 'images');

/** A 24-page text book with images added: [pageIndex, {pxW, pxH, x, y, w, h, mask}] */
async function bookWith(list, opts = {}) {
  const doc = await PDFDocument.load(await makeTextBook(24, opts));
  for (const [i, img] of list) addImage(doc, doc.getPage(i), img);
  return doc.save();
}

await test('findImagePlacements tracks the CTM through save/restore and form XObjects', () => {
  const O = pdfjs.OPS;
  const opList = {
    fnArray: [O.save, O.transform, O.paintFormXObjectBegin, O.transform, O.paintImageXObject,
      O.paintFormXObjectEnd, O.restore, O.transform, O.paintImageXObject],
    argsArray: [null, [2, 0, 0, 2, 0, 0], [[0.5, 0, 0, 0.5, 10, 20], [0, 0, 1, 1]], [100, 0, 0, 50, 0, 0],
      ['img1', 200, 100], null, null, [72, 0, 0, 36, 5, 5], ['img2', 30, 30]],
  };
  const out = findImagePlacements(opList, O, () => null);
  // 2x then (0.5x, +10,+20) then 100x50: net scale 100 x 50, origin (20, 40).
  assert.deepEqual(out[0], { pxW: 200, pxH: 100, ctm: [100, 0, 0, 50, 20, 40], kind: 'xobject' });
  // After restore the CTM is back to identity.
  assert.deepEqual(out[1].ctm, [72, 0, 0, 36, 5, 5]);
});

await test('low-dpi fixture: 150 DPI image is a "very low" warning, measured exactly, with its position', async () => {
  const found = await images(await fixtures['low-dpi']());
  assert.equal(found.length, 1);
  const i = found[0];
  assert.deepEqual([i.id, i.severity, i.accuracy, i.page, i.measured, i.required],
    ['images-verylow-p5-0', 'warn', 'verified', 5, '150 DPI', '300 DPI']);
  assert.match(i.message, /only 150 DPI: very low \(below 200 DPI, our threshold; KDP's minimum is 300 DPI\)/);
  assert.match(i.message, /300 x 450 pixels shown at 2" x 3"/);
  assert.match(i.fix, /at least 600 x 900 pixels/);
  assert.match(i.fix, /untick "Reduce image resolution"/);
  // Placed 2" from the left, bottom edge 3" up, 3" tall, on a 9" page: top edge 9 - 6 = 3" down.
  for (const [k, v] of Object.entries({ x: 2, y: 3, width: 2, height: 3 })) {
    assert.ok(Math.abs(i.bbox[k] - v) < 1e-6, `bbox.${k}`);
  }
});

await test('thresholds: 250 DPI warns (KDP), 300 and 600 DPI pass', async () => {
  const found = await images(await bookWith([
    [0, { pxW: 500, pxH: 500, x: 2, y: 3, w: 2, h: 2 }],   // 250 DPI
    [1, { pxW: 600, pxH: 600, x: 2, y: 3, w: 2, h: 2 }],   // 300 DPI
    [2, { pxW: 1200, pxH: 1200, x: 2, y: 3, w: 2, h: 2 }], // 600 DPI
  ]));
  assert.deepEqual(found.map((i) => [i.id, i.measured]), [['images-low-p1-0', '250 DPI']]);
  assert.match(found[0].message, /KDP recommends at least 300 DPI/);
});

await test('uses the lower of horizontal and vertical resolution (stretched images)', async () => {
  // 600 px over 2" = 300 DPI wide, but 300 px over 2" = 150 DPI tall.
  const found = await images(await bookWith([[0, { pxW: 600, pxH: 300, x: 2, y: 3, w: 2, h: 2 }]]));
  assert.equal(found[0].measured, '150 DPI');
});

await test('image inside a placed PDF (Form XObject) is measured at its final printed size', async () => {
  const inner = await PDFDocument.create();
  const p = inner.addPage([144, 144]); // 2" x 2"
  addImage(inner, p, { pxW: 600, pxH: 600, x: 0, y: 0, w: 2, h: 2 }); // 300 DPI as placed in the inner page
  const doc = await PDFDocument.load(await makeTextBook(24));
  const [embedded] = await doc.embedPdf(await inner.save());
  doc.getPage(0).drawPage(embedded, { x: 144, y: 216, width: 72, height: 72 });   // half size: 600 DPI
  doc.getPage(1).drawPage(embedded, { x: 108, y: 216, width: 288, height: 288 }); // double size: 150 DPI
  const found = await images(await doc.save());
  assert.deepEqual(found.map((i) => [i.page, i.measured]), [[2, '150 DPI']]);
});

await test('rotated page: DPI unchanged, position on the upright page', async () => {
  const doc = await PDFDocument.create();
  for (let n = 0; n < 24; n++) {
    const page = doc.addPage([9 * 72, 6 * 72]); // landscape, turned upright by /Rotate 90
    page.setRotation(degrees(90));
    if (n === 0) addImage(doc, page, { pxW: 200, pxH: 200, x: 1, y: 1, w: 1, h: 1 }); // 200 DPI
  }
  const found = await images(await doc.save());
  assert.deepEqual(found.map((i) => i.measured), ['200 DPI']);
  const b = found[0].bbox;
  assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.width <= 6 + 1e-6 && b.y + b.height <= 9 + 1e-6, JSON.stringify(b));
});

await test('skips tiny fills and images entirely off the page; masks are best-effort', async () => {
  const found = await images(await bookWith([
    [0, { pxW: 8, pxH: 8, x: 2, y: 3, w: 2, h: 2 }],          // 4 DPI, but an 8 px fill: skipped
    [1, { pxW: 100, pxH: 100, x: 7, y: 3, w: 1, h: 1 }],      // off the right edge of a 6" page
    [2, { pxW: 240, pxH: 240, x: 2, y: 3, w: 2, h: 2, mask: true }], // 120 DPI line art
  ]));
  assert.deepEqual(found.map((i) => [i.page, i.measured, i.accuracy]), [[3, '120 DPI', 'best-effort']]);
  assert.match(found[0].message, /^A black-and-white image \(line art\) is only 120 DPI/);
});

await test('wrong-size pages still get their images checked', async () => {
  const doc = await PDFDocument.create();
  for (let n = 0; n < 24; n++) doc.addPage(n === 3 ? [8.5 * 72, 11 * 72] : [6 * 72, 9 * 72]);
  addImage(doc, doc.getPage(3), { pxW: 400, pxH: 400, x: 2, y: 3, w: 2, h: 2 });
  const r = await preflight(specs, await doc.save(), SETTINGS, env);
  assert.deepEqual(r.issues.map((i) => i.checkId).sort(), ['images', 'pageSize']);
});

await test('same low-res image on several pages groups into one line showing the worst page', async () => {
  const found = await images(await bookWith([
    [0, { pxW: 500, pxH: 500, x: 2, y: 3, w: 2, h: 2 }],   // 250
    [3, { pxW: 440, pxH: 440, x: 2, y: 3, w: 2, h: 2 }],   // 220
    [7, { pxW: 480, pxH: 480, x: 2, y: 3, w: 2, h: 2 }],   // 240
  ]));
  const groups = groupIssues(found);
  assert.equal(groups.length, 1);
  assert.deepEqual([groups[0].pages, groups[0].worstPage, groups[0].measured], [[1, 4, 8], 4, '220 DPI']);
});

await test('checkPageImages ignores degenerate placements', () => {
  const page = { number: 1, widthIn: 6, heightIn: 9 };
  const bbox = { x: 1, y: 1, width: 0, height: 0 };
  assert.deepEqual(checkPageImages(specs, page, [{ pxW: 100, pxH: 100, widthIn: 0, heightIn: 0, bboxIn: bbox, kind: 'xobject' }]), []);
});

console.log(`\n${passed} tests passed`);
