// Milestone 3 tests: fonts and file rules. Run: npm test
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { PDFDocument, PDFName, StandardFonts } from 'pdf-lib';
import { loadPdf } from '../src/engine/loadPdf.js';
import { runChecks, groupIssues } from '../src/engine/runChecks.js';
import { checkFileRules } from '../src/engine/checks/fileRules.js';
import {
  fixtures, makeDoc, embedGaramond, addEmbeddedText, saveWithSubsetTag, addAnnotation, addBookmark,
} from './fixtures/make-fixtures.mjs';

const specs = JSON.parse(readFileSync(new URL('../src/config/kdp-specs.json', import.meta.url)));
let passed = 0;
const test = async (name, fn) => { await fn(); passed++; console.log('✓', name); };

const SETTINGS = { trim: '6x9', inkPaper: 'bw_white', bleed: false };
const check = async (bytes) => runChecks(specs, await loadPdf(bytes), SETTINGS);
const ids = (issues) => issues.map((i) => i.id);

await test('unembedded font fails on each page it is used, grouped into one line', async () => {
  const issues = await check(await fixtures['unembedded-font']());
  assert.deepEqual(issues.map((i) => [i.checkId, i.severity, i.page]),
    [['fonts', 'fail', 3], ['fonts', 'fail', 4], ['fonts', 'fail', 5]]);
  assert.match(issues[0].message, /"Helvetica" is not embedded/);
  assert.equal(issues[0].accuracy, 'verified');
  const groups = groupIssues(issues);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].pages, [3, 4, 5]);
});

await test('real embedded font passes (Type0: follows DescendantFonts to the font file)', async () => {
  const doc = await makeDoc();
  const font = await addEmbeddedText(doc, doc.getPage(0));
  await addEmbeddedText(doc, doc.getPage(1), { font });
  const pdf = await loadPdf(await doc.save());
  assert.equal(pdf.fonts.length, 1);
  assert.match(pdf.fonts[0].name, /^EBGaramond-Regular/);
  assert.deepEqual([pdf.fonts[0].subtype, pdf.fonts[0].embedded, pdf.fonts[0].pages], ['Type0', true, [1, 2]]);
  assert.deepEqual(runChecks(specs, pdf, SETTINGS), []);
});

await test('simple TrueType font with an embedded FontFile2 passes', async () => {
  // pdf-lib only writes Type0 fonts, so build a simple TrueType font that reuses the real
  // embedded Garamond font descriptor (and its FontFile2 stream).
  const doc = await makeDoc();
  const real = await embedGaramond(doc);
  await doc.flush();
  const ctx = doc.context;
  const cid = ctx.lookup(ctx.lookup(real.ref).lookup(PDFName.of('DescendantFonts')).get(0));
  const tt = ctx.register(ctx.obj({
    Type: 'Font', Subtype: 'TrueType', BaseFont: 'EBGaramond-Regular',
    FontDescriptor: cid.get(PDFName.of('FontDescriptor')),
  }));
  doc.getPage(0).node.setFontDictionary(PDFName.of('TT'), tt);
  const pdf = await loadPdf(await doc.save());
  assert.deepEqual(pdf.fonts.map((f) => [f.subtype, f.embedded]), [['TrueType', true]]);
});

await test('Type3 counts as embedded; Type0 with no font file does not', async () => {
  const doc = await makeDoc();
  const ctx = doc.context;
  const t3 = ctx.register(ctx.obj({ Type: 'Font', Subtype: 'Type3', FontMatrix: [0.001, 0, 0, 0.001, 0, 0], CharProcs: {}, Encoding: {}, FontBBox: [0, 0, 1, 1] }));
  doc.getPage(0).node.setFontDictionary(PDFName.of('T3'), t3);
  const cid = ctx.register(ctx.obj({
    Type: 'Font', Subtype: 'CIDFontType0', BaseFont: 'KozMinPro',
    FontDescriptor: ctx.register(ctx.obj({ Type: 'FontDescriptor', FontName: 'KozMinPro', Flags: 4 })),
  }));
  const t0 = ctx.register(ctx.obj({ Type: 'Font', Subtype: 'Type0', BaseFont: 'KozMinPro', Encoding: 'Identity-H', DescendantFonts: [cid] }));
  doc.getPage(1).node.setFontDictionary(PDFName.of('T0'), t0);
  const pdf = await loadPdf(await doc.save());
  assert.deepEqual(pdf.fonts.map((f) => [f.subtype, f.embedded]), [['Type3', true], ['Type0', false]]);
  assert.deepEqual(ids(runChecks(specs, pdf, SETTINGS)), ['fonts-unembedded-KozMinPro-p2']);
});

await test('subset fonts: one info line listing the fonts, prefix stripped', async () => {
  const doc = await makeDoc();
  const font = await embedGaramond(doc, { subset: true });
  await addEmbeddedText(doc, doc.getPage(0), { font });
  const issues = await check(await saveWithSubsetTag(doc, font, 'ABCDEF'));
  assert.equal(issues.length, 1);
  assert.equal(issues[0].severity, 'info');
  assert.match(issues[0].message, /This font is embedded as a subset .*: EBGaramond-Regular\. /);
});

await test('fonts inside a placed PDF (Form XObject) are found', async () => {
  const inner = await PDFDocument.create();
  const p = inner.addPage([200, 200]);
  p.drawText('Placed', { font: await inner.embedFont(StandardFonts.TimesRoman), x: 10, y: 10 });
  const doc = await makeDoc();
  const [embedded] = await doc.embedPdf(await inner.save());
  doc.getPage(6).drawPage(embedded, { x: 100, y: 100, width: 100, height: 100 });
  const issues = await check(await doc.save());
  assert.deepEqual(issues.map((i) => [i.checkId, i.page]), [['fonts', 7]]);
  assert.match(issues[0].message, /Times-Roman/);
});

await test('annotated: comments fail per page, links warn once', async () => {
  const issues = await check(await fixtures.annotated());
  assert.deepEqual(ids(issues), ['file-links', 'file-comments-p2']);
  const comments = issues.find((i) => i.id === 'file-comments-p2');
  assert.equal(comments.severity, 'fail');
  assert.equal(comments.measured, 'Text, Highlight');
  const links = issues.find((i) => i.id === 'file-links');
  assert.equal(links.severity, 'warn');
  assert.match(links.message, /page 4\./);
});

await test('encrypted fixture fails', async () => {
  const pdf = await loadPdf(await fixtures.encrypted());
  assert.equal(pdf.encrypted, true);
  const issues = runChecks(specs, pdf, SETTINGS);
  assert.deepEqual(ids(issues), ['file-encrypted']);
  assert.equal(issues[0].severity, 'fail');
});

await test('unparseable encrypted file gets a locked-file message', async () => {
  const bytes = new TextEncoder().encode('%PDF-1.7\ngarbage\ntrailer\n<< /Encrypt 5 0 R >>\n%%EOF');
  const pdf = await loadPdf(bytes);
  assert.match(pdf.error, /locked or encrypted/);
});

await test('bookmarks, form fields, JavaScript warn', async () => {
  const doc = await makeDoc();
  addBookmark(doc);
  doc.getForm().createTextField('name').addToPage(doc.getPage(2), { x: 100, y: 100 });
  doc.addJavaScript('hello', 'app.alert("hi")');
  const issues = await check(await doc.save());
  const file = issues.filter((i) => i.checkId === 'fileRules');
  assert.deepEqual(file.map((i) => [i.id, i.severity]).sort(),
    [['file-bookmarks', 'warn'], ['file-forms', 'warn'], ['file-javascript', 'warn']]);
  assert.match(file.find((i) => i.id === 'file-javascript').message, /our advice, not a KDP rule/);
});

await test('file over 650 MB fails (decimal MB)', () => {
  const base = { encrypted: false, file: { annotations: [], hasFormFields: false, hasJavaScript: false, hasBookmarks: false } };
  assert.deepEqual(checkFileRules(specs, { ...base, sizeBytes: 650e6 }), []);
  const issues = checkFileRules(specs, { ...base, sizeBytes: 651e6 });
  assert.deepEqual(ids(issues), ['file-too-big']);
  assert.equal(issues[0].measured, '651 MB');
});

await test('earlier fixtures still clean: good file has no font or file issues', async () => {
  assert.deepEqual(await check(await fixtures['good-6x9-120p']()), []);
});

console.log(`\n${passed} tests passed`);
