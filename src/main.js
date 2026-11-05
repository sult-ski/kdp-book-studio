import specs from './config/kdp-specs.json';
import { listTrims, listInkPaper } from './engine/specs.js';
import { loadPdf } from './engine/loadPdf.js';
import { summarize, formatPageList } from './engine/summarize.js';
import { runChecks, groupIssues } from './engine/runChecks.js';

const $ = (id) => document.getElementById(id);
const MB = 1e6; // decimal MB, matching how the 650 MB limit is checked
const ICON = { fail: '❌', warn: '⚠️', info: 'ℹ️' };
// Checks not built yet. Shown so a clean result never implies more than we actually checked.
const NOT_CHECKED_YET = ['margins and gutter', 'image resolution', 'bleed artwork', 'blank pages', 'minimum font size'];
// KDP rules we can't check reliably. Listed so authors know to check these themselves.
const NOT_SUPPORTED = ['crop or trim marks drawn on the page', 'invisible objects', 'placeholder text', 'metadata'];

// Fill dropdowns from the config, never from hard-coded lists.
$('trim').innerHTML = listTrims(specs)
  .map((t) => `<option value="${t.key}" ${t.key === '6x9' ? 'selected' : ''}>${t.label}</option>`).join('');
$('inkPaper').innerHTML = listInkPaper(specs)
  .map((o) => `<option value="${o.key}">${o.label}</option>`).join('');
$('tolerance').value = specs.app.sizeToleranceIn;

$('settings').addEventListener('submit', async (e) => {
  e.preventDefault();
  const file = $('file').files[0];
  if (!file) return;
  const tol = parseFloat($('tolerance').value);
  const settings = {
    trim: $('trim').value,
    inkPaper: $('inkPaper').value,
    bleed: document.querySelector('input[name=bleed]:checked').value === 'yes',
    toleranceIn: Number.isFinite(tol) && tol >= 0 ? tol : specs.app.sizeToleranceIn,
  };

  // Too big to upload to KDP, and too big to load safely in a browser tab.
  if (file.size / MB > specs.file.maxSizeMB) {
    $('result').innerHTML = `<div class="card bad">❌ This file is ${(file.size / MB).toFixed(0)} MB. KDP's limit is ${specs.file.maxSizeMB} MB; larger files fail to upload. Reduce the file size (for example, export images at 300 DPI) and check again.</div>`;
    return;
  }

  const btn = e.submitter; btn.disabled = true;
  $('result').innerHTML = '<div class="card muted">Reading your PDF…</div>';
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const pdf = await loadPdf(bytes);
    if (pdf.error) { $('result').innerHTML = `<div class="card bad">${pdf.error}</div>`; return; }
    render(summarize(specs, pdf, settings), runChecks(specs, pdf, settings), file);
  } catch (err) {
    console.error(err);
    $('result').innerHTML = '<div class="card bad">Something went wrong while checking this file. Please try again, or try re-exporting the PDF.</div>';
  } finally { btn.disabled = false; }
});

function render(s, issues, file) {
  const exp = `${s.expected.width}" x ${s.expected.height}"`;
  const range = s.allowedRange ? `${s.allowedRange[0]}–${s.allowedRange[1]}` : 'not available for this trim';
  const rows = s.sizeGroups.map((g) =>
    `<tr><td>${g.widthIn}" x ${g.heightIn}"</td><td>${formatPageList(g.pages)}</td></tr>`).join('');
  const groups = groupIssues(issues);
  const fails = groups.filter((i) => i.severity === 'fail').length;
  const warns = groups.filter((i) => i.severity === 'warn').length;
  const verdict = fails
    ? `<div class="card verdict fail">❌ ${fails} problem${fails === 1 ? '' : 's'} KDP will reject${warns ? `, ${warns} warning${warns === 1 ? '' : 's'}` : ''}</div>`
    : `<div class="card verdict pass">✅ No problems found in the checks so far${warns ? ` (${warns} warning${warns === 1 ? '' : 's'})` : ''}</div>`;
  const list = issues.length
    ? `<ul class="issues">${groups.map(renderIssue).join('')}</ul>`
    : '<p class="ok">No problems found in these checks.</p>';

  $('result').innerHTML = `
    <div class="card">
      <strong>${escapeHtml(file.name)}</strong>
      <div class="muted">${(file.size / MB).toFixed(1)} MB · ${s.pageCount} pages${s.encrypted ? ' · <span class="bad">encrypted</span>' : ''}</div>
    </div>
    ${verdict}
    <div class="card">
      <strong>Results</strong>
      ${list}
    </div>
    <div class="card">
      <div>Expected page size: <strong>${exp}</strong></div>
      <div>Allowed page count: <strong>${range}</strong></div>
      <table><tr><th>Page size found</th><th>Pages</th></tr>${rows}</table>
    </div>
    <div class="card muted">
      <p><strong>Not checked yet:</strong> ${NOT_CHECKED_YET.join(', ')}. These are coming soon, so a pass here doesn't cover them.</p>
      <p><strong>Not supported:</strong> ${NOT_SUPPORTED.join(', ')}. KDP asks for files without these, but we can't detect them reliably, so please check them yourself.</p>
    </div>`;
}

function renderIssue(g) {
  const where = g.pages.length === 0 ? 'Whole book'
    : g.pages.length === 1 ? `Page ${g.pages[0]}`
    : `Pages ${formatPageList(g.pages)} (${g.pages.length} pages)`;
  const accuracy = g.accuracy === 'best-effort' ? ' · Best-effort check, may be wrong' : '';
  return `<li class="issue">
    <p><span class="where">${ICON[g.severity]} ${where}</span> — ${escapeHtml(g.message)}</p>
    <p><strong>Fix:</strong> ${escapeHtml(g.fix)}</p>
    <p class="meta"><a href="${g.source}" target="_blank" rel="noopener">Why? KDP's rule</a>${accuracy}</p>
  </li>`;
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
