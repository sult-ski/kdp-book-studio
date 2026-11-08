// Phase 2.5, milestone D2 tests: structure rules (bonus position/share, duplicate passages, repeated chapter
// headings) and phrase rules (freely available/PLR, companion guides, redirects, incentivised reviews, lyrics).
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { makeContentBook } from './fixtures/make-fixtures.mjs';
import { preflight } from '../src/engine/preflight.js';
import { runContentRules } from '../src/engine/content/contentRules.js';

const specs = JSON.parse(readFileSync(new URL('../src/config/kdp-specs.json', import.meta.url)));
const env = { pdfjs, docOptions: { standardFontDataUrl: 'node_modules/pdfjs-dist/standard_fonts/' } };
let passed = 0;
const test = async (name, fn) => { await fn(); passed++; console.log('✓', name); };

const S = { trim: '6x9', inkPaper: 'bw_white', bleed: false, toleranceIn: specs.app.sizeToleranceIn, deepContent: true };
const PROSE = 'The harbour was quiet that morning, and the boats sat still.';
const run = async (pages) => (await preflight(specs, await makeContentBook(pages), S, env)).issues
  .filter((i) => i.checkId.startsWith('content.') && i.checkId !== 'content.scope');
const only = (issues, checkId) => issues.filter((i) => i.checkId === checkId);
// Engine-only runs for the structure rules: { page, text } per page, no PDF needed.
const rules = (texts) => runContentRules(specs, texts.map((text, k) => ({ page: k + 1, text, urls: [] })))
  .filter((i) => i.checkId !== 'content.scope');

// A 48-word passage drawn as four lines (lines of ~12 words fit a 6" page).
const PASSAGE = [
  'Mara counted the lanterns along the quay twice before she trusted the number,',
  'because the harbour master had warned her that smugglers liked to move one light',
  'at a time until the whole line pointed somewhere new, and she had no wish',
  'to follow a crooked line of lamps into the rocks below the old fort tonight.',
];

await test('config: structure rules have severity, evidence and resolvable source URLs; bonus share is 10%', () => {
  const st = specs.content.structure;
  for (const key of ['bonus', 'duplicates', 'repeatedHeadings']) {
    assert.ok(['fail', 'warn', 'info'].includes(st[key].severity), key);
    assert.ok(['official', 'reported', 'both'].includes(st[key].evidence), key);
    assert.match(specs.content.sources[st[key].source], /^https:\/\//, key);
  }
  assert.equal(st.bonus.maxShare, 0.1);
  assert.equal(specs.content.sources[st.bonus.source], 'https://kdp.amazon.com/en_US/help/topic/G202018960');
});

await test('bonus content before Chapter 1: Worth checking on that page; "Also by" in front matter is fine', async () => {
  const issues = await run([
    { lines: ['Also by Jane Doe', 'The Quiet Harbour'] },
    { lines: ['Sneak Peek', 'From the next book in the series.'] },
    { lines: ['Chapter 1', PROSE] },
    { lines: [PROSE] },
  ]);
  const b = only(issues, 'content.bonusFront');
  assert.deepEqual(b.map((i) => i.page), [2]);
  assert.equal(b[0].severity, 'warn');
  assert.equal(b[0].accuracy, 'best-effort');
  assert.match(b[0].message, /before Chapter 1 on page 3/);
});

await test('a table of contents listing "Bonus Chapter" is not bonus content', () => {
  const toc = 'Contents\nChapter 1 ........ 1\nChapter 2 ........ 9\nBonus Chapter ........ 20';
  assert.deepEqual(only(rules([toc, 'Chapter 1\n' + PROSE, PROSE]), 'content.bonusFront'), []);
});

await test('no recognisable Chapter 1: bonus position is not judged', () => {
  assert.deepEqual(rules(['Sneak Peek\n' + PROSE, PROSE]), []);
});

await test('a prose line starting "CHAPTER 1 COVERS THE…" (real book) is not a Chapter 1 heading', () => {
  const r = rules(['Sneak Peek\n' + PROSE, 'CHAPTER 1 COVERS THE eighty years before the modern story', PROSE]);
  assert.deepEqual(only(r, 'content.bonusFront'), []);
});

await test('no Chapter 1 heading: preflight lists bonus position under "Not checked yet"; with one, nothing', async () => {
  const without = await preflight(specs, await makeContentBook([{ lines: [PROSE] }]), S, env);
  assert.equal(without.notChecked.length, 1);
  assert.match(without.notChecked[0], /Bonus content position/);
  const withCh = await preflight(specs, await makeContentBook([{ lines: ['Chapter 1', PROSE] }]), S, env);
  assert.deepEqual(withCh.notChecked, []);
  const off = await preflight(specs, await makeContentBook([{ lines: [PROSE] }]), { ...S, deepContent: false }, env);
  assert.deepEqual(off.notChecked, []); // deep check off: nothing claimed either way
});

await test('bonus content over ~10% of the book: one whole-book warning; under 10%: nothing', () => {
  const book = (n, bonusFrom) => Array.from({ length: n }, (_, k) =>
    k === 0 ? 'Chapter 1\n' + PROSE : k + 1 === bonusFrom ? 'Bonus Story\n' + PROSE : PROSE);
  const [big] = only(rules(book(20, 15)), 'content.bonusShare'); // pages 15-20 = 30%
  assert.equal(big.page, null);
  assert.match(big.measured, /30%/);
  assert.match(big.message, /around 10%/);
  assert.deepEqual(only(rules(book(20, 20)), 'content.bonusShare'), []); // 1 page = 5%
});

await test('a 40+ word passage pasted twice: Worth checking on the repeat, pointing to the first page', async () => {
  const issues = await run([{ lines: [PROSE, ...PASSAGE] }, { lines: [PROSE] }, { lines: [PROSE, ...PASSAGE] }]);
  const d = only(issues, 'content.duplicate');
  assert.deepEqual(d.map((i) => i.page), [3]);
  assert.match(d[0].measured, /from page 1/);
  assert.match(d[0].snippet, /^The harbour was quiet.*Mara/); // the repeat starts at the first shared sentence
});

await test('a short repeated sentence (under 40 words) is not a duplicate', () => {
  assert.deepEqual(only(rules([PROSE + ' ' + PROSE, PROSE, PROSE]), 'content.duplicate'), []);
});

await test('a chapter heading in two places: Worth checking; a running head on consecutive pages is not', () => {
  const r = rules(['Chapter 7\n' + PROSE, 'Chapter 7\n' + PROSE, 'Chapter 7\n' + PROSE, PROSE, PROSE, PROSE, 'Chapter 7\n' + PROSE]);
  const h = only(r, 'content.repeatedHeading');
  assert.deepEqual(h.map((i) => i.page), [7]);
  assert.match(h[0].message, /already on page 1/);
  assert.deepEqual(only(rules(['Chapter 3\n' + PROSE, 'Chapter 3\n' + PROSE, 'Chapter 4\n' + PROSE]), 'content.repeatedHeading'), []);
});

await test('freely available / PLR declarations: Worth checking (evidence: both)', async () => {
  const issues = await run([
    { lines: ['This story was originally published on Wattpad in 2019.'] },
    { lines: ['You receive private label rights to this ebook.'] },
    { lines: [PROSE] },
  ]);
  const f = only(issues, 'content.freelyAvailable');
  assert.deepEqual(f.map((i) => i.page), [1, 2]);
  assert.ok(f.every((i) => i.severity === 'warn' && i.evidence === 'both'));
});

await test('companion guide title is flagged; "analysis of" mid-sentence and "summary of the evidence" are not', async () => {
  const issues = await run([
    { lines: ['Summary of Atomic Habits by James Clear'] },
    { lines: ['Workbook for The Body Keeps the Score'] },
    { lines: ['No public', 'analysis of those materials exists. A summary of the evidence by the panel followed.'] },
  ]);
  assert.deepEqual(only(issues, 'content.companionGuide').map((i) => i.page), [1, 2]);
});

await test('redirect to finish the book: Worth checking', async () => {
  const [i] = only(await run([{ lines: ['To continue reading, visit my website.'] }]), 'content.redirect');
  assert.equal(i.severity, 'warn');
  assert.equal(i.source, specs.content.sources.contentQuality);
});

await test('incentivised reviews flagged (official source: Amazon Community Guidelines); a polite request is not', async () => {
  const issues = await run([
    { lines: ['Leave a review and I will send you a $5 gift card.'] },
    { lines: ['Please leave a 5-star review on Amazon!'] },
    { lines: ['If you enjoyed this book, please consider leaving an honest review.'] },
  ]);
  const r = only(issues, 'content.incentivisedReviews');
  assert.deepEqual(r.map((i) => i.page), [1, 2]);
  assert.equal(r[0].evidence, 'official');
  assert.equal(r[0].source, 'https://www.amazon.com/gp/help/customer/display.html?nodeId=GLHXEX85MENUE4XF');
});

await test('lyrics credit: Good to know; an epigraph with attribution is not flagged', async () => {
  const issues = await run([
    { lines: ['Words and music by A. Writer, used with permission.'] },
    { lines: ['"The sea is calm tonight." - Matthew Arnold'] },
  ]);
  const l = only(issues, 'content.lyricsQuotes');
  assert.deepEqual(l.map((i) => i.page), [1]);
  assert.equal(l[0].severity, 'info');
});

console.log(`\nD2: ${passed} tests passed`);
