// Phase 2, milestone C2 tests: cover size (with diagnosis of common mistakes) and spine text vs page count.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { makeCover } from './fixtures/make-cover.mjs';
import { preflightCover } from '../src/engine/cover/preflightCover.js';
import { coverLayout } from '../src/engine/cover/layout.js';

const specs = JSON.parse(readFileSync(new URL('../src/config/kdp-specs.json', import.meta.url)));
const env = { pdfjs, docOptions: { standardFontDataUrl: 'node_modules/pdfjs-dist/standard_fonts/' } };
let passed = 0;
const test = async (name, fn) => { await fn(); passed++; console.log('✓', name); };

const CREAM_120 = { trim: '6x9', inkPaper: 'bw_cream', pages: 120 }; // spine 0.3", cover 12.55" x 9.25"
const run = async (bytes, settings = CREAM_120) => preflightCover(specs, bytes, settings, env);
const ofCheck = (r, checkId) => r.issues.filter((i) => i.checkId === checkId);

await test('exact cover size: no size issues; result carries the layout and the page size', async () => {
  const r = await run(await makeCover({ w: 12.55, h: 9.25 }));
  assert.equal(r.error, undefined);
  assert.deepEqual(ofCheck(r, 'coverSize'), []);
  assert.equal(r.pages.length, 1);
  assert.equal(r.pages[0].widthIn, 12.55);
  assert.ok(Math.abs(r.layout.spineIn - 0.3) < 1e-9);
});

await test('within tolerance: info only, in inches and mm', async () => {
  const [i, ...rest] = ofCheck(await run(await makeCover({ w: 12.56, h: 9.25 })), 'coverSize');
  assert.equal(rest.length, 0);
  assert.equal(i.severity, 'info');
  assert.match(i.message, /0\.01" wider/);
  assert.match(i.message, /mm/);
});

await test('cover without bleed: fail, and says the bleed is missing', async () => {
  const [i] = ofCheck(await run(await makeCover({ w: 12.3, h: 9 })), 'coverSize');
  assert.equal(i.severity, 'fail');
  assert.equal(i.id, 'cover-size-no-bleed');
  assert.match(i.message, /bleed/);
  assert.match(i.fix, /12\.55" x 9\.25"/);
});

await test('front cover only: fail, and says so', async () => {
  for (const [w, h] of [[6.125, 9.25], [6, 9], [6.25, 9.25]]) {
    const [i] = ofCheck(await run(await makeCover({ w, h })), 'coverSize');
    assert.equal(i.severity, 'fail');
    assert.equal(i.id, 'cover-size-front-only', `${w} x ${h}`);
  }
});

await test('spine made for another page count: fail, and names the page count it fits', async () => {
  // 200 pages of cream = 0.5" spine -> 12.75" wide.
  const [i] = ofCheck(await run(await makeCover({ w: 12.75, h: 9.25 })), 'coverSize');
  assert.equal(i.severity, 'fail');
  assert.equal(i.id, 'cover-size-spine');
  assert.match(i.message, /0\.5" spine/);
  assert.match(i.message, /about 200 pages/);
  assert.match(i.message, /120 pages/);
});

await test('spine made for another paper: names the paper it matches', async () => {
  // 120 pages of white = 0.27024" spine -> 12.52024" wide; checked as cream (needs 12.55").
  const [i] = ofCheck(await run(await makeCover({ w: 12.52024, h: 9.25 })), 'coverSize');
  assert.equal(i.severity, 'fail');
  assert.match(i.message, /black ink, white paper/i);
});

await test('wrong height or anything else: plain size fail', async () => {
  const [i] = ofCheck(await run(await makeCover({ w: 12.55, h: 10 })), 'coverSize');
  assert.equal(i.severity, 'fail');
  assert.equal(i.id, 'cover-size');
  assert.match(i.message, /12\.55" x 9\.25"/);
});

const spineTextCover = async (settings, extra = []) => {
  const L = coverLayout(specs, settings);
  const cx = L.rects.spine.x + L.rects.spine.width / 2;
  return makeCover({ w: L.widthIn, h: L.heightIn, text: [{ str: 'MY BOOK', cx, cy: L.heightIn / 2, size: 6, rotate: 90 }, ...extra] });
};

await test('spine text under 79 pages: fail, located on the spine', async () => {
  const settings = { trim: '6x9', inkPaper: 'bw_cream', pages: 70 }; // spine 0.175"
  const r = await run(await spineTextCover(settings), settings);
  const [i, ...rest] = ofCheck(r, 'coverSpineText');
  assert.equal(rest.length, 0);
  assert.equal(i.severity, 'fail');
  assert.match(i.message, /70 pages/);
  assert.match(i.message, /79/);
  const L = coverLayout(specs, settings);
  assert.ok(i.bbox.x >= L.rects.spine.x - 0.05 && i.bbox.x + i.bbox.width <= L.rects.spine.x + L.rects.spine.width + 0.05, JSON.stringify(i.bbox));
  assert.equal(i.page, 1);
});

await test('spine text at exactly 79 pages: allowed, with a Cover Creator note (info)', async () => {
  const settings = { trim: '6x9', inkPaper: 'bw_cream', pages: 79 };
  const [i] = ofCheck(await run(await spineTextCover(settings), settings), 'coverSpineText');
  assert.equal(i.severity, 'info');
  assert.match(i.message, /Cover Creator/);
});

await test('spine text from 80 pages: nothing to report; text on the covers is not spine text', async () => {
  const s80 = { trim: '6x9', inkPaper: 'bw_cream', pages: 80 };
  assert.deepEqual(ofCheck(await run(await spineTextCover(s80), s80), 'coverSpineText'), []);
  const s60 = { trim: '6x9', inkPaper: 'bw_cream', pages: 60 };
  const L = coverLayout(specs, s60);
  const front = await makeCover({ w: L.widthIn, h: L.heightIn, text: [{ str: 'A Great Title', cx: L.rects.front.x + 3, cy: 2, size: 24 }, { str: 'Blurb on the back', cx: L.rects.back.x + 3, cy: 3 }] });
  assert.deepEqual(ofCheck(await run(front, s60), 'coverSpineText'), []);
});

await test('more than one page: fail (Must fix), only the first page is checked', async () => {
  const r = await run(await makeCover({ w: 12.55, h: 9.25, pages: 3 }));
  const [i] = ofCheck(r, 'coverPages');
  assert.equal(i.severity, 'fail');
  assert.match(i.message, /3 pages/);
  assert.deepEqual(ofCheck(r, 'coverSize'), []);
});

await test('unreadable file: error message, no crash', async () => {
  const r = await run(new TextEncoder().encode('not a pdf'));
  assert.match(r.error, /could not be read/);
});

await test('every cover issue has the full issue shape and a KDP source URL', async () => {
  const settings = { trim: '6x9', inkPaper: 'bw_cream', pages: 70 };
  const L = coverLayout(specs, settings);
  const bytes = await makeCover({ w: L.widthIn + 0.5, h: L.heightIn, pages: 2, text: [{ str: 'SPINE', cx: L.rects.spine.x + L.rects.spine.width / 2, cy: 4, size: 6, rotate: 90 }] });
  const r = await run(bytes, settings);
  assert.ok(r.issues.length >= 3);
  for (const i of r.issues) {
    for (const k of ['id', 'checkId', 'severity', 'measured', 'required', 'message', 'fix', 'accuracy', 'source']) assert.ok(i[k] != null, `${i.id} has ${k}`);
    assert.match(i.source, /^https:\/\/kdp\.amazon\.com\//);
    assert.ok(['verified', 'best-effort'].includes(i.accuracy));
  }
});

console.log(`${passed} tests passed`);
