// Phase 2.5, milestone D5 tests: other-store links are Worth checking, quoted material, modeled-on title overlap.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { runContentRules } from '../src/engine/content/contentRules.js';

const specs = JSON.parse(readFileSync(new URL('../src/config/kdp-specs.json', import.meta.url)));
let passed = 0;
const test = async (name, fn) => { await fn(); passed++; console.log('✓', name); };
const rules = (texts, content, urls = []) => runContentRules(specs, texts.map((text, k) => ({ page: k + 1, text, urls: urls[k] ?? [] })), content)
  .filter((i) => i.checkId !== 'content.scope');
const only = (issues, id) => issues.filter((i) => i.checkId === id);
const PROSE = 'The harbour was quiet that morning, and the boats sat still.';
const words = (n) => Array.from({ length: n }, (_, k) => `word${k}`).join(' ');

await test('other-store links are Worth checking, not Must fix', () => {
  const [i] = only(rules([PROSE], undefined, [['https://www.kobo.com/ebook/x']]), 'content.storeLinks');
  assert.equal(i.severity, 'warn');
  assert.equal(specs.content.rules.find((r) => r.id === 'storeLinks').severity, 'warn');
});

await test('quoted material: a 45-word quotation is flagged, a 30-word one is not', () => {
  const long = only(rules([`He wrote: “${words(45)}” and left.`]), 'content.quotedMaterial');
  assert.equal(long.length, 1);
  assert.equal(long[0].severity, 'warn');
  assert.match(long[0].snippet, /45 words/);
  assert.match(long[0].fix, /permission/);
  assert.equal(long[0].source, 'https://kdp.amazon.com/en_US/help/topic/G200672390');
  assert.deepEqual(only(rules([`“${words(30)}”`]), 'content.quotedMaterial'), []);
  assert.equal(only(rules([`"${words(45)}"`]), 'content.quotedMaterial').length, 1); // straight quotes too
});

await test('quoted material: ordinary dialogue and an odd number of straight quotes are ignored', () => {
  const dialogue = '"Where are you going?" she asked. "Home," he said. "It is late." "Fine," she said, and "goodbye."';
  assert.deepEqual(only(rules([dialogue]), 'content.quotedMaterial'), []);
  assert.deepEqual(only(rules([`He said "${words(50)} and then it never closed.`]), 'content.quotedMaterial'), []);
});

await test('quoted material: 5 attributed quotes flag their pages; 4 do not; "said Name" in short dialogue never counts', () => {
  const q = (n) => `“Life is what happens while you are busy making other plans.” — Author${'abcdefg'[n]} Name`;
  const five = rules(Array.from({ length: 5 }, (_, k) => q(k)));
  assert.deepEqual(only(five, 'content.quotedMaterial').map((i) => i.page), [1, 2, 3, 4, 5]);
  assert.deepEqual(only(rules(Array.from({ length: 4 }, (_, k) => q(k))), 'content.quotedMaterial'), []);
  const fiction = Array.from({ length: 8 }, () => '“I am going home now,” said John Smith.');
  assert.deepEqual(only(rules(fiction), 'content.quotedMaterial'), []);
  const said = Array.from({ length: 5 }, () => `“${words(14)}” said Mary Jones.`);
  assert.equal(only(rules(said), 'content.quotedMaterial').length, 5);
});

await test('quoted material: the word "lyrics" is flagged; it replaces the info-level lyrics credit on that page', () => {
  const issues = rules(['Lyrics by Someone Famous.', 'Words and music by A. Person.']);
  assert.deepEqual(only(issues, 'content.quotedMaterial').map((i) => i.page), [1]);
  assert.deepEqual(only(issues, 'content.lyricsQuotes').map((i) => i.page), [2]); // page 1 covered by the broader rule
});

await test('quoted material: hymnal context hides it', () => {
  const issues = rules(['The lyrics are on the next page.'], { contexts: ['hymnal'] });
  assert.deepEqual(only(issues, 'content.quotedMaterial'), []);
});

await test('modeled-on title: ≥60% overlap (stopwords ignored) is Worth checking', () => {
  const md = (title, modeledOn) => only(rules([PROSE], { metadata: { title, modeledOn } }), 'content.modeledOnTitle');
  const [i] = md('The Art of War for Managers: Lessons in Strategy', 'The Art of War');
  assert.equal(i.severity, 'warn');
  assert.equal(i.accuracy, 'best-effort');
  assert.match(i.message, /misleading/);
  assert.equal(md('Atomic Habits', 'Atomic Habits').length, 1);
  assert.equal(md('Tiny Habits That Stick', 'Atomic Habits').length, 0); // 1 of 3 words
  assert.equal(md('Gentle Garden Notes', 'Atomic Habits').length, 0);
  assert.equal(md('', 'Atomic Habits').length, 0); // no title entered, nothing to compare
  assert.equal(only(rules([PROSE], { metadata: { title: 'Atomic Habits' } }), 'content.modeledOnTitle').length, 0);
});

console.log(`\n${passed} D5 tests passed`);
