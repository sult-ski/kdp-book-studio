// Milestone 7 tests: the engine data the report needs (page layouts, thumbnails hook, group keys).
// The report screen itself is checked in the browser.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { preflight } from '../src/engine/preflight.js';
import { pageLayout } from '../src/engine/layout.js';
import { groupIssues, issueGroupKey } from '../src/engine/runChecks.js';
import { fixtures, makeTextBook } from './fixtures/make-fixtures.mjs';

const specs = JSON.parse(readFileSync(new URL('../src/config/kdp-specs.json', import.meta.url)));
let passed = 0;
const test = async (name, fn) => { await fn(); passed++; console.log('✓', name); };

const NO_BLEED = { trim: '6x9', inkPaper: 'bw_white', bleed: false };
const env = { pdfjs, docOptions: { standardFontDataUrl: 'node_modules/pdfjs-dist/standard_fonts/' } };
const close = (a, b) => Object.keys(b).forEach((k) => assert.ok(Math.abs(a[k] - b[k]) < 1e-9, `${k}: ${a[k]} vs ${b[k]}`));

await test('pageLayout: no bleed, 212 pages: 0.25" outside/top/bottom, 0.5" gutter, mirrored', () => {
  const right = pageLayout(specs, { side: 'right', widthIn: 6, heightIn: 9 }, NO_BLEED, 212); // binds left
  close(right.trim, { x: 0, y: 0, width: 6, height: 9 });
  close(right.safe, { x: 0.5, y: 0.25, width: 6 - 0.5 - 0.25, height: 8.5 });
  const left = pageLayout(specs, { side: 'left', widthIn: 6, heightIn: 9 }, NO_BLEED, 212);     // binds right
  close(left.safe, { x: 0.25, y: 0.25, width: 5.25, height: 8.5 });
});

await test('pageLayout: bleed: trim inset at top, bottom and outside only; 0.375" margins from trim', () => {
  const l = pageLayout(specs, { side: 'right', widthIn: 6.125, heightIn: 9.25 }, { ...NO_BLEED, bleed: true }, 100);
  close(l.trim, { x: 0, y: 0.125, width: 6, height: 9 });                      // binding (left) has no bleed
  close(l.safe, { x: 0.375, y: 0.5, width: 6.125 - 0.375 - 0.5, height: 9.25 - 1 });
});

await test('preflight returns every page with its layout (null for wrong-size pages)', async () => {
  const r = await preflight(specs, await fixtures['good-6x9-120p'](), NO_BLEED, env);
  assert.equal(r.pages.length, 120);
  assert.deepEqual(Object.keys(r.pages[0]).sort(), ['heightIn', 'layout', 'number', 'side', 'widthIn']);
  assert.equal(r.pages[1].side, 'left');
  const wrong = await preflight(specs, await fixtures['wrong-size'](), NO_BLEED, env);
  assert.equal(wrong.pages[0].layout, null);
});

await test('onPage is called only for pages with issues, with the render and that page\'s issues', async () => {
  const seen = [];
  const r = await preflight(specs, await fixtures['low-dpi'](), NO_BLEED, {
    ...env, onPage: ({ page, render, issues }) => seen.push([page.number, render.widthPx, issues.map((i) => i.id)]),
  });
  assert.deepEqual(seen, [[5, 600, ['images-verylow-p5-0']]]);
  assert.equal(r.issues.length, 1);
  // No thumbnails needed for a clean book.
  const none = [];
  await preflight(specs, await makeTextBook(24), NO_BLEED, { ...env, onPage: (p) => none.push(p) });
  assert.deepEqual(none, []);
  // Nor for pages whose only issue is an unlocated note (page size within tolerance).
  const notes = [];
  const r2 = await preflight(specs, await makeTextBook(24, { trim: [140 / 25.4, 8.5] }), { ...NO_BLEED, trim: '5.5x8.5' },
    { ...env, onPage: (p) => notes.push(p) });
  assert.ok(r2.issues.length === 24 && r2.issues.every((i) => i.severity === 'info'));
  assert.deepEqual(notes, []);
});

await test('every issue maps to exactly one report group via issueGroupKey', async () => {
  const r = await preflight(specs, await fixtures['gutter-212p'](), NO_BLEED, env);
  const keys = new Set(groupIssues(r.issues).map((g) => g.key));
  assert.ok(r.issues.every((i) => keys.has(issueGroupKey(i))));
  assert.equal(keys.size, 1);
});

console.log(`\n${passed} tests passed`);
