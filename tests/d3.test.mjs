// Phase 2.5, milestone D3 tests: genre/audience/context settings, erotica taboo co-occurrence,
// children's audience + explicit words, and pasted metadata vs the manuscript.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { makeContentBook } from './fixtures/make-fixtures.mjs';
import { preflight } from '../src/engine/preflight.js';
import { runContentRules } from '../src/engine/content/contentRules.js';
import { isbnValid, toIsbn13, contentContext } from '../src/engine/content/contentContext.js';

const specs = JSON.parse(readFileSync(new URL('../src/config/kdp-specs.json', import.meta.url)));
const env = { pdfjs, docOptions: { standardFontDataUrl: 'node_modules/pdfjs-dist/standard_fonts/' } };
let passed = 0;
const test = async (name, fn) => { await fn(); passed++; console.log('✓', name); };

const rules = (texts, content) => runContentRules(specs, texts.map((text, k) => ({ page: k + 1, text, urls: [] })), content)
  .filter((i) => i.checkId !== 'content.scope');
const only = (issues, checkId) => issues.filter((i) => i.checkId === checkId);
const PROSE = 'The harbour was quiet that morning, and the boats sat still.';

await test('config: context, lexicon, taboo, children and metadata sections; sources resolve', () => {
  const c = specs.content;
  assert.ok(c.context.genres.length && c.context.audiences.length);
  for (const r of [c.taboo, c.childrenExplicit]) {
    assert.equal(r.severity, 'warn');
    assert.equal(r.accuracy, 'best-effort');
    assert.match(c.sources[r.source], /^https:\/\//);
  }
  assert.equal(c.sources.metadataGuidelines, 'https://kdp.amazon.com/en_US/help/topic/G201097560');
  for (const g of [...c.taboo.groups, ...c.childrenExplicit.groups]) assert.ok(c.lexicon[g]?.length, g);
});

await test('contentContext: unknown genre/audience/context ids fall back to defaults', () => {
  const ctx = contentContext(specs, { genre: 'x', audience: 'y', contexts: ['nope', 'hymnal'], metadata: { title: '  T  ' } });
  assert.deepEqual([ctx.genre, ctx.audience, ctx.contexts, ctx.metadata.title], ['general', 'adult', ['hymnal'], 'T']);
});

await test('taboo: explicit words + minor/step-family/non-consent on one page → Worth checking with snippet', () => {
  const issues = only(rules([
    'She was sixteen years old. He had an erection.',
    'Her stepbrother watched as they had sex.',
    'An orgasm, against her will.',
    'They had sex. ' + PROSE, // explicit but no taboo term
    'My sister is a teenager. ' + PROSE, // taboo term but nothing explicit
  ]), 'content.taboo');
  assert.deepEqual(issues.map((i) => i.page), [1, 2, 3]);
  assert.equal(issues[0].severity, 'warn');
  assert.match(issues[0].message, /age or a minor/);
  assert.match(issues[1].message, /family-relationship/);
  assert.match(issues[2].message, /non-consent/);
  assert.match(issues[0].snippet, /sixteen years old/);
});

await test('taboo: page numbers and ages over 17 do not count as minors', () => {
  assert.deepEqual(only(rules(['Page 16. She was 25 years old and they had sex.']), 'content.taboo'), []);
});

await test("children's audience: swearing, explicit and violent words flagged; adult audience is not", () => {
  const texts = ['"Shit," said the troll.', 'The knight was beheaded.', PROSE];
  const kids = only(rules(texts, { audience: 'children' }), 'content.childrenExplicit');
  assert.deepEqual(kids.map((i) => i.page), [1, 2]);
  assert.match(kids[0].message, /swear/);
  assert.match(kids[1].message, /violence/);
  assert.deepEqual(only(rules(texts), 'content.childrenExplicit'), []);
  // "Scunthorpe" problem: whole words only.
  assert.deepEqual(only(rules(['They visited Scunthorpe and Shitake Lane.'], { audience: 'children' }), 'content.childrenExplicit'), []);
});

await test('erotica + children audience → genre warning', () => {
  assert.equal(only(rules([PROSE], { genre: 'erotica', audience: 'children' }), 'content.genreAudience').length, 1);
  assert.equal(only(rules([PROSE], { genre: 'erotica' }), 'content.genreAudience').length, 0);
});

await test('contexts: hymnal hides lyrics/duplicates; AI-themed lowers AI leftovers; typography lowers placeholder to warn', () => {
  const hymn = ['Words and music by J. Newton', 'Chapter 1\n' + PROSE];
  assert.equal(only(rules(hymn), 'content.lyricsQuotes').length, 1);
  assert.equal(only(rules(hymn, { contexts: ['hymnal'] }), 'content.lyricsQuotes').length, 0);
  const ai = only(rules(['"As an AI language model, I can\'t," said the robot.'], { contexts: ['aiThemed'] }), 'content.aiLeftovers');
  assert.equal(ai[0].severity, 'info');
  assert.match(ai[0].message, /Lowered because/);
  const ph = only(rules(['Lorem ipsum dolor sit amet'], { contexts: ['typography'] }), 'content.placeholder');
  assert.equal(ph[0].severity, 'warn');
  // Gutenberg licence text stays Must fix even for an annotated edition.
  const g = only(rules(['*** START OF THE PROJECT GUTENBERG EBOOK MOBY DICK ***'], { contexts: ['pdAnnotated'] }), 'content.gutenberg');
  assert.equal(g[0].severity, 'fail');
});

await test('ISBN helpers: checksum for 10 and 13 digits; ISBN-10 converts to 13', () => {
  assert.ok(isbnValid('9780306406157'));
  assert.ok(!isbnValid('9780306406158'));
  assert.ok(isbnValid('0306406152'));
  assert.equal(toIsbn13('0306406152'), '9780306406157');
});

await test('metadata: title/author found despite case and punctuation; missing ones warn', () => {
  const front = ['THE QUIET HARBOUR\nA Novel\nby Jane  Doe', 'Copyright © 2026 Jane Doe'];
  const ok = rules(front, { metadata: { title: 'The Quiet Harbour: A Novel', author: 'Jane Doe' } });
  assert.deepEqual([...only(ok, 'content.titleMissing'), ...only(ok, 'content.authorMissing')], []);
  assert.deepEqual(only(rules(['J A Y ’ S   O U T   O F   T H E  SHADOWS'], { metadata: { title: "Jay's Out of the Shadows" } }), 'content.titleMissing'), []);
  const bad = rules(front, { metadata: { title: 'The Loud Harbour', author: 'J. Doe' } });
  assert.equal(only(bad, 'content.titleMissing')[0].severity, 'warn');
  assert.equal(only(bad, 'content.authorMissing').length, 1);
  assert.equal(only(bad, 'content.authorMissing')[0].severity, 'warn');
});

await test('metadata: ISBN in the book that differs from the entered one → warn; same ISBN in either form is fine', () => {
  const text = ['Copyright page\nISBN: 978-0-306-40615-7'];
  assert.deepEqual(only(rules(text, { metadata: { isbn: '0-306-40615-2' } }), 'content.isbnMismatch'), []);
  const mm = only(rules(text, { metadata: { isbn: '978-1-4028-9462-6' } }), 'content.isbnMismatch');
  assert.equal(mm.length, 1);
  assert.equal(mm[0].page, 1);
  assert.match(mm[0].message, /must match/);
  assert.equal(mm[0].severity, 'fail');
  assert.equal(mm[0].evidence, 'both');
  assert.equal(mm[0].sourceLabel, 'KDP Metadata Guidelines + reported rejection');
  // No ISBN entered → never checked; spaces/hyphens ignored.
  assert.deepEqual(only(rules(text), 'content.isbnMismatch'), []);
  assert.deepEqual(only(rules(['ISBN 978 0 306 40615 7'], { metadata: { isbn: '9780306406157' } }), 'content.isbnMismatch'), []);
  assert.equal(only(rules(text, { metadata: { isbn: '978-1-2345' } }), 'content.isbnInvalid').length, 1);
});

await test('metadata: Amazon/KDP in the publisher field or the "Published by" line → warn', () => {
  assert.equal(only(rules([PROSE], { metadata: { publisher: 'Amazon KDP' } }), 'content.publisherBrand').length, 1);
  assert.equal(only(rules([PROSE], { metadata: { publisher: 'Harbour Press' } }), 'content.publisherBrand').length, 0);
  const line = only(rules(['Copyright 2026\nPublished by Kindle Direct Publishing']), 'content.publisherLine');
  assert.equal(line[0].page, 1);
  assert.equal(line[0].severity, 'warn');
  assert.equal(only(rules([PROSE], { metadata: { publisher: 'Amazon KDP' } }), 'content.publisherBrand')[0].severity, 'warn');
  assert.equal(only(rules(['Independently published\nAvailable on Amazon']), 'content.publisherLine').length, 0);
});

await test('public-domain edition: title without (Annotated)/(Translated)/(Illustrated) → warn', () => {
  assert.equal(only(rules([PROSE], { contexts: ['pdAnnotated'], metadata: { title: 'Moby Dick' } }), 'content.pdTitleLabel').length, 1);
  assert.equal(only(rules([PROSE], { contexts: ['pdAnnotated'], metadata: { title: 'Moby Dick (Annotated)' } }), 'content.pdTitleLabel').length, 0);
});

await test('end to end: settings.content reaches the engine through preflight on a real PDF', async () => {
  const bytes = await makeContentBook([{ lines: ['The Quiet Harbour', 'ISBN 978-0-306-40615-7'] }, { lines: ['"Shit," said the troll.'] }]);
  const S = { trim: '6x9', inkPaper: 'bw_white', bleed: false, toleranceIn: specs.app.sizeToleranceIn, deepContent: true,
    content: { audience: 'children', metadata: { title: 'The Quiet Harbour', isbn: '9781402894626' } } };
  const { issues } = await preflight(specs, bytes, S, env);
  assert.deepEqual(only(issues, 'content.childrenExplicit').map((i) => i.page), [2]);
  assert.equal(only(issues, 'content.isbnMismatch').length, 1);
  assert.equal(only(issues, 'content.titleMissing').length, 0);
});

console.log(`\n${passed} D3 tests passed`);
