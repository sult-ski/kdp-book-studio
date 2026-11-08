// Deep content check, D3: rules that depend on what the author tells us about the book.
// - Context (public-domain edition, AI-themed, typography, hymnal) lowers or hides rules that would be false alarms.
// - Erotica taboo co-occurrence (every genre) and children's audience + explicit words.
// - Metadata the author pastes (title, author, ISBN, publisher) compared with the manuscript.
// Settings shape: { genre, audience, contexts: string[], metadata: { title, author, isbn, publisher } }. No DOM.

import { phraseRe, snippet } from './contentRules.js';

const SEV_ORDER = { fail: 0, warn: 1, info: 2 };

/** Normalises the author's settings; unknown ids fall back to the defaults. */
export function contentContext(specs, raw = {}) {
  const c = specs.content.context;
  const genre = c.genres.some((g) => g.id === raw.genre) ? raw.genre : 'general';
  const audience = c.audiences.some((a) => a.id === raw.audience) ? raw.audience : 'adult';
  const contexts = (raw.contexts ?? []).filter((id) => c.contexts[id]);
  const m = raw.metadata ?? {};
  const clean = (v) => (typeof v === 'string' ? v.trim() : '');
  return { genre, audience, contexts, metadata: { title: clean(m.title), author: clean(m.author), isbn: clean(m.isbn), publisher: clean(m.publisher) } };
}

/** Applies context overrides: "off" removes the issue, a severity replaces it (only ever lowers it). */
export function applyContextOverrides(specs, issues, ctx) {
  const overrides = {};
  for (const id of ctx.contexts) Object.assign(overrides, specs.content.context.contexts[id].overrides);
  return issues.flatMap((i) => {
    const key = i.checkId.replace(/^content\./, '');
    const o = overrides[key];
    if (!o) return [i];
    if (o === 'off') return [];
    if (SEV_ORDER[o] <= SEV_ORDER[i.severity]) return [i];
    const label = ctx.contexts.map((id) => specs.content.context.contexts[id]).find((x) => x.overrides[key])?.label;
    return [{ ...i, severity: o, message: `${i.message} (Lowered because you marked this book as: ${label}.)` }];
  });
}

const lexRe = (specs, group) => {
  const lex = specs.content.lexicon;
  const parts = [...(lex[group] ?? []).map(phraseRe), ...(lex[`${group}Patterns`] ?? [])];
  return new RegExp(parts.map((p) => `(?:${p})`).join('|'), 'giu');
};

const GROUP_WORDS = {
  minor: 'a word about age or a minor', family: 'a family-relationship word', nonConsent: 'a non-consent word',
  bestiality: 'a bestiality word', sexual: 'sexually explicit words', profanity: 'strong swear words', violence: 'graphic violence',
};

/** Sexual terms on the same page as minor/family/non-consent/bestiality terms. */
function tabooIssues(specs, pages) {
  const t = specs.content.taboo;
  const sexual = lexRe(specs, 'sexual');
  const groups = t.groups.map((g) => ({ g, re: lexRe(specs, g) }));
  const out = [];
  for (const page of pages) {
    const s = [...page.text.matchAll(sexual)][0];
    if (!s) continue;
    const hits = groups.map(({ g, re }) => ({ g, m: [...page.text.matchAll(re)][0] })).filter((h) => h.m);
    if (!hits.length) continue;
    const words = hits.map((h) => GROUP_WORDS[h.g]).join(', ');
    const snip = snippet(page.text, hits[0].m.index, hits[0].m[0].length, specs.content.snippetChars);
    out.push({
      id: `content-taboo-p${page.page}`, checkId: 'content.taboo', groupKey: 'taboo', page: page.page,
      severity: t.severity, accuracy: t.accuracy, evidence: t.evidence, source: specs.content.sources[t.source],
      sourceLabel: 'Why KDP asks for this', snippet: snip,
      measured: `explicit words with ${words}: "${snip}"`, required: 'no sexual content involving minors, family members, non-consent or animals',
      message: `This page has explicit sexual words on the same page as ${words}. KDP does not allow sexual content involving minors, incest (including step-relations), non-consent or bestiality, even in fiction. This is a word match only, so read the page. Found: "${snip}"`,
      fix: 'Read this page. If the scene is fine (for example the words are unrelated), you can ignore this. If it describes one of these themes, rewrite or remove it before publishing.',
    });
  }
  return out;
}

/** Children's audience: any explicit, profane or graphically violent words. */
function childrenIssues(specs, pages) {
  const r = specs.content.childrenExplicit;
  const groups = r.groups.map((g) => ({ g, re: lexRe(specs, g) }));
  const out = [];
  for (const page of pages) {
    const hits = groups.map(({ g, re }) => ({ g, ms: [...page.text.matchAll(re)] })).filter((h) => h.ms.length);
    if (!hits.length) continue;
    const words = hits.map((h) => GROUP_WORDS[h.g]).join(', ');
    const m = hits[0].ms[0];
    const snip = snippet(page.text, m.index, m[0].length, specs.content.snippetChars);
    const count = hits.reduce((n, h) => n + h.ms.length, 0);
    out.push({
      id: `content-childrenExplicit-p${page.page}`, checkId: 'content.childrenExplicit', groupKey: 'childrenExplicit', page: page.page,
      severity: r.severity, accuracy: r.accuracy, evidence: r.evidence, source: specs.content.sources[r.source],
      sourceLabel: 'Why KDP asks for this', snippet: snip,
      measured: `${words}: "${snip}"${count > 1 ? ` (${count} matches on this page)` : ''}`, required: "no adult content in a children's book",
      message: `You chose a children's audience, but this page has ${words}. KDP's Metadata Guidelines say sexually explicit content makes a book ineligible for Children's categories, and adult language may get it moved out of them. Found: "${snip}"`,
      fix: "Read this page. Remove or soften the words, or publish the book for an older audience instead of in Children's categories.",
    });
  }
  return out;
}

function genreIssues(specs, ctx) {
  if (!(ctx.genre === 'erotica' && ctx.audience === 'children')) return [];
  return [{
    id: 'content-genreAudience', checkId: 'content.genreAudience', page: null, severity: 'warn', accuracy: 'verified',
    evidence: 'official', source: specs.content.sources.metadataGuidelines,
    measured: "erotica with a children's audience", required: 'an adult audience for erotica',
    message: "You chose Erotica and a children's audience together. Sexually explicit books must answer Yes to KDP's primary-audience question, which makes them ineligible for Children's categories.",
    fix: 'Check the genre and audience you picked. Erotica must be published for adults.',
  }];
}

// ---------- Metadata ----------

const norm = (s) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[’‘`]/g, "'")
  .replace(/[^\p{L}\p{N}']+/gu, ' ').trim();

/** ISBN digits (X kept) or null. */
const isbnDigits = (s) => s.toUpperCase().replace(/[^0-9X]/g, '');
export function isbnValid(d) {
  if (/^\d{13}$/.test(d)) {
    const sum = [...d].reduce((a, c, k) => a + Number(c) * (k % 2 ? 3 : 1), 0);
    return sum % 10 === 0;
  }
  if (/^\d{9}[\dX]$/.test(d)) {
    const sum = [...d].reduce((a, c, k) => a + (c === 'X' ? 10 : Number(c)) * (10 - k), 0);
    return sum % 11 === 0;
  }
  return false;
}
/** ISBN-10 → ISBN-13 (978 prefix) so both forms compare equal. */
export function toIsbn13(d) {
  if (d.length === 13) return d;
  const core = `978${d.slice(0, 9)}`;
  const sum = [...core].reduce((a, c, k) => a + Number(c) * (k % 2 ? 3 : 1), 0);
  return core + ((10 - (sum % 10)) % 10);
}
const ISBN_IN_TEXT = /\bISBN(?:-1[03])?[\s:#]*((?:97[89][\s-]?)?(?:\d[\s-]?){9}[\dXx])\b/gu;

function metadataIssues(specs, pages, ctx) {
  const md = specs.content.metadata;
  const src = specs.content.sources[md.source];
  const out = [];
  const add = (key, fields) => {
    const r = md[key];
    out.push({
      id: `content-${key}${fields.page ? `-p${fields.page}` : ''}`, checkId: `content.${key}`, groupKey: key, page: null,
      severity: r.severity, accuracy: r.accuracy, evidence: r.evidence ?? md.evidence, source: r.source ? specs.content.sources[r.source] : src,
      sourceLabel: r.sourceLabel ?? 'Why KDP asks for this', ...fields,
    });
  };
  const { title, author, isbn, publisher } = ctx.metadata;
  const front = norm(pages.slice(0, md.searchPages).map((p) => p.text).join('\n'));
  const frontTight = front.replace(/ /g, '');
  // Letter-spaced title pages ("J A Y ' S  O U T") come out of the PDF with a space between every letter.
  const has = (needle) => ` ${front} `.includes(` ${norm(needle)} `) || frontTight.includes(norm(needle).replace(/ /g, ''));

  if (title) {
    const main = title.split(/[:—–]/)[0]; // "Main Title: Subtitle" → the main title must appear
    if (norm(main) && !has(main)) {
      add('titleMissing', {
        measured: `"${main.trim()}" not found on the first ${md.searchPages} pages`, required: 'the title you entered printed in the book',
        message: `We couldn't find the title you entered ("${main.trim()}") on the first ${md.searchPages} pages. KDP's Metadata Guidelines say the title in your files must match the title you enter when you set up the book.`,
        fix: 'Check the title page spelling against your KDP title field (punctuation and capitals don\'t matter here). If your title page is an image, you can ignore this.',
      });
    }
  }
  if (author && norm(author) && !has(author)) {
    add('authorMissing', {
      measured: `"${author}" not found on the first ${md.searchPages} pages`, required: 'the author name you entered printed in the book',
      message: `We couldn't find the author name you entered ("${author}") on the first ${md.searchPages} pages. KDP expects the author name in the book to match the author field.`,
      fix: 'Make the name on your title page match your KDP author field exactly (for example, include or drop the middle initial in both). If your title page is an image, you can ignore this.',
    });
  }
  if (isbn) {
    const d = isbnDigits(isbn);
    if (!isbnValid(d)) {
      add('isbnInvalid', {
        measured: `"${isbn}"`, required: 'a valid 10- or 13-digit ISBN',
        message: `The ISBN you entered ("${isbn}") isn't a valid ISBN: the digits or the check digit are wrong.`,
        fix: 'Copy the ISBN again from your ISBN agency (or from KDP if you used a free KDP ISBN) and check the digits.',
      });
    } else {
      const want = toIsbn13(d);
      for (const page of pages) {
        for (const m of page.text.matchAll(ISBN_IN_TEXT)) {
          const found = isbnDigits(m[1]);
          if (!isbnValid(found) || toIsbn13(found) === want) continue;
          if (out.some((i) => i.checkId === 'content.isbnMismatch')) break;
          add('isbnMismatch', {
            page: page.page, snippet: m[0].trim(),
            measured: `${m[0].trim()} on page ${page.page}`, required: `ISBN ${isbn}`,
            message: `Page ${page.page} prints ${m[0].trim()}, but you entered ${isbn}. KDP's Metadata Guidelines say: "If you include your own ISBN in your manuscript, it must match the ISBN you entered during title setup."`,
            fix: 'Change the ISBN on your copyright page to the one for this paperback (an ebook or hardcover ISBN is different), or remove it, then export the PDF again.',
          });
        }
      }
    }
  }
  const brand = new RegExp(md.brandPattern, 'iu');
  if (publisher && brand.test(publisher)) {
    add('publisherBrand', {
      measured: `publisher "${publisher}"`, required: 'no Amazon, Kindle or KDP in the publisher name',
      message: `The publisher you entered ("${publisher}") mentions ${publisher.match(brand)[0]}. KDP's Metadata Guidelines don't allow references to Amazon, Kindle or Kindle Direct Publishing in the publisher field.`,
      fix: 'Use your own name or imprint as the publisher, or leave the field blank (KDP then shows "Independently published").',
    });
  }
  const line = new RegExp(md.publisherLinePattern, 'imu');
  for (const page of pages.slice(0, md.searchPages)) {
    const m = page.text.match(line);
    if (!m) continue;
    const snip = m[0].replace(/\s+/g, ' ').trim();
    add('publisherLine', {
      page: page.page, snippet: snip, measured: `"${snip}"`, required: 'your own name or imprint as publisher',
      message: `Page ${page.page} says "${snip}". Amazon and KDP print your book but aren't its publisher, and KDP doesn't allow them to be named as the publisher.`,
      fix: 'Change the line to your own name or imprint, e.g. "Published by Jane Doe" or "Independently published", then export the PDF again.',
    });
    break;
  }
  if (ctx.contexts.includes('pdAnnotated') && title) {
    const r = md.pdTitleLabel;
    if (!r.labels.some((l) => new RegExp(`\\(${l}\\)`, 'iu').test(title))) {
      add('pdTitleLabel', {
        measured: `title "${title}"`, required: `"(${r.labels.join(')", "(')})" in the title`,
        message: `You marked this as a new edition of a public-domain book, but the title you entered doesn't say how it differs. KDP asks for "(Annotated)", "(Translated)" or "(Illustrated)" in the title of these editions.`,
        fix: `Add the right label to the title field, e.g. "${title} (Annotated)".`,
      });
    }
  }
  return out.map((i) => ({ ...i, page: i.page ?? null }));
}

/** All D3 issues for a book. */
export function runContextRules(specs, pages, ctx) {
  return [
    ...genreIssues(specs, ctx),
    ...tabooIssues(specs, pages),
    ...(ctx.audience === 'children' ? childrenIssues(specs, pages) : []),
    ...metadataIssues(specs, pages, ctx),
  ];
}
