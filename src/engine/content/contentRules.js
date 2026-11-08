// Deep content check rule engine: runs the phrase and pattern rules in kdp-specs.json "content" over each
// page's text (and, for `target: "urls"` rules, its link URLs too). One issue per rule per page,
// carrying the first matched snippet. No DOM.

// Plain-English wording per rule. Spec values (phrases, severity, sources) stay in the config.
const WORDING = {
  gutenberg: {
    what: 'This page has Project Gutenberg header or licence text.',
    why: 'KDP blocks public-domain books that aren\'t clearly different from the free version, and Project Gutenberg\'s licence says to remove its text if you sell the book.',
    fix: 'Delete all Project Gutenberg header, footer and licence text. If the book is public domain, make it a new edition (annotated, translated or illustrated) and say so in the title, e.g. "(Annotated)".',
  },
  gutenbergMention: {
    what: 'This page mentions Project Gutenberg or its volunteer credits.',
    why: 'This can be a sign the text was copied from a free public-domain edition, which KDP blocks unless your edition is clearly different.',
    fix: 'If this is only a citation, you can ignore this. If the book\'s text came from Project Gutenberg, remove these lines and make sure your edition adds real value (annotations, translation or illustrations).',
  },
  placeholder: {
    what: 'This page has placeholder text.',
    why: 'KDP\'s print guidelines say: "We will reject any files with placeholder text, such as Lorem Ipsum."',
    fix: 'Replace the placeholder with your real text (check headers, footers and the copyright page too), then export the PDF again.',
  },
  storeLinks: {
    what: 'This page links to or prints the web address of another book store.',
    why: 'KDP does not allow links to commercial ebook stores other than Amazon.',
    fix: 'Remove the store link or web address, or replace it with your Amazon book page, then export the PDF again.',
  },
  storeMentions: {
    what: 'This page says the book is available from another store.',
    why: 'KDP does not allow pointing readers to other ebook stores. We found no case of a paperback blocked for a plain mention, so this is a warning only.',
    fix: 'Consider removing the line, or point readers to Amazon instead.',
  },
  aiLeftovers: {
    what: 'This page has text that looks like it was left over from an AI chatbot.',
    why: 'Leftover chatbot replies in published books have caused public reader backlash. Speech in a story can match these phrases too, so read the snippet.',
    fix: 'If this is chatbot text, delete it and read the surrounding passage again. If it is part of your story, you can ignore this.',
  },
  newsletterLinks: {
    what: 'This page has a newsletter, sign-up or short link.',
    why: 'KDP lists sign-up forms among links it does not want in books. We don\'t know how often this is enforced.',
    fix: 'Usually fine. To be safe, link to your own author website instead of the sign-up form or a short link.',
  },
};

const AI_DISCLOSURE = {
  message: 'We found possible AI chatbot text. If AI wrote any of the text, images or translations, KDP requires you to say so when you publish.',
  fix: 'In your KDP Bookshelf, answer the AI-generated content question for this book (you can update it after publishing). AI-assisted editing or brainstorming does not need to be disclosed.',
};

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Phrase → regex: case-insensitive, any run of spaces/line breaks between words, whole words at the ends. */
const phraseRe = (p) => `(?<![\\w])${p.trim().split(/\s+/).map(escapeRe).join('\\s+')}(?![\\w])`;

/** Compiles one combined, case-insensitive regex per rule (cached on the rule object's id). */
export function compileRules(content) {
  return content.rules.map((rule) => {
    const parts = [...(rule.patterns ?? []), ...(rule.phrases ?? []).map(phraseRe)];
    return {
      rule,
      re: parts.length ? new RegExp(parts.map((p) => `(?:${p})`).join('|'), 'giu') : null,
      reCase: rule.caseSensitivePatterns?.length ? new RegExp(rule.caseSensitivePatterns.map((p) => `(?:${p})`).join('|'), 'gu') : null,
    };
  });
}

/** First match of a rule on a page: { snippet, count } or null. */
function matchPage({ rule, re, reCase }, page, snippetChars) {
  const sources = [page.text];
  if (rule.target === 'urls') sources.push(...page.urls);
  let first = null;
  let count = 0;
  for (const src of sources) {
    for (const r of [re, reCase]) {
      if (!r) continue;
      for (const m of src.matchAll(r)) {
        count++;
        if (!first) first = snippet(src, m.index, m[0].length, snippetChars);
      }
    }
  }
  return first ? { snippet: first, count } : null;
}

/** The match with some words either side, on one line. */
function snippet(text, at, len, chars) {
  const start = Math.max(0, at - chars);
  const end = Math.min(text.length, at + len + chars);
  const s = text.slice(start, end).replace(/\s+/g, ' ').trim();
  return `${start > 0 ? '…' : ''}${s}${end < text.length ? '…' : ''}`;
}

/**
 * @param {object} specs kdp-specs.json
 * @param {Array<{ page:number, text:string, urls:string[] }>} pages
 * @returns {Array<object>} issues
 */
export function runContentRules(specs, pages) {
  const content = specs.content;
  const compiled = compileRules(content);
  const issues = [];
  const hitRules = new Set();
  for (const c of compiled) {
    const { rule } = c;
    const w = WORDING[rule.id];
    if (!w) throw new Error(`No wording for content rule "${rule.id}"`);
    for (const page of pages) {
      const hit = matchPage(c, page, content.snippetChars);
      if (!hit) continue;
      hitRules.add(rule.id);
      issues.push({
        id: `content-${rule.id}-p${page.page}`, checkId: `content.${rule.id}`, groupKey: rule.id,
        severity: rule.severity, page: page.page, accuracy: rule.accuracy, evidence: rule.evidence,
        source: content.sources[rule.source],
        sourceLabel: rule.evidence === 'reported' ? 'Reported cases' : 'Why KDP asks for this',
        snippet: hit.snippet,
        measured: `"${hit.snippet}"${hit.count > 1 ? ` (${hit.count} matches on this page)` : ''}`,
        required: `no ${rule.label.toLowerCase()}`,
        message: `${w.what} ${w.why} Found: "${hit.snippet}"`,
        fix: w.fix,
      });
    }
  }
  // A strong rule hit makes its weaker companion redundant on the same page.
  const strong = new Set(issues.map((i) => `${i.groupKey}|${i.page}`));
  const kept = issues.filter((i) => {
    const skip = content.rules.find((r) => r.id === i.groupKey)?.skipIfRule;
    return !skip || !strong.has(`${skip}|${i.page}`);
  });

  for (const rule of content.rules) {
    if (!rule.followUp || !hitRules.has(rule.id)) continue;
    const f = content[rule.followUp];
    kept.push({
      id: `content-${rule.followUp}`, checkId: `content.${rule.followUp}`, severity: f.severity, page: null,
      accuracy: 'verified', evidence: f.evidence, source: content.sources[f.source],
      measured: 'possible AI text found', required: 'AI-generated content disclosed in KDP',
      message: AI_DISCLOSURE.message, fix: AI_DISCLOSURE.fix,
    });
  }

  const textless = pages.filter((p) => !p.text.trim()).length;
  kept.push({
    id: 'content-scope', checkId: 'content.scope', severity: 'info', page: null, accuracy: 'verified',
    source: content.sources.contentGuidelines,
    measured: `${pages.length - textless} of ${pages.length} pages have readable text`, required: 'readable text',
    message: `The deep content check read the text of ${pages.length - textless} of ${pages.length} pages. Text inside images or converted to outlines can't be read, and we can't compare your book against the web for copied text.`,
    fix: 'Nothing to do. If your text is in images, check those pages yourself for the same problems.',
  });
  return kept;
}
