// Phase 2.5, milestone D1 tests: text extraction + content rule engine + the first rules
// (Gutenberg, placeholder, store links/mentions, AI chatbot leftovers + disclosure reminder, newsletter links).
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { makeContentBook } from './fixtures/make-fixtures.mjs';
import { preflight } from '../src/engine/preflight.js';
import { runContentRules } from '../src/engine/content/contentRules.js';
import { joinItems } from '../src/engine/content/extractText.js';

const specs = JSON.parse(readFileSync(new URL('../src/config/kdp-specs.json', import.meta.url)));
const env = { pdfjs, docOptions: { standardFontDataUrl: 'node_modules/pdfjs-dist/standard_fonts/' } };
let passed = 0;
const test = async (name, fn) => { await fn(); passed++; console.log('✓', name); };

const S = { trim: '6x9', inkPaper: 'bw_white', bleed: false, toleranceIn: specs.app.sizeToleranceIn, deepContent: true };
const PROSE = 'The harbour was quiet that morning, and the boats sat still.';
const run = async (pages, settings = S) => (await preflight(specs, await makeContentBook(pages), settings, env)).issues
  .filter((i) => i.checkId.startsWith('content.'));
const hits = (issues) => issues.filter((i) => i.checkId !== 'content.scope');
const one = (issues, checkId) => {
  const found = issues.filter((i) => i.checkId === checkId);
  assert.equal(found.length, 1, `${checkId}: ${issues.map((i) => i.checkId).join()}`);
  return found[0];
};

await test('config: every content rule has severity, accuracy, evidence, a source URL and compiling patterns', () => {
  const c = specs.content;
  assert.match(c.lastVerified, /^\d{4}-\d{2}-\d{2}$/);
  for (const r of c.rules) {
    assert.ok(['fail', 'warn', 'info'].includes(r.severity), r.id);
    assert.ok(['verified', 'best-effort'].includes(r.accuracy), r.id);
    assert.ok(['official', 'reported', 'both'].includes(r.evidence), r.id);
    assert.match(c.sources[r.source], /^https:\/\//, r.id);
    for (const p of [...(r.patterns ?? []), ...(r.caseSensitivePatterns ?? [])]) new RegExp(p, 'giu');
  }
  assert.match(c.sources[c.aiDisclosure.source], /^https:\/\//);
});

await test('clean prose (incl. Roman "Chapter X", "reading nook", toolkit.com, "Would you" in speech) has no content issues', async () => {
  const issues = await run([
    { lines: ['Chapter X', PROSE, 'She curled up in her reading nook.'] },
    { lines: ['Chapter XX', 'Visit toolkit.com for the maps.', '"Would you pass the salt?" he asked.'] },
  ]);
  assert.deepEqual(hits(issues), []);
  assert.match(one(issues, 'content.scope').message, /2 of 2 pages/);
});

await test('without the deep content setting, no content issues at all', async () => {
  assert.deepEqual(await run([{ lines: ['lorem ipsum dolor sit amet'] }], { ...S, deepContent: false }), []);
});

await test('Project Gutenberg START marker: Must fix, verified, page and snippet', async () => {
  const issues = await run([{ lines: [PROSE] }, { lines: ['*** START OF THE PROJECT GUTENBERG EBOOK MOBY DICK ***', PROSE] }]);
  const i = one(issues, 'content.gutenberg');
  assert.equal(i.severity, 'fail');
  assert.equal(i.accuracy, 'verified');
  assert.equal(i.evidence, 'both');
  assert.equal(i.page, 2);
  assert.match(i.snippet, /START OF THE PROJECT GUTENBERG EBOOK/);
  assert.equal(i.source, specs.content.sources.publicDomain);
});

await test('gutenberg.org citation alone: Worth checking (best-effort); with licence text on the same page only the Must fix', async () => {
  const cite = await run([{ lines: ['Text from gutenberg.org, retrieved 2020.'] }]);
  const w = one(cite, 'content.gutenbergMention');
  assert.equal(w.severity, 'warn');
  assert.equal(w.accuracy, 'best-effort');
  const both = await run([{ lines: ['Project Gutenberg Literary Archive Foundation', 'www.gutenberg.org'] }]);
  one(both, 'content.gutenberg');
  assert.equal(both.filter((i) => i.checkId === 'content.gutenbergMention').length, 0);
});

await test('placeholder text: lorem ipsum, [Insert ...], Chapter ??, upper-case TODO are Must fix; lower-case "todo" is not', async () => {
  const issues = await run([
    { lines: ['Lorem ipsum dolor sit amet, consectetur adipiscing elit.'] },
    { lines: ['About the author: [Insert author bio here]'] },
    { lines: ['Chapter ??'] },
    { lines: ['TODO: fix this scene'] },
    { lines: ['My todo list was long.'] },
  ]);
  const p = issues.filter((i) => i.checkId === 'content.placeholder');
  assert.deepEqual(p.map((i) => i.page), [1, 2, 3, 4]);
  assert.ok(p.every((i) => i.severity === 'fail' && i.accuracy === 'verified'));
  assert.match(p[0].measured, /3 matches/);
  assert.equal(p[0].source, specs.content.sources.printGuidelines2018);
});

await test('placeholder phrase split across two lines is still found', async () => {
  const i = one(await run([{ lines: ['Book Title', 'Here'] }]), 'content.placeholder');
  assert.match(i.snippet, /Book Title Here/);
});

await test('store link annotation (kobo.com) and a printed books2read address: Must fix', async () => {
  const issues = await run([
    { lines: [PROSE], links: ['https://www.kobo.com/ebook/my-book'] },
    { lines: ['Find all my books at books2read.com/mybook'] },
  ]);
  const s = issues.filter((i) => i.checkId === 'content.storeLinks');
  assert.deepEqual(s.map((i) => i.page), [1, 2]);
  assert.ok(s.every((i) => i.severity === 'warn'));
  assert.match(s[0].snippet, /kobo\.com/);
});

await test('"available on Kobo and Apple Books" in text: Worth checking, best-effort', async () => {
  const i = one(await run([{ lines: ['This book is also available on Kobo and Apple Books.'] }]), 'content.storeMentions');
  assert.equal(i.severity, 'warn');
  assert.equal(i.accuracy, 'best-effort');
});

await test('AI chatbot leftovers (curly apostrophe, line break): Worth checking + one AI disclosure reminder', async () => {
  const issues = await run([
    { lines: ['As an AI language model, I cannot'] },
    { lines: ['I’ve rewritten the passage to align more', 'with J. Bree’s style.'] },
  ]);
  const ai = issues.filter((i) => i.checkId === 'content.aiLeftovers');
  assert.deepEqual(ai.map((i) => i.page), [1, 2]);
  assert.ok(ai.every((i) => i.severity === 'warn' && i.evidence === 'reported'));
  const d = one(issues, 'content.aiDisclosure');
  assert.equal(d.page, null);
  assert.equal(d.severity, 'info');
  assert.match(d.message, /must|requires/i);
});

await test('no AI leftovers: no disclosure reminder', async () => {
  assert.equal((await run([{ lines: [PROSE] }])).filter((i) => i.checkId === 'content.aiDisclosure').length, 0);
});

await test('newsletter link (Mailchimp) and bit.ly: Good to know', async () => {
  const issues = await run([
    { lines: [PROSE], links: ['https://eepurl.list-manage.com/subscribe?u=1'] },
    { lines: ['Join my list: bit.ly/myletter'] },
  ]);
  const n = issues.filter((i) => i.checkId === 'content.newsletterLinks');
  assert.deepEqual(n.map((i) => i.page), [1, 2]);
  assert.ok(n.every((i) => i.severity === 'info'));
});

await test('pages with no readable text are counted in the scope note', async () => {
  const i = one(await run([{ lines: [PROSE] }, {}]), 'content.scope');
  assert.match(i.message, /1 of 2 pages/);
  assert.match(i.message, /images or converted to outlines/);
});

await test('joinItems adds spaces between same-line items and breaks between lines', () => {
  const it = (str, x, y, width, hasEOL = false) => ({ str, transform: [11, 0, 0, 11, x, y], width, hasEOL });
  assert.equal(joinItems([it('lorem', 0, 100, 30), it('ipsum', 34, 100, 30), it('next', 0, 80, 20)]), 'lorem ipsum\nnext');
  assert.equal(joinItems([it('exam-', 0, 100, 30, true), it('ple', 0, 80, 20)]), 'example');
});

await test('runContentRules: one issue per rule per page, grouped by rule', () => {
  const issues = runContentRules(specs, [{ page: 5, text: 'lorem ipsum. Lorem ipsum again.', urls: [] }]);
  const p = issues.filter((i) => i.checkId === 'content.placeholder');
  assert.equal(p.length, 1);
  assert.equal(p[0].groupKey, 'placeholder');
  assert.equal(p[0].page, 5);
});

console.log(`\nD1: ${passed} tests passed`);
