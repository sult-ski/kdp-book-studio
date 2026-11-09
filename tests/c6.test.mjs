// C6 tests: cover safe-area crossing rule (Must fix only past the safe line by more than 0.02") and OCR of
// text drawn into the cover picture (Tesseract.js, run in Node with the bundled English model).
// 6" x 9", cream, 120 pages: spine 0.3" from x 6.125" to 6.425"; cover 12.55" x 9.25".
// Bottom safe line: 9.25 - 0.125 bleed - 0.25 = 8.875". Front outside safe line: 12.55 - 0.375 = 12.175".
import { readFileSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { makeCover } from './fixtures/make-cover.mjs';
import { preflightCover } from '../src/engine/cover/preflightCover.js';
import { coverLayout } from '../src/engine/cover/layout.js';
import { checkCoverZones } from '../src/engine/cover/checks/zones.js';
import { readPanels, panelsWithoutText, toBmp } from '../src/engine/cover/ocr.js';
import { nodeOcr } from './helpers/ocr-node.mjs';

const specs = JSON.parse(readFileSync(new URL('../src/config/kdp-specs.json', import.meta.url)));
const env = { pdfjs, docOptions: { standardFontDataUrl: 'node_modules/pdfjs-dist/standard_fonts/' } };
let passed = 0;
let skipped = 0;
const test = async (name, fn) => { await fn(); passed++; console.log('✓', name); };

const CREAM_120 = { trim: '6x9', inkPaper: 'bw_cream', pages: 120 };
const L = coverLayout(specs, CREAM_120);
const SAFE_BOTTOM = 8.875;
const zones = (boxes) => checkCoverZones(specs, boxes, L, { toleranceIn: 0.01 });
const penName = (bottom, extra = {}) => ({ str: 'Stella Vane', x: 8, y: bottom - 0.4, width: 2, height: 0.4, ...extra });

await test('specs: crossing tolerance and OCR settings are recorded with sources', () => {
  assert.equal(specs.cover.safeArea.crossToleranceIn, 0.02);
  assert.ok(specs._meta.sources[specs.cover.safeArea.source]);
  assert.match(specs.cover.safeArea.ownerEvidence, /real KDP cover uploads/);
  assert.ok(specs.cover.ocr.mustFixMinConfidence > specs.cover.ocr.minConfidence);
});

await test('text touching the safe line is fine', () => {
  assert.deepEqual(zones([penName(SAFE_BOTTOM)]), []);
});

await test('text crossing the safe line by 0.015" (within our 0.02" tolerance) is not flagged', () => {
  assert.deepEqual(zones([penName(SAFE_BOTTOM + 0.015)]), []);
});

await test('text crossing the bottom safe line by 0.05" is Must fix, with how far past the line', () => {
  const [i, ...rest] = zones([penName(SAFE_BOTTOM + 0.05)]);
  assert.equal(rest.length, 0);
  assert.equal(i.id, 'cover-safe-area');
  assert.equal(i.severity, 'fail');
  assert.equal(i.accuracy, 'verified');
  assert.match(i.message, /"Stella Vane" on the front cover/);
  assert.match(i.message, /0\.05" past the safe line/);
  assert.match(i.message, /touching the safe line is fine/);
});

await test('the rule applies on every edge: outside, top and fold', () => {
  assert.equal(zones([{ str: 'UPGRADE', x: 10, y: 3, width: 2.2, height: 1 }]).length, 1); // right edge 12.2 > 12.175
  assert.equal(zones([{ str: 'THE', x: 8, y: 0.3, width: 1, height: 0.2 }]).length, 1); // top safe line 0.375
  assert.equal(zones([{ str: 'Blurb', x: 6.6, y: 3, width: 1, height: 0.2 }]).length, 1); // front fold safe line 6.675
  assert.deepEqual(zones([{ str: 'UPGRADE', x: 10, y: 3, width: 2.19, height: 1 }]), []); // 0.015" over: fine
});

await test('OCR words: confident ones are Must fix (best-effort); unsure ones are only Worth checking', () => {
  const sure = zones([penName(SAFE_BOTTOM + 0.1, { ocr: true, confidence: 95 })]);
  assert.equal(sure.length, 1);
  assert.equal(sure[0].severity, 'fail');
  assert.equal(sure[0].accuracy, 'best-effort');
  assert.match(sure[0].message, /read from the cover picture/);
  const unsure = zones([penName(SAFE_BOTTOM + 0.1, { ocr: true, confidence: 60 })]);
  assert.equal(unsure.length, 1);
  assert.equal(unsure[0].id, 'cover-safe-area-unsure');
  assert.equal(unsure[0].severity, 'warn');
  assert.match(unsure[0].message, /check it yourself/);
});

await test('panels with live text are not read; empty panels are', () => {
  assert.deepEqual(panelsWithoutText([], L), ['back', 'front']);
  assert.deepEqual(panelsWithoutText([{ str: 'Blurb', x: 1, y: 2, width: 2, height: 0.2 }], L), ['front']);
});

await test('OCR word boxes: panel offset, decorative dashes trimmed, baseline used for the bottom, duplicates merged', async () => {
  const dpi = 100;
  const render = { widthPx: 1255, heightPx: 925, dpi, rgba: new Uint8ClampedArray(1255 * 925 * 4).fill(255) };
  const calls = [];
  const fake = async (image) => {
    calls.push(image);
    // Same word in both readings; the first box is bloated by artwork below the baseline (y1 900).
    return calls.length % 2
      ? [{
        text: 'Vane——', confidence: 95, bbox: { x0: 100, y0: 800, x1: 160, y1: 900 },
        baseline: { x0: 100, y0: 840, x1: 160, y1: 840 },
        symbols: [...'Vane'].map((c, n) => ({ text: c, bbox: { x0: 100 + n * 10, y0: 810, x1: 110 + n * 10, y1: 900 } })),
      }, { text: '—', confidence: 90, bbox: { x0: 0, y0: 0, x1: 5, y1: 5 } }]
      : [{ text: 'Vane', confidence: 80, bbox: { x0: 100, y0: 805, x1: 140, y1: 841 } }];
  };
  const words = await readPanels(fake, render, L, { widthIn: 12.55, heightIn: 9.25 }, ['front'], specs.cover.ocr);
  assert.equal(calls.length, 2, 'read as rendered and inverted');
  assert.equal(calls[0].height, 925);
  assert.equal(calls[0].rgba.length, calls[0].width * calls[0].height * 4);
  const bmp = toBmp(calls[0]);
  assert.equal(String.fromCharCode(bmp[0], bmp[1]), 'BM');
  assert.equal(words.length, 1);
  const [w] = words;
  assert.equal(w.str, 'Vane');
  assert.equal(w.confidence, 95);
  const fx = Math.round((L.rects.spine.x + L.rects.spine.width) * dpi);
  assert.ok(Math.abs(w.x - (fx + 100) / dpi) < 0.011, `x ${w.x}`);
  assert.ok(Math.abs(w.width - 0.4) < 0.011, `dashes trimmed: width ${w.width}`);
  assert.ok(Math.abs(w.y + w.height - 8.41) < 0.011, `bottom at the baseline: ${w.y + w.height}`);
});

// End to end with the real OCR engine.
const { ocr, close } = await nodeOcr(specs);
const DARK = { x: 6.425, y: 0, w: 6.125, h: 9.25, color: [0.08, 0.08, 0.15] };
const coverWith = (cy) => makeCover({
  w: 12.55, h: 9.25, outlined: true, textColor: [0.95, 0.95, 0.9], fills: [DARK],
  text: [{ str: 'THE QUIET HARBOUR', cx: 9.4875, cy: 2, size: 30 }, { str: 'Stella Vane', cx: 9.4875, cy, size: 30 }],
});
const runOcr = async (bytes, settings = CREAM_120) => preflightCover(specs, bytes, settings, { ...env, ocr });

try {
  await test('flattened cover (light text on dark art, no text layer): pen name crossing the bottom safe line is 1 Must fix', async () => {
    const r = await runOcr(await coverWith(8.95));
    assert.deepEqual(r.ocr.panels, ['back', 'front']);
    assert.ok(r.ocr.words.some((w) => /Stella|Vane/.test(w.str)), `words: ${r.ocr.words.map((w) => w.str)}`);
    const fails = r.issues.filter((i) => i.severity === 'fail');
    assert.equal(fails.length, 1, fails.map((i) => i.message).join(' | '));
    assert.equal(fails[0].id, 'cover-safe-area');
    assert.match(fails[0].message, /front cover \(read from the cover picture\)/);
    assert.match(fails[0].message, /bottom trim line/);
    assert.ok(fails[0].bbox.y + fails[0].bbox.height > SAFE_BOTTOM + 0.02);
  });

  await test('flattened cover with the pen name inside the safe area: no safe-area issue', async () => {
    const r = await runOcr(await coverWith(8.4));
    assert.ok(r.ocr.words.length >= 2, `words: ${r.ocr.words.map((w) => w.str)}`);
    assert.deepEqual(r.issues.filter((i) => i.checkId === 'coverSafeArea'), []);
  });

  await test('without an OCR engine, a flattened cover is checked as before (no words, no crash)', async () => {
    const r = await preflightCover(specs, await coverWith(8.95), CREAM_120, env);
    assert.deepEqual(r.ocr, { panels: [], words: [] });
  });

  // The owner's real covers (not in the repo): run when present.
  const REAL = process.env.KDP_REAL_DIR ?? 'C:/Users/HP/Downloads';
  const AUD = { trim: '5.5x8.5', inkPaper: 'bw_white', pages: 55 };
  const real = async (name, fn) => {
    const f = `${REAL}/${name}`;
    if (!existsSync(f)) { skipped++; console.log('- skipped (file not found):', name); return; }
    await test(`real cover ${name}`, () => fn(new Uint8Array(readFileSync(f))));
  };
  await real('TATU_20261108_055404_0000.pdf', async (bytes) => {
    const r = await runOcr(bytes, AUD);
    const fails = r.issues.filter((i) => i.severity === 'fail');
    assert.equal(fails.length, 1, fails.map((i) => i.message).join(' | '));
    assert.match(fails[0].message, /Stella|Vane/);
    assert.match(fails[0].message, /bottom trim line/);
  });
  await real('TATU.pdf', async (bytes) => {
    const r = await runOcr(bytes, AUD);
    assert.deepEqual(r.issues.filter((i) => i.severity === 'fail').map((i) => i.message), []);
  });
} finally {
  await close();
}

console.log(`\n${passed} C6 tests passed${skipped ? `, ${skipped} skipped` : ''}`);
