// The report screen: verdict, what to fix (each fix once), page-by-page proof sheets, about + save.
// Plain DOM + template strings. Every piece of text from the PDF or the engine goes through esc().
import { formatPageList } from '../engine/summarize.js';
import { groupIssues, issueGroupKey, needsPageCard } from '../engine/runChecks.js';

const SEVERITY = { fail: 'Must fix', warn: 'Worth checking', info: 'Good to know' };
const PAGES_SHOWN_AT_FIRST = 12;
// KDP rules we can't check reliably. Listed so authors know to check these themselves.
const NOT_SUPPORTED = ['crop or trim marks drawn on the page', 'resolution of images used as patterns or textures', 'invisible objects', 'placeholder text', 'metadata'];

/**
 * @param {HTMLElement} root
 * @param {{ specs:object, summary:object, issues:Array<object>, pages:Array<object>,
 *   thumbs:Map<number,string>, file:File, settings:object }} data
 */
export function renderReport(root, data) {
  const { issues, pages, thumbs } = data;
  const groups = groupIssues(issues);
  const groupId = new Map(groups.map((g, n) => [g.key, `fix-${n + 1}`]));
  const count = (sev) => groups.filter((g) => g.severity === sev).length;
  const counts = { fail: count('fail'), warn: count('warn'), info: count('info') };

  // Pages that have their own issues, in page order.
  const byPage = new Map();
  for (const i of issues) {
    if (i.page == null) continue;
    if (!byPage.has(i.page)) byPage.set(i.page, []);
    byPage.get(i.page).push(i);
  }
  const pageInfo = new Map(pages.map((p) => [p.number, p]));
  const sheetPages = [...byPage.keys()].filter((n) => needsPageCard(byPage.get(n))).sort((a, b) => a - b);
  const carded = new Set(sheetPages);

  root.innerHTML = `
    <div class="report">
      <svg class="defs" width="0" height="0" aria-hidden="true" focusable="false"><defs>
        <pattern id="hatch" width="0.12" height="0.12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="0.12" height="0.12"/><line x1="0" y1="0" x2="0" y2="0.12"/></pattern></defs></svg>
      ${verdictHtml(counts)}
      <section class="block" aria-labelledby="fixes-title">
        <h2 id="fixes-title">${counts.fail || counts.warn ? 'What to fix' : 'Good to know'}</h2>
        ${groups.length
          ? `<ul class="fixes">${groups.map((g) => fixHtml(g, groupId.get(g.key), carded)).join('')}</ul>`
          : '<p class="empty">Nothing to fix. As far as these checks go, KDP should accept this interior.</p>'}
      </section>
      ${sheetPages.length ? `
      <section class="block" aria-labelledby="pages-title">
        <h2 id="pages-title">Page by page</h2>
        <p class="legend">
          <span class="legend__safe">Dashed line: safe area for text.</span>
          <span class="legend__zone">Striped edges: too close to the edge or binding.</span>
          Circled: where each problem is.
        </p>
        <ol class="sheets">${sheetPages.map((n) => sheetHtml(pageInfo.get(n), byPage.get(n), thumbs.get(n), groupId)).join('')}</ol>
        <button type="button" class="more" hidden></button>
      </section>` : ''}
      ${aboutHtml(data)}
    </div>`;

  const report = root.querySelector('.report');
  const onlyFails = report.querySelector('#only-fails');
  const more = report.querySelector('.more');
  let showAll = false;

  // Filter + "show all pages": hide what doesn't match, then cap the number of visible sheets.
  const applyView = () => {
    const fo = onlyFails?.checked ?? false;
    report.classList.toggle('is-fails-only', fo);
    const sheets = [...report.querySelectorAll('.sheet')];
    const matching = sheets.filter((s) => !fo || s.dataset.hasFail === 'true');
    sheets.forEach((s) => { s.hidden = true; });
    matching.forEach((s, i) => { s.hidden = !showAll && i >= PAGES_SHOWN_AT_FIRST; });
    if (more) {
      more.hidden = showAll || matching.length <= PAGES_SHOWN_AT_FIRST;
      more.textContent = `Show all ${matching.length} pages`;
    }
  };
  onlyFails?.addEventListener('change', applyView);
  more?.addEventListener('click', () => { showAll = true; applyView(); });

  // "See it on page N" links: make sure that sheet is visible before jumping to it.
  report.addEventListener('click', (e) => {
    const link = e.target.closest('a[data-page]');
    if (!link) return;
    const sheet = report.querySelector(`#page-${link.dataset.page}`);
    if (sheet?.hidden) { showAll = true; if (onlyFails) onlyFails.checked = false; applyView(); }
  });

  report.querySelector('#save-report').addEventListener('click', () => saveReport(data, counts));
  applyView();
  report.querySelector('#verdict-title').focus({ preventScroll: false });
}

function verdictHtml(counts) {
  const n = counts.fail;
  const others = counts.warn + counts.info;
  const title = n ? `Fix ${n} ${n === 1 ? 'thing' : 'things'} before uploading` : 'Ready for KDP';
  const lead = n
    ? 'KDP will reject this file as it is. Each fix is listed below.'
    : counts.warn
      ? `Nothing here should stop KDP accepting your interior. ${counts.warn === 1 ? 'One thing is' : `${counts.warn} things are`} worth checking before you upload.`
      : 'Nothing here should stop KDP accepting your interior.';
  const tally = ['fail', 'warn', 'info'].map((sev) =>
    `<li class="tally__item" data-sev="${sev}" data-zero="${counts[sev] === 0}"><strong>${counts[sev]}</strong> ${SEVERITY[sev].toLowerCase()}</li>`).join('');
  return `
    <section class="verdict" data-state="${n ? 'fail' : 'pass'}" aria-labelledby="verdict-title">
      <h2 id="verdict-title" tabindex="-1">${title}</h2>
      <p class="verdict__lead">${lead}</p>
      <ul class="tally" aria-label="Problems by type">${tally}</ul>
      ${n && others ? `<label class="filter-toggle"><input type="checkbox" id="only-fails"> Only show must-fix problems</label>` : ''}
    </section>`;
}

function fixHtml(g, id, carded) {
  const where = g.pages.length === 0 ? 'Whole book'
    : g.pages.length === 1 ? `Page ${g.pages[0]}`
    : `Pages ${formatPageList(g.pages)} (${g.pages.length} pages)`;
  const jumpTo = g.worstPage ?? g.pages.find((p) => carded.has(p));
  const jump = jumpTo != null && carded.has(jumpTo)
    ? `<a href="#page-${jumpTo}" data-page="${jumpTo}">See it on page ${jumpTo}</a>` : '';
  const accuracy = g.accuracy === 'best-effort'
    ? '<span class="fix__note">Best-effort check: it can occasionally be wrong.</span>' : '';
  return `
    <li class="fix" id="${id}" data-sev="${g.severity}">
      <p class="fix__head"><span class="tag" data-sev="${g.severity}">${SEVERITY[g.severity]}</span> <span class="fix__where">${where}</span></p>
      <p class="fix__what">${esc(g.message)}</p>
      <p class="fix__how"><strong>${g.severity === 'info' ? 'What to do:' : 'How to fix:'}</strong> ${esc(g.fix)}</p>
      <p class="fix__links">${jump}<a href="${esc(g.source)}" target="_blank" rel="noopener">${esc(g.sourceLabel ?? 'Why KDP asks for this')}</a>${accuracy}</p>
    </li>`;
}

function sheetHtml(page, issues, thumb, groupId) {
  const order = { fail: 0, warn: 1, info: 2 };
  const sorted = [...issues].sort((a, b) => order[a.severity] - order[b.severity]);
  let mark = 0;
  const marked = sorted.map((i) => ({ issue: i, n: i.bbox ? ++mark : null }));
  const side = page.side === 'right' ? 'right-hand page' : 'left-hand page';
  const hasFail = issues.some((i) => i.severity === 'fail');
  const items = marked.map(({ issue, n }) => `
    <li data-sev="${issue.severity}">
      ${n ? `<span class="pin" data-sev="${issue.severity}" aria-label="Mark ${n}">${n}</span>` : '<span class="pin pin--none" aria-hidden="true"></span>'}
      <p><span class="tag" data-sev="${issue.severity}">${SEVERITY[issue.severity]}</span> ${esc(shortMessage(issue))}
      <a href="#${groupId.get(issueGroupKey(issue))}">${issue.severity === 'info' ? 'Details' : 'How to fix'}</a></p>
    </li>`).join('');
  return `
    <li class="sheet" id="page-${page.number}" data-has-fail="${hasFail}">
      ${proofHtml(page, marked, thumb)}
      <div class="sheet__body">
        <h3>Page ${page.number} <span>${side}</span></h3>
        <ul class="sheet__issues">${items}</ul>
      </div>
    </li>`;
}

/** Thumbnail with the safe area, the zones to keep clear, and a numbered circle per located problem. */
function proofHtml(page, marked, thumb) {
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
  // Marks are drawn in page inches but must stay readable when a 9" page is ~200 px tall,
  // so size them relative to the page: k = 1 for a 9" tall page.
  const k = Math.max(w, h) / 9;
  const pad = 0.08 * k;
  const radius = 0.38 * k;
  const marks = marked.filter((m) => m.n).map(({ issue, n }) => {
    const b = issue.bbox;
    const x = Math.max(0, b.x - pad);
    const y = Math.max(0, b.y - pad);
    const cx = Math.max(radius, Math.min(w - radius, x));
    const cy = Math.max(radius, Math.min(h - radius, y));
    return `<g class="mark" data-sev="${issue.severity}">
      <rect x="${r(x)}" y="${r(y)}" width="${r(Math.min(w - x, b.width + 2 * pad))}" height="${r(Math.min(h - y, b.height + 2 * pad))}" rx="${r(0.1 * k)}" stroke-width="${r(0.07 * k)}"/>
      <circle cx="${r(cx)}" cy="${r(cy)}" r="${r(radius)}"/><text x="${r(cx)}" y="${r(cy)}" font-size="${r(0.5 * k)}">${n}</text></g>`;
  }).join('');
  return `
    <figure class="proof">
      ${thumb ? `<img src="${thumb}" alt="" loading="lazy" decoding="async">` : ''}
      <svg viewBox="0 0 ${r(w)} ${r(h)}" aria-hidden="true"><!-- in flow: its viewBox sets the page shape -->
        ${zones}${marks}
      </svg>
      <figcaption class="visually-hidden">Preview of page ${page.number} with problem areas circled.</figcaption>
    </figure>`;
}

/** On a page card the fix is one tap away, so show just the first sentence of the message. */
function shortMessage(issue) {
  const m = issue.message.match(/^.+?[.!?](?=\s|$)/);
  return m ? m[0] : issue.message;
}

function aboutHtml({ specs, summary, file, settings }) {
  const ink = specs.pageCount.inkPaperTypes[settings.inkPaper] ?? settings.inkPaper;
  const [tw, th] = settings.trim.split('x');
  const range = summary.allowedRange ? `${summary.allowedRange[0]} to ${summary.allowedRange[1]} pages` : 'not available for this trim';
  const rows = summary.sizeGroups.map((g) =>
    `<tr><td>${g.widthIn}" x ${g.heightIn}"</td><td>${formatPageList(g.pages)}</td></tr>`).join('');
  return `
    <section class="block about" aria-labelledby="about-title">
      <h2 id="about-title">About this check</h2>
      <dl class="facts">
        <dt>File</dt><dd>${esc(file.name)}, ${summary.pageCount} pages, ${(file.size / 1e6).toFixed(1)} MB</dd>
        <dt>Checked as</dt><dd>${tw}" x ${th}" trim, ${esc(ink.toLowerCase())}, ${settings.bleed ? 'with bleed' : 'no bleed'}</dd>
        <dt>Page size needed</dt><dd>${summary.expected.width}" x ${summary.expected.height}"</dd>
        <dt>Page count allowed</dt><dd>${range}</dd>
      </dl>
      <table class="sizes"><caption>Page sizes in your PDF</caption>
        <tr><th scope="col">Size</th><th scope="col">Pages</th></tr>${rows}</table>
      <p class="unsupported"><strong>Check these yourself:</strong> ${NOT_SUPPORTED.join(', ')}. KDP asks for files without them, but they can't be detected reliably.</p>
      <p class="privacy">Your PDF was checked on this device and never uploaded.</p>
      <button type="button" class="secondary" id="save-report">Save this report</button>
      <p class="hint">Saves a .json file you can keep or send to a designer or formatter.</p>
    </section>`;
}

function saveReport({ specs, summary, issues, file, settings }, counts) {
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
