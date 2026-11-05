// Milestone 2 tests: page size, spreads, page count. Run: npm test
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { loadPdf } from '../src/engine/loadPdf.js';
import { runChecks, groupIssues } from '../src/engine/runChecks.js';
import { makePdf, fixtures } from './fixtures/make-fixtures.mjs';

const specs = JSON.parse(readFileSync(new URL('../src/config/kdp-specs.json', import.meta.url)));
let passed = 0;
const test = async (name, fn) => { await fn(); passed++; console.log('✓', name); };

const NO_BLEED = { trim: '6x9', inkPaper: 'bw_white', bleed: false };
const BLEED = { ...NO_BLEED, bleed: true };
const repeat = (n, size) => Array.from({ length: n }, () => size);
const check = async (bytes, settings) => runChecks(specs, await loadPdf(bytes), settings);
const ofCheck = (issues, checkId) => issues.filter((i) => i.checkId === checkId);

const REQUIRED_KEYS = ['id', 'checkId', 'severity', 'page', 'measured', 'required', 'message', 'fix', 'accuracy', 'source'];
const assertShape = (issues) => issues.forEach((i) => {
  for (const k of REQUIRED_KEYS) assert.ok(k in i, `issue ${i.id} missing ${k}`);
  assert.ok(['fail', 'warn', 'info'].includes(i.severity));
  assert.ok(['verified', 'best-effort'].includes(i.accuracy));
  assert.match(i.source, /^https:\/\/kdp\.amazon\.com\//);
});

await test('good-6x9-120p passes', async () => {
  const issues = await check(await fixtures['good-6x9-120p'](), NO_BLEED);
  assert.deepEqual(issues, []);
});

await test('wrong-size fails every page, grouped into one line', async () => {
  const issues = await check(await fixtures['wrong-size'](), NO_BLEED);
  assertShape(issues);
  const size = ofCheck(issues, 'pageSize');
  assert.equal(size.length, 120);
  assert.equal(size[0].severity, 'fail');
  assert.equal(size[0].measured, '8.5" x 11"');
  assert.equal(size[0].required, '6" x 9"');
  const groups = groupIssues(issues);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].pages.length, 120);
});

await test('bleed setting expects trim + 0.125" x 0.25"', async () => {
  const bleedPages = await makePdf(repeat(24, [6.125, 9.25]));
  assert.deepEqual(await check(bleedPages, BLEED), []);
  // Same file with "No bleed" chosen: fails, and the message points at the bleed setting.
  const issues = ofCheck(await check(bleedPages, NO_BLEED), 'pageSize');
  assert.equal(issues.length, 24);
  assert.match(issues[0].message, /with bleed/);
  assert.match(issues[0].fix, /choose "Bleed"/);
  // Trim-size pages with "Bleed" chosen: the reverse hint.
  const trimPages = ofCheck(await check(await makePdf(repeat(24, [6, 9])), BLEED), 'pageSize');
  assert.match(trimPages[0].fix, /choose "No bleed"/);
});

await test('tolerance: 0.005" off passes, 0.02" off fails, custom tolerance respected', async () => {
  assert.deepEqual(await check(await makePdf(repeat(24, [6.005, 9.005])), NO_BLEED), []);
  const off = await makePdf(repeat(24, [6.02, 9]));
  assert.equal(ofCheck(await check(off, NO_BLEED), 'pageSize').length, 24);
  assert.deepEqual(await check(off, { ...NO_BLEED, toleranceIn: 0.03 }), []);
});

await test('rotated page reads upright; unrotated landscape page flagged as sideways', async () => {
  const sizes = repeat(24, [6, 9]);
  sizes[3] = [9, 6];
  assert.deepEqual(await check(await makePdf(sizes, { rotate: { 3: 90 } }), NO_BLEED), []);
  const issues = ofCheck(await check(await makePdf(sizes), NO_BLEED), 'pageSize');
  assert.equal(issues.length, 1);
  assert.equal(issues[0].page, 4);
  assert.match(issues[0].message, /sideways/);
});

await test('spreads detected (with and without bleed), not double-reported as wrong size', async () => {
  const sizes = repeat(24, [6, 9]);
  sizes[5] = [12, 9];
  let issues = await check(await makePdf(sizes), NO_BLEED);
  assertShape(issues);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].checkId, 'spread');
  assert.equal(issues[0].page, 6);
  assert.equal(issues[0].fixId, 'split-spreads');

  const bleedSizes = repeat(24, [6.125, 9.25]);
  bleedSizes[0] = [12.25, 9.25];
  issues = await check(await makePdf(bleedSizes), BLEED);
  assert.deepEqual(issues.map((i) => i.checkId), ['spread']);

  // 8.5x11 is not a 6x9 spread.
  issues = await check(await makePdf(repeat(24, [8.5, 11])), NO_BLEED);
  assert.equal(ofCheck(issues, 'spread').length, 0);
});

await test('odd page count: info, rounded up before range check', async () => {
  let issues = await check(await makePdf(repeat(31, [6, 9])), NO_BLEED);
  assertShape(issues);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].severity, 'info');
  assert.match(issues[0].message, /print 32 pages/);
  // 23 pages rounds to 24 = minimum, so no fail.
  issues = await check(await makePdf(repeat(23, [6, 9])), NO_BLEED);
  assert.deepEqual(issues.map((i) => i.severity), ['info']);
});

await test('page count below minimum / above maximum fails', async () => {
  let issues = await check(await makePdf(repeat(20, [6, 9])), NO_BLEED);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].id, 'pageCount-low');
  assert.equal(issues[0].page, null);
  assert.equal(issues[0].required, '24–828 pages');

  // Standard color needs at least 72 pages.
  issues = await check(await makePdf(repeat(70, [6, 9])), { ...NO_BLEED, inkPaper: 'color_standard' });
  assert.match(issues[0].message, /at least 72/);

  // 8.5x11 cream allows at most 550; 551 rounds to 552.
  issues = await check(await makePdf(repeat(551, [8.5, 11])), { trim: '8.5x11', inkPaper: 'bw_cream', bleed: false });
  assert.deepEqual(issues.map((i) => i.id), ['pageCount-high', 'pageCount-odd']);
  assert.match(issues[0].message, /552 pages/);
});

await test('unavailable trim + ink/paper combination fails', async () => {
  const issues = await check(await makePdf(repeat(100, [8.27, 11.69])),
    { trim: '8.27x11.69', inkPaper: 'color_standard', bleed: false });
  assert.deepEqual(issues.map((i) => i.id), ['pageCount-unavailable']);
  assert.match(issues[0].message, /doesn't offer standard color, white paper at 8.27" x 11.69" trim/);
});

console.log(`\n${passed} tests passed`);
