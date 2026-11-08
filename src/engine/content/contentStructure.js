// Deep content check, structure rules: where things are in the book rather than single phrases.
// Bonus content before Chapter 1 or over ~10% of the book, duplicated passages, chapter headings that
// appear twice. All best-effort: they rely on the PDF's text layer and on recognisable headings. No DOM.

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const lines = (text) => text.split('\n').map((l) => l.trim()).filter(Boolean);
const DOT_LEADER = /(\.\s?){4,}\s*\d+\s*$/; // "Chapter 1 ........ 5" in a table of contents

/**
 * @param {object} specs
 * @param {Array<{ page:number, text:string }>} pages
 * @returns {Array<object>} issues
 */
export function runStructureRules(specs, pages) {
  const st = specs.content.structure;
  const src = (key) => specs.content.sources[key];
  const headingRe = new RegExp(st.chapterHeading, 'imu');
  const pageLines = pages.map((p) => ({ page: p.page, lines: lines(p.text) }));
  // A table of contents lists many chapters on one page; don't treat its lines as headings.
  const isToc = (pl) => pl.lines.filter((l) => headingRe.test(l) || DOT_LEADER.test(l)).length >= st.tocPageMinHeadings;
  const body = pageLines.filter((pl) => !isToc(pl));
  const base = (rule) => ({ accuracy: rule.accuracy, evidence: rule.evidence, source: src(rule.source), severity: rule.severity });
  return [...bonusIssues(st, body, pages.length, base), ...duplicateIssues(st, pages, base), ...repeatedHeadingIssues(st, body, headingRe, base)];
}

function bonusIssues(st, body, total, base) {
  const b = st.bonus;
  const firstRe = new RegExp(st.firstChapter, 'imu');
  const markerRe = (list) => new RegExp(`(?<!\\w)(${list.map(escapeRe).join('|')})(?!\\w)`, 'iu');
  const anyMarker = markerRe(b.markers);
  const frontMarker = markerRe(b.markers.filter((m) => !b.backOnly.includes(m)));
  const firstChapter = body.find((pl) => pl.lines.some((l) => firstRe.test(l)))?.page ?? null;
  // A marker counts only as a heading: within the first few lines of the page.
  const markerLine = (pl, re) => pl.lines.slice(0, b.headingLines).find((l) => re.test(l) && !DOT_LEADER.test(l));
  const issues = [];
  if (firstChapter == null) return issues; // no recognisable Chapter 1: position can't be judged

  for (const pl of body) {
    if (pl.page >= firstChapter) break;
    const line = markerLine(pl, frontMarker);
    if (!line) continue;
    issues.push({
      ...base(b), id: `content-bonusFront-p${pl.page}`, checkId: 'content.bonusFront', groupKey: 'bonusFront', page: pl.page,
      snippet: line, measured: `"${line}" before Chapter 1 (page ${firstChapter})`, required: 'bonus content after the main content',
      message: `This page looks like bonus content (a preview, excerpt or bonus story) placed before Chapter 1 on page ${firstChapter}. KDP requires bonus content at the end of the book. Found: "${line}"`,
      fix: 'Move previews, excerpts and bonus stories to the back of the book, after the last chapter, and list them in the table of contents.',
    });
  }

  const start = body.find((pl) => pl.page > firstChapter && markerLine(pl, anyMarker));
  if (start) {
    const share = (total - start.page + 1) / total;
    if (share > b.maxShare) {
      const pct = Math.round(share * 100);
      issues.push({
        ...base(b), id: 'content-bonusShare', checkId: 'content.bonusShare', page: null,
        measured: `${pct}% (pages ${start.page}–${total})`, required: `no more than about ${Math.round(b.maxShare * 100)}%`,
        message: `Bonus content seems to start on page ${start.page} ("${markerLine(start, anyMarker)}") and runs to the end: about ${pct}% of the book. KDP says bonus content should be no more than around ${Math.round(b.maxShare * 100)}%.`,
        fix: 'Shorten the bonus material (e.g. one sample chapter instead of several), or check whether pages after it are really part of the main book.',
      });
    }
  }
  return issues;
}

/** Repeated passages: the same run of `minWords` words starting at a sentence, twice in the book. */
function duplicateIssues(st, pages, base) {
  const d = st.duplicates;
  const words = [];
  for (const p of pages) {
    for (const raw of p.text.split(/\s+/)) {
      const w = raw.toLowerCase().replace(/[^\p{L}\p{N}']/gu, '');
      if (w) words.push({ w, page: p.page, raw, sentenceEnd: /[.!?]["')\]]*$/.test(raw) });
    }
  }
  const seen = new Map();
  const found = new Map(); // page -> { firstPage, snippet }
  for (let i = 0; i + d.minWords <= words.length; i++) {
    if (i > 0 && !words[i - 1].sentenceEnd) continue;
    const key = words.slice(i, i + d.minWords).map((x) => x.w).join(' ');
    const first = seen.get(key);
    if (first == null) { seen.set(key, i); continue; }
    if (i - first < d.minWords) continue; // overlapping repeats ("the the the …") aren't a copied passage
    const page = words[i].page;
    if (!found.has(page)) {
      found.set(page, { firstPage: words[first].page, snippet: `${words.slice(i, i + 12).map((x) => x.raw).join(' ')}…` });
    }
    i += d.minWords - 1; // one report per repeated passage
  }
  return [...found].map(([page, { firstPage, snippet }]) => ({
    ...base(d), id: `content-duplicate-p${page}`, checkId: 'content.duplicate', groupKey: 'duplicate', page, snippet,
    measured: `${d.minWords}+ words repeated from page ${firstPage}`, required: 'no unintended repeated text',
    message: `This page repeats a passage of ${d.minWords} or more words that already appears on page ${firstPage}. KDP treats unintended repeated text and chapters as a quality problem. Found: "${snippet}"`,
    fix: 'If the repeat is a mistake (e.g. a chapter pasted twice), delete it. If it is deliberate (a refrain, a repeated prayer or exercise), you can ignore this.',
  }));
}

/** The same chapter heading in two separate places. A running head repeats on consecutive pages, so runs of nearby pages count once. */
function repeatedHeadingIssues(st, body, headingRe, base) {
  const r = st.repeatedHeadings;
  const where = new Map(); // normalised heading -> pages
  for (const pl of body) {
    for (const l of pl.lines) {
      if (!headingRe.test(l)) continue;
      const key = l.toLowerCase().replace(/\s+/g, ' ');
      if (!where.has(key)) where.set(key, []);
      const list = where.get(key);
      if (list[list.length - 1] !== pl.page) list.push(pl.page);
    }
  }
  const issues = [];
  for (const [, list] of where) {
    const runs = list.filter((p, k) => k === 0 || p - list[k - 1] > st.runningHeadGap);
    for (const page of runs.slice(1)) {
      const heading = body.find((pl) => pl.page === page).lines.find((l) => headingRe.test(l));
      issues.push({
        ...base(r), id: `content-repeatedHeading-p${page}`, checkId: 'content.repeatedHeading', groupKey: 'repeatedHeading', page, snippet: heading,
        measured: `"${heading}" also on page ${runs[0]}`, required: 'each chapter heading once',
        message: `The heading "${heading}" appears again on this page; it is already on page ${runs[0]}. A repeated chapter heading often means a chapter was pasted twice or numbered wrong.`,
        fix: 'Check the chapter numbers and delete any chapter that appears twice, then update the table of contents.',
      });
    }
  }
  return issues;
}
