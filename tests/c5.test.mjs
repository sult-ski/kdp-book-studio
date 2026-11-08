// Phase 2, milestone C5 tests: the cover zone overlay (guides + problem outlines) drawn from the layout.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { makeCover } from './fixtures/make-cover.mjs';
import { preflightCover } from '../src/engine/cover/preflightCover.js';
import { coverLayout } from '../src/engine/cover/layout.js';
import { coverOverlaySvg, guidesFit } from '../src/ui/coverOverlay.js';

const specs = JSON.parse(readFileSync(new URL('../src/config/kdp-specs.json', import.meta.url)));
const env = { pdfjs, docOptions: { standardFontDataUrl: 'node_modules/pdfjs-dist/standard_fonts/' } };
let passed = 0;
const test = async (name, fn) => { await fn(); passed++; console.log('✓', name); };
const S = { trim: '6x9', inkPaper: 'bw_cream', pages: 120 };
const L = coverLayout(specs, S);
const page = { widthIn: 12.55, heightIn: 9.25 };
const count = (svg, cls) => (svg.match(new RegExp(`class="${cls}"`, 'g')) ?? []).length;

await test('guides: bleed band, 2 fold bands, 3 safe areas, barcode box, trim + 2 fold lines', () => {
  const svg = coverOverlaySvg(L, page, []);
  assert.equal(count(svg, 'ov-bleed'), 1);
  assert.equal(count(svg, 'ov-fold'), 2);
  assert.equal(count(svg, 'ov-safe'), 3); // 120 pages: spine text allowed
  assert.equal(count(svg, 'ov-barcode'), 1);
  assert.equal(count(svg, 'ov-trim'), 3);
  assert.match(svg, /x1="6.125"/); // fold line at the spine's left edge
});

await test('no spine safe area under the spine-text minimum', () => {
  const svg = coverOverlaySvg(coverLayout(specs, { ...S, pages: 60 }), { widthIn: L.widthIn, heightIn: 9.25 }, []);
  assert.equal(count(svg, 'ov-safe'), 2);
});

await test('guides stretch to a cover within tolerance', () => {
  const svg = coverOverlaySvg(L, { widthIn: 12.56, heightIn: 9.25 }, []);
  assert.match(svg, /H12.56V9.25H0Z/);
});

await test('guides off: only problem outlines', () => {
  const svg = coverOverlaySvg(L, page, [{ severity: 'fail', bbox: { x: 1, y: 1, width: 2, height: 0.5 } }, { severity: 'info' }], { guides: false });
  assert.equal(count(svg, 'mark'), 1);
  assert.equal(count(svg, 'ov-safe'), 0);
  assert.match(svg, /data-sev="fail"/);
});

await test('real run: text outside safe area is outlined; wrong size hides guides', async () => {
  const r = await preflightCover(specs, await makeCover({ w: 12.55, h: 9.25, text: [{ str: 'Edge', cx: 12.3, cy: 4.6, size: 18 }] }), S, env);
  assert.ok(guidesFit(r.issues));
  assert.ok(count(coverOverlaySvg(r.layout, r.pages[0], r.issues), 'mark') >= 1);
  const bad = await preflightCover(specs, await makeCover({ w: 11, h: 8.5 }), S, env);
  assert.equal(guidesFit(bad.issues), false);
});

console.log(`\nC5: ${passed} tests passed`);
