// The report screen, summary first: a verdict card with counts, then one expandable row per problem,
// grouped into Must fix / Worth checking / Good to know, then a collapsed "Check details" section.
// Plain DOM + template strings. Every piece of text from the PDF or the engine goes through esc().
// No inline style attributes: the Content-Security-Policy (style-src 'self') would block them.
import { formatPageList } from '../engine/summarize.js';
import { groupIssues, issueGroupKey } from '../engine/runChecks.js';

const SEVERITY = { fail: 'Must fix', warn: 'Worth checking', info: 'Good to know' };
const GROUP_HINT = {
  fail: 'KDP will reject your file until these are fixed.',
  warn: "KDP usually accepts these, but they can look wrong in print or be flagged in review.",
  info: 'Guidelines that usually pass. No action needed unless you want to tidy up.',
};
const THUMBS_PER_ROW = 3;
// KDP rules we can't check reliably. Listed so authors know to check these themselves.
const NOT_SUPPORTED = ['Crop or trim marks drawn on the page', 'Resolution of images used as patterns or textures', 'Invisible objects', 'Placeholder text', 'Metadata', "Copyright or plagiarism: we can't compare your text against the web"];
/** The deep content check reads placeholder text, and metadata when the author typed some in. */
function notSupported(settings) {
  if (!settings.deepContent) return NOT_SUPPORTED;
  const md = Object.values(settings.content?.metadata ?? {}).some(Boolean);
  return NOT_SUPPORTED.filter((t) => t !== 'Placeholder text' && !(md && t === 'Metadata'));
}
// Short row titles for the deep content check. The full explanation stays in the engine's message.
const CONTENT_TITLES = {
  'content.gutenberg': 'Project Gutenberg text', 'content.gutenbergMention': 'Mentions Project Gutenberg',
  'content.placeholder': 'Placeholder text', 'content.storeLinks': 'Link to another book store',
  'content.storeMentions': 'Mentions another book store', 'content.aiLeftovers': 'Possible leftover AI chatbot text',
  'content.aiDisclosure': 'Reminder: disclose AI-generated content', 'content.newsletterLinks': 'Newsletter or sign-up link',
  'content.freelyAvailable': 'Text that may be free elsewhere', 'content.companionGuide': 'Looks like a summary or companion guide',
  'content.redirect': 'Sends readers elsewhere for the content', 'content.incentivisedReviews': 'Reward or star rating asked for reviews',
  'content.lyricsQuotes': 'Song lyrics credited', 'content.quotedMaterial': 'Quoted material: check permission', 'content.modeledOnTitle': 'Title very close to another book', 'content.bonusFront': 'Bonus content before Chapter 1',
  'content.bonusShare': 'A lot of bonus content', 'content.duplicate': 'Repeated passage',
  'content.repeatedHeading': 'Chapter heading used twice', 'content.taboo': 'Explicit scene with a restricted theme',
  'content.childrenExplicit': "Adult words in a children's book", 'content.genreAudience': "Erotica set for children",
  'content.titleMissing': 'Title not found in the book', 'content.authorMissing': 'Author name not found in the book',
  'content.isbnMismatch': "ISBN in the book doesn't match", 'content.isbnInvalid': "ISBN you entered isn't valid",
  'content.publisherBrand': 'Amazon or KDP named as publisher', 'content.publisherLine': 'Amazon or KDP named as publisher in the book',
  'content.pdTitleLabel': 'Title needs (Annotated), (Translated) or (Illustrated)', 'content.scope': 'What the deep content check read',
};
const SNIPPETS_SHOWN = 8;

const icon = (name, cls = 'icon') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

/**
 * @param {HTMLElement} root
 * @param {{ specs:object, summary:object, issues:Array<object>, pages:Array<object>,
 *   thumbs:Map<number,string>, file:File, settings:object }} data
 */
export function renderReport(root, data) {
  const { issues, pages, thumbs } = data;
  const groups = groupIssues(issues);
  const count = (sev) => groups.filter((g) => g.severity === sev).length;
  const counts = { fail: count('fail'), warn: count('warn'), info: count('info') };
  const pageInfo = new Map(pages.map((p) => [p.number, p]));
  const ctx = { issues, pageInfo, thumbs, specs: data.specs };

  root.scrollTop = 0; // on wide screens the results are a scrolling pane: start at the verdict
  root.innerHTML = `
    <div class="report">
      ${verdictHtml(counts)}
      ${['fail', 'warn', 'info'].map((sev) => groupHtml(sev, groups.filter((g) => g.severity === sev), ctx)).join('')}
      ${detailsHtml(data)}
    </div>`;

  const report = root.querySelector('.report');
  report.querySelector('[data-action="save-report"]').addEventListener('click', () => saveReport(data, counts));
  // Count chips jump to their group; "Good to know" starts collapsed, so open it on the way.
  report.addEventListener('click', (e) => {
    if (e.target.closest('a[data-group="info"]')) report.querySelector('details.group[data-sev="info"]').open = true;
  });
  // Bring the answer into view: smooth unless the reader prefers reduced motion. Focus moves too,
  // so screen readers announce the verdict.
  // Focus first: a focus() call after a smooth scroll has started can cancel it.
  report.querySelector('.verdict__title').focus({ preventScroll: true });
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  report.querySelector('.verdict').scrollIntoView({ behavior: reduce ? 'instant' : 'smooth', block: 'start' });
}

/** @param {'interior'|'cover'} subject what "Nothing here should stop KDP accepting your …" refers to */
/** `p` prefixes element ids, so two reports (interior and cover tabs) can be in the page at once. */
export function verdictHtml(counts, subject = 'interior', p = '') {
  const n = counts.fail;
  const title = n ? `Fix ${n} ${n === 1 ? 'thing' : 'things'} before uploading` : 'Looks ready to upload';
  const lead = n
    ? 'KDP is likely to reject this file as it is. Open each problem to see the pages and how to fix it.'
    : counts.warn
      ? `We found nothing KDP is known to reject in your ${subject}. ${counts.warn === 1 ? 'One thing is' : `${counts.warn} things are`} worth a look before you upload.`
      : `We found nothing KDP is known to reject in your ${subject}. We check printing rules, not whether KDP approves your content.`;
  const chips = ['fail', 'warn', 'info'].map((sev) => {
    const inner = `<strong>${counts[sev]}</strong> ${SEVERITY[sev].toLowerCase()}`;
    return `<li class="count" data-sev="${sev}" data-zero="${counts[sev] === 0}">${
      counts[sev] ? `<a href="#${p}group-${sev}" data-group="${sev}">${inner}</a>` : `<span>${inner}</span>`}</li>`;
  }).join('');
  return `
    <section class="card verdict" data-state="${n ? 'fail' : 'pass'}" aria-labelledby="${p}verdict-title">
      <div class="verdict__head">
        <span class="verdict__badge">${icon(n ? 'fail' : 'seal', 'verdict__icon')}</span>
        <div>
          <h2 id="${p}verdict-title" class="verdict__title" tabindex="-1">${title}</h2>
          <p class="verdict__lead">${lead}</p>
        </div>
      </div>
      <ul class="counts" aria-label="Problems by type">${chips}</ul>
      <div class="verdict__actions">
        <button type="button" class="btn btn--secondary" data-action="save-report">Download report</button>
        <span class="hint">A .json file for you, your designer or your formatter.</span>
      </div>
    </section>`;
}

export function groupHtml(sev, groups, ctx) {
  if (!groups.length) return '';
  const p = ctx.prefix ?? '';
  const head = `${icon(sev, 'group__icon')}<span class="group__name">${SEVERITY[sev]}</span><span class="group__count">${groups.length}</span>`;
  const body = `
    <p class="group__hint">${GROUP_HINT[sev]}</p>
    <div class="card issues">${groups.map((g) => rowHtml(g, ctx)).join('')}</div>`;
  // "Good to know" is collapsed by default: these usually need no action.
  if (sev === 'info') {
    return `
      <details class="group group--fold" id="${p}group-${sev}" data-sev="${sev}">
        <summary><h2 class="group__title">${head}${icon('chevron', 'chevron')}</h2></summary>
        ${body}
      </details>`;
  }
  return `
    <section class="group" id="${p}group-${sev}" data-sev="${sev}" aria-labelledby="${p}group-${sev}-title">
      <h2 class="group__title" id="${p}group-${sev}-title">${head}</h2>
      ${body}
    </section>`;
}

/** Page ranges with an en dash for display: "1–63, 70". */
const pageRange = (pages) => formatPageList(pages).replace(/-/g, '–');

function rowHtml(g, { issues, pageInfo, thumbs, specs, onePageLabel }) {
  const list = pageRange(g.pages);
  const where = g.pages.length === 0 ? 'Whole book'
    : g.pages.length === 1 ? (onePageLabel ?? `Page ${g.pages[0]}`)
    : list.length <= 14 ? `Pages ${list}`
    : `${g.pages.length} pages`;
  const members = issues.filter((i) => issueGroupKey(i) === g.key);
  const accuracy = g.accuracy === 'best-effort'
    ? `<p class="issue__note">${icon('info')} Best-effort check: it can occasionally be wrong.</p>` : '';
  return `
    <details class="issue" data-sev="${g.severity}">
      <summary>
        ${icon(g.severity, 'issue__icon')}
        <span class="issue__title">${esc(rowTitle(g, members.length, specs))}</span>
        <span class="issue__where">${where}</span>
        ${icon('chevron', 'chevron')}
      </summary>
      <div class="issue__body">
        <p class="issue__what">${esc(bodyText(g))}</p>
        <div class="issue__fix">
          <h3>${g.severity === 'info' ? 'What to do' : 'How to fix'}</h3>
          <p>${esc(g.fix)}</p>
        </div>
        ${g.pages.length > 1 && list.length > 14 ? `<p class="issue__pages"><strong>Pages:</strong> ${list}</p>` : ''}
        ${snippetsHtml(members)}
        ${proofsHtml(g, members, pageInfo, thumbs)}
        <p class="issue__links"><a href="${esc(g.source)}" target="_blank" rel="noopener">${esc(g.sourceLabel ?? 'Why KDP asks for this')}</a>${g.reportedSource ? ` · <a href="${esc(g.reportedSource.url)}" target="_blank" rel="noopener">Reported case</a>` : ''}</p>
        ${g.sourceNote ? `<p class="issue__note">${icon('info')} ${esc(g.sourceNote)}</p>` : ''}
        ${accuracy}
      </div>
    </details>`;
}

/** Deep content check: the words found, one line per page. */
function snippetsHtml(members) {
  const rows = members.filter((i) => i.snippet);
  if (!rows.length) return '';
  const shown = rows.slice(0, SNIPPETS_SHOWN);
  const more = rows.length - shown.length;
  return `
    <ul class="snips" aria-label="What we found">${shown.map((i) => `
      <li><span class="snips__page">${i.page != null ? `Page ${i.page}` : 'Book details'}</span><q>${esc(i.snippet)}</q></li>`).join('')}
    </ul>${more ? `<p class="snips__more">and ${more} more ${more === 1 ? 'page' : 'pages'}</p>` : ''}`;
}

/** Up to three page previews for this problem, worst page first, with only this problem marked. */
function proofsHtml(g, members, pageInfo, thumbs) {
  const withThumb = [...new Set(members.map((i) => i.page))].filter((p) => p != null && thumbs.has(p));
  if (!withThumb.length) return '';
  const order = g.worstPage != null && withThumb.includes(g.worstPage)
    ? [g.worstPage, ...withThumb.filter((p) => p !== g.worstPage)] : withThumb;
  const shown = order.slice(0, THUMBS_PER_ROW);
  const figures = shown.map((p) =>
    proofHtml(pageInfo.get(p), members.filter((i) => i.page === p), thumbs.get(p))).join('');
  const more = order.length - shown.length;
  return `
    <div class="proofs">
      ${figures}
      ${more ? `<p class="proofs__more">and ${more} more ${more === 1 ? 'page' : 'pages'}</p>` : ''}
    </div>
    ${shown.map((p) => pageInfo.get(p).legend).find(Boolean) ?? ''}
    ${shown.some((p) => pageInfo.get(p).layout) ? `<p class="proofs__legend"><span class="key key--safe"></span> Safe area for text <span class="key key--zone"></span> Too close to the edge or binding</p>` : ''}`;
}

/** Thumbnail with the safe area, the zones to keep clear, and an outline around each located problem. */
function proofHtml(page, pageIssues, thumb) {
  const { widthIn: w, heightIn: h, layout } = page;
  const r = (x) => Math.round(x * 1000) / 1000;
  let zones = '';
  if (layout) {
    const s = layout.safe;
    const t = layout.trim;
    zones = `
      <path class="zone" fill-rule="evenodd" d="M0 0H${r(w)}V${r(h)}H0Z M${r(s.x)} ${r(s.y)}h${r(s.width)}v${r(s.height)}h${r(-s.width)}Z"/>
      ${t.width < w || t.height < h ? `<rect class="trim" x="${r(t.x)}" y="${r(t.y)}" width="${r(t.width)}" height="${r(t.height)}"/>` : ''}
      <rect class="safe" x="${r(s.x)}" y="${r(s.y)}" width="${r(s.width)}" height="${r(s.height)}"/>`;
  }
  // Outlines are drawn in page inches but must stay visible on a ~140 px wide preview,
  // so size them relative to the page: k = 1 for a 9" tall page.
  const k = Math.max(w, h) / 9;
  const pad = 0.08 * k;
  const marks = page.overlay ? page.overlay(pageIssues) : pageIssues.filter((i) => i.bbox).map((i) => {
    const b = i.bbox;
    const x = Math.max(0, b.x - pad);
    const y = Math.max(0, b.y - pad);
    return `<rect class="mark" data-sev="${i.severity}" x="${r(x)}" y="${r(y)}" width="${r(Math.min(w - x, b.width + 2 * pad))}" height="${r(Math.min(h - y, b.height + 2 * pad))}" rx="${r(0.1 * k)}" stroke-width="${r(0.09 * k)}"/>`;
  }).join('');
  const side = page.side === 'right' ? 'right-hand' : 'left-hand';
  const caption = page.caption ?? `Page ${page.number} <span>${side}</span>`;
  return `
    <figure class="proof${w > h ? ' proof--wide' : ''}">
      <div class="proof__page">
        ${thumb ? `<img src="${thumb}" alt="" loading="lazy" decoding="async">` : ''}
        <svg viewBox="0 0 ${r(w)} ${r(h)}" aria-hidden="true"><!-- in flow: its viewBox sets the page shape -->
          ${zones}${marks}
        </svg>
      </div>
      <figcaption>${caption}</figcaption>
    </figure>`;
}

const ZONE = { inside: 'gutter', outside: 'outside margin', top: 'top margin', bottom: 'bottom margin' };
const FILE_TITLES = {
  'file-encrypted': 'PDF is locked (encrypted)',
  'file-unreadable': "Part of the file couldn't be read",
  'file-forms': 'Fillable form fields',
  'file-bookmarks': 'PDF has bookmarks',
  'file-javascript': 'PDF contains JavaScript',
};

/** A short row title (about 8 words). The full explanation is shown only when the row is opened. */
function rowTitle(g, count, specs) {
  const parts = (g.groupKey ?? '').split('|'); // margins|edge|kind, bleed|kind|edge, images|low|verylow
  if (CONTENT_TITLES[g.checkId]) return CONTENT_TITLES[g.checkId];
  switch (g.checkId) {
    case 'pageSize': return g.severity === 'info' ? 'Page size within tolerance' : `Wrong page size (${g.measured})`;
    case 'spread': return 'Two pages side by side (spread)';
    case 'pageCount':
      return { 'pageCount-odd': `Odd page count (${g.measured})`, 'pageCount-low': `Too few pages (${g.measured})`,
        'pageCount-high': `Too many pages (${g.measured})`, 'pageCount-unavailable': 'Trim size not available with this paper' }[g.id]
        ?? shortMessage(g.message);
    case 'fonts':
      if (g.id.startsWith('fonts-unembedded')) return `Font not embedded (${g.measured.replace(/ not embedded$/, '')})`;
      return g.severity === 'info' ? 'Fonts embedded as subsets' : "Font list couldn't be read";
    case 'fontSize': return `Text under ${specs.fonts.minSizePt} pt`;
    case 'images': {
      const label = parts[1] === 'verylow' ? 'Very low-resolution' : 'Low-resolution';
      return count > 1 ? `${label} images (lowest ${g.measured})` : `${label} image (${g.measured})`;
    }
    case 'margins': return `${parts[2] === 'text' ? 'Text' : 'Art'} in the ${ZONE[parts[1]] ?? 'margin'}`;
    case 'bleed':
      if (parts[1] === 'short') return 'Art stops short of the bleed edge';
      return parts[2] === 'inside' ? 'Art runs into the binding' : 'Art touches edge without bleed';
    case 'blankPages': return g.measured.replace(/^./, (c) => c.toUpperCase());
    case 'transparency': return 'Transparency used';
    case 'coverSize':
      return { 'cover-size-near': 'Cover size within tolerance', 'cover-size-no-bleed': 'Cover has no bleed',
        'cover-size-front-only': 'Front cover only, no back or spine', 'cover-size-spine': "Spine width doesn't match your book",
      }[g.id] ?? 'Wrong cover size';
    case 'coverSpineText':
      return g.severity === 'fail' ? `Spine text under ${specs.cover.spineText.minPages} pages` : `Spine text at ${specs.cover.spineText.minPages} pages`;
    case 'coverPages': return `Cover PDF has ${g.measured}`;
    case 'coverSafeArea':
    {
      const where = { back: 'back cover', spine: 'spine', front: 'front cover' }[g.groupKey?.split('-')[2]] ?? 'front cover';
      return g.groupKey?.endsWith('-unsure') ? `Possible text over the safe line (${where})` : `Text crosses the safe line (${where})`;
    }
    case 'coverFold': return 'Spine text crosses a fold line';
    case 'coverSpineEdge': return 'Spine text close to the spine edge';
    case 'coverBarcode': return 'Text or artwork in the barcode area';
    case 'fileRules':
      if (g.id.startsWith('file-comments')) return 'Comments or markup on the page';
      if (g.id.startsWith('file-links')) return 'Clickable links';
      if (g.id === 'file-too-big') return `File too big (${g.measured})`;
      return FILE_TITLES[g.id] ?? shortMessage(g.message);
    default: return shortMessage(g.message);
  }
}

/** The full explanation. Margin messages open with a bare label ("Text inside the gutter zone.")
 * that only repeats the row title, so it is left out there. */
function bodyText(g) {
  // Content rows list every snippet below, so the first page's "Found: …" is dropped here.
  if (g.checkId.startsWith('content.') && g.snippet) return g.message.replace(/\s*Found: "[\s\S]*"$/, '').replace(/^This page/, g.pages.length > 1 ? 'These pages' : 'This page').replace(/^(These pages) has/, '$1 have');
  return g.checkId === 'margins' ? g.message.replace(/^[^.]*\.\s+/, '') : g.message;
}

/** The first sentence of a message, without its full stop. */
function shortMessage(message) {
  const m = message.match(/^.+?[.!?](?=\s|$)/);
  return (m ? m[0] : message).replace(/\.$/, '');
}

function detailsHtml({ specs, summary, file, settings, notChecked = [] }) {
  const notCheckedHtml = notChecked.length ? `
        <h3>Not checked yet</h3>
        <p>We couldn't run these checks on this book:</p>
        <ul class="selfcheck">${notChecked.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : '';
  const ink = specs.pageCount.inkPaperTypes[settings.inkPaper] ?? settings.inkPaper;
  const [tw, th] = settings.trim.split('x');
  const range = summary.allowedRange ? `${summary.allowedRange[0]} to ${summary.allowedRange[1]} pages` : 'not available for this trim';
  const rows = summary.sizeGroups.map((g) =>
    `<tr><td>${g.widthIn}" x ${g.heightIn}"</td><td>${pageRange(g.pages)}</td></tr>`).join('');
  return `
    <details class="card check-details">
      <summary>
        <span><span class="check-details__title">Check details</span>
        <span class="check-details__sub">File info, page sizes and what to check yourself</span></span>
        ${icon('chevron', 'chevron')}
      </summary>
      <div class="check-details__body">
        <dl class="facts">
          <dt>File</dt><dd>${esc(file.name)}</dd>
          <dt>Pages</dt><dd>${summary.pageCount} pages, ${(file.size / 1e6).toFixed(1)} MB</dd>
          <dt>Checked as</dt><dd>${tw}" x ${th}" trim, ${esc(ink.toLowerCase())}, ${settings.bleed ? 'with bleed' : 'no bleed'}</dd>
          ${deepFact(specs, settings)}
          <dt>Page size needed</dt><dd>${summary.expected.width}" x ${summary.expected.height}"</dd>
          <dt>Page count allowed</dt><dd>${range}</dd>
        </dl>
        <table class="sizes"><caption>Page sizes in your PDF</caption>
          <thead><tr><th scope="col">Size</th><th scope="col">Pages</th></tr></thead><tbody>${rows}</tbody></table>
        <h3>Check these yourself</h3>
        <p>KDP asks for files without these, but they can't be detected reliably:</p>
        <ul class="selfcheck">${notSupported(settings).map((t) => `<li>${t}</li>`).join('')}</ul>${notCheckedHtml}
      </div>
    </details>`;
}

function deepFact(specs, settings) {
  if (!settings.deepContent) return '<dt>Deep content check</dt><dd>Off</dd>';
  const c = specs.content.context;
  const cs = settings.content ?? {};
  const parts = [c.genres.find((g) => g.id === cs.genre)?.label, c.audiences.find((a) => a.id === cs.audience)?.label,
    ...(cs.contexts ?? []).map((id) => c.contexts[id]?.label)].filter(Boolean);
  return `<dt>Deep content check</dt><dd>On${parts.length ? `: ${esc(parts.join(', '))}` : ''}</dd>`;
}

function saveReport({ specs, summary, issues, file, settings, notChecked = [] }, counts) {
  const report = {
    tool: 'KDP Book Studio interior preflight',
    generatedAt: new Date().toISOString(),
    kdpSpecsLastVerified: specs._meta.lastVerified,
    file: { name: file.name, sizeBytes: file.size, pageCount: summary.pageCount },
    settings,
    verdict: counts.fail ? 'fix-before-upload' : 'ready-for-kdp',
    counts: { mustFix: counts.fail, worthChecking: counts.warn, goodToKnow: counts.info },
    expectedPageSizeIn: summary.expected,
    allowedPageCount: summary.allowedRange,
    issues,
    notChecked,
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${file.name.replace(/\.pdf$/i, '')}-kdp-preflight.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
