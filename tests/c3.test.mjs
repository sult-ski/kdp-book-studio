// Phase 2, milestone C3 tests: text inside the safe area, clear of the fold lines and of the spine edges.
// 6" x 9", cream, 120 pages: spine 0.3" from x 6.125" to 6.425"; cover 12.55" x 9.25".
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { makeCover } from './fixtures/make-cover.mjs';
import { preflightCover } from '../src/engine/cover/preflightCover.js';

const specs = JSON.parse(readFileSync(new URL('../src/config/kdp-specs.json', import.meta.url)));
const env = { pdfjs, docOptions: { standardFontDataUrl: 'node_modules/pdfjs-dist/standard_fonts/' } };
let passed = 0;
const test = async (name, fn) => { await fn(); passed++; console.log('✓', name); };

const CREAM_120 = { trim: '6x9', inkPaper: 'bw_cream', pages: 120 };
const W = 12.55;
const H = 9.25;
const run = async (text, settings = CREAM_120, size = { w: W, h: H }) =>
  preflightCover(specs, await makeCover({ ...size, text }), settings, env);
const zoneIssues = (r) => r.issues.filter((i) => ['coverSafeArea', 'coverFold', 'coverSpineEdge'].includes(i.checkId));
const one = (r, id) => {
  const found = r.issues.filter((i) => i.id === id);
  assert.equal(found.length, 1, `one ${id} issue, got ${r.issues.map((i) => i.id).join(', ')}`);
  return found[0];
};
const TITLE = { str: 'The Quiet Harbour', cx: 9.425, cy: 2, size: 24 };
const BLURB = { str: 'A short blurb about the book.', cx: 3.125, cy: 2 };
const SPINE = { str: 'THE QUIET HARBOUR', cx: 6.275, cy: 4.625, size: 7, rotate: 90 };

await test('text well inside the safe areas and centred on the spine: no zone issues', async () => {
  const r = await run([TITLE, BLURB, SPINE]);
  assert.deepEqual(zoneIssues(r), []);
});

await test('front cover text 0.25" rule: text near the outside trim fails, with distance and bbox', async () => {
  const r = await run([TITLE, { str: 'Jane', cx: 12.2, cy: 8 }]);
  const i = one(r, 'cover-safe-area');
  assert.equal(i.severity, 'fail');
  assert.equal(i.accuracy, 'verified');
  assert.match(i.message, /front cover/);
  assert.match(i.message, /0\.25"/);
  assert.match(i.message, /"Jane"/);
  assert.ok(parseFloat(i.measured) < 0.25, i.measured);
  assert.ok(i.bbox && i.bbox.x > 11.9 && i.bbox.x + i.bbox.width <= 12.55);
  assert.match(i.source, /^https:\/\/kdp\.amazon\.com\//);
});

await test('back cover text running into the bleed: fail, says it will be cut off', async () => {
  const r = await run([{ str: 'Too high', cx: 3, cy: 0.12 }]);
  const i = one(r, 'cover-safe-area');
  assert.match(i.message, /back cover/);
  assert.match(i.message, /cut off/);
});

await test('front cover text close to the spine fold: fail, mentions the fold', async () => {
  const r = await run([{ str: 'X', cx: 6.5, cy: 4 }]);
  const i = one(r, 'cover-safe-area');
  assert.match(i.message, /fold/);
  assert.deepEqual(r.issues.filter((x) => x.checkId === 'coverFold'), [], 'one issue per text, the most severe');
});

await test('several texts outside the safe area on one panel: one issue naming the closest', async () => {
  const r = await run([{ str: 'Jane', cx: 12.2, cy: 8 }, { str: 'Top', cx: 9.4, cy: 0.3 }]);
  const i = one(r, 'cover-safe-area');
  assert.match(i.message, /2 pieces of text/);
});

await test('spine text crossing a fold line: warn', async () => {
  const r = await run([{ ...SPINE, cx: 6.155, size: 10 }]);
  const i = one(r, 'cover-fold-line');
  assert.equal(i.severity, 'warn');
  assert.match(i.message, /fold/);
  assert.match(i.message, /0\.0625"/);
});

await test('spine text inside the spine but within 0.0625" of its edge: warn', async () => {
  const r = await run([{ ...SPINE, cx: 6.215 }]);
  const i = one(r, 'cover-spine-edge');
  assert.equal(i.severity, 'warn');
  assert.ok(parseFloat(i.measured) < 0.0625, i.measured);
  assert.deepEqual(r.issues.filter((x) => x.id === 'cover-fold-line'), []);
});

await test('spine text too close to the top trim: fails the safe area', async () => {
  const r = await run([{ str: 'TOP', cx: 6.275, cy: 0.3, size: 7, rotate: 90 }]);
  const i = one(r, 'cover-safe-area');
  assert.match(i.message, /spine/);
});

await test('under 79 pages: spine text only gets the spine-text fail, no edge warnings', async () => {
  const settings = { trim: '6x9', inkPaper: 'bw_cream', pages: 70 }; // spine 0.175", 6.125" to 6.3"
  const r = await run([{ ...SPINE, cx: 6.15 }], settings, { w: 12.425, h: H });
  one(r, 'cover-spine-text');
  assert.deepEqual(zoneIssues(r), []);
});

await test('wrong cover size: zone checks are skipped (the size issue explains)', async () => {
  const r = await run([{ str: 'Jane', cx: 12.2, cy: 8 }], CREAM_120, { w: 12.0, h: H });
  assert.deepEqual(zoneIssues(r), []);
});

console.log(`${passed} tests passed`);
