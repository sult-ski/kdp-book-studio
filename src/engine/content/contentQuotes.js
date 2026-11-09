// Deep content check, D5: quoted material. Copyright is the real risk for a KDP book (quotes, lyrics,
// copied text), so this flags pages with a long quotation, a lyrics mention, or, when the book has many
// attributed quotes, every page with one. One issue per page. Best-effort: it reads the PDF text layer. No DOM.

import { phraseRe, snippet } from './contentRules.js';

const wordCount = (s) => s.trim().split(/\s+/).filter(Boolean).length;
const firstWords = (s, n) => {
  const w = s.trim().split(/\s+/);
  return w.slice(0, n).join(' ') + (w.length > n ? '…' : '');
};

/** Quoted spans on a page: { text, end } for “curly” pairs and, if the page's straight quotes pair up, "straight" ones. */
function quotedSpans(text) {
  const spans = [];
  for (const m of text.matchAll(/“([^“”]*)”/gu)) spans.push({ text: m[1], end: m.index + m[0].length });
  if ((text.match(/"/g) ?? []).length % 2 === 0) {
    for (const m of text.matchAll(/"([^"]*)"/gu)) spans.push({ text: m[1], end: m.index + m[0].length });
  }
  return spans;
}

/** @returns {Array<object>} issues */
export function runQuoteRules(specs, pages) {
  const q = specs.content.quotedMaterial;
  const lyricsRe = new RegExp(q.lyricsPhrases.map(phraseRe).join('|'), 'iu');
  const dashRe = /^[\s,]*[—–~-]{1,2}\s*([A-Z][\p{L}'.-]+(?:\s+[A-Z][\p{L}'.-]+){0,2})/u;
  const saidRe = /^[\s,]*(?:said|says|wrote|writes)\s+([A-Z][\p{L}'.-]+(?:\s+[A-Z][\p{L}'.-]+){0,2})/u;

  const perPage = pages.map((page) => {
    const spans = quotedSpans(page.text);
    const long = spans.find((s) => wordCount(s.text) >= q.minQuoteWords && wordCount(s.text) <= q.maxQuoteWords);
    const attributedSpans = spans.filter((s) => {
      const n = wordCount(s.text);
      const after = page.text.slice(s.end, s.end + 60);
      return (n >= 4 && dashRe.test(after)) || (n >= q.minAttributedQuoteWords && saidRe.test(after));
    });
    return { page, long, attributed: attributedSpans[0], attributedCount: attributedSpans.length, lyrics: page.text.match(lyricsRe) };
  });
  const attributedTotal = perPage.reduce((n, p) => n + p.attributedCount, 0);

  const issues = [];
  for (const p of perPage) {
    let snip = null;
    let measured = null;
    if (p.long) {
      const n = wordCount(p.long.text);
      snip = `Quotation of ${n} words: “${firstWords(p.long.text, 14)}”`;
      measured = `a ${n}-word quotation`;
    } else if (p.lyrics) {
      snip = `Mentions lyrics: ${snippet(p.page.text, p.lyrics.index, p.lyrics[0].length, specs.content.snippetChars)}`;
      measured = 'a mention of lyrics';
    } else if (p.attributed && attributedTotal >= q.minAttributed) {
      snip = `Attributed quote: “${firstWords(p.attributed.text, 14)}”`;
      measured = `${attributedTotal} attributed quotes in the book`;
    }
    if (!snip) continue;
    issues.push({
      id: `content-quotedMaterial-p${p.page.page}`, checkId: 'content.quotedMaterial', groupKey: 'quotedMaterial', page: p.page.page,
      severity: q.severity, accuracy: q.accuracy, evidence: q.evidence, source: specs.content.sources[q.source],
      sourceLabel: 'Why KDP asks for this', snippet: snip,
      measured: `${measured}: ${snip}`, required: 'quotations and lyrics you have permission to use',
      message: `This page has quoted material (a long quotation, quotes credited to other people, or a mention of lyrics). KDP's content guidelines say you must have the rights to the content you publish, and song lyrics and longer quotes are usually still under copyright. Found: "${snip}"`,
      fix: 'Make sure you have permission, or keep quotes short. Short quotes with credit, public-domain works, and your own words are fine.',
    });
  }
  return issues;
}
