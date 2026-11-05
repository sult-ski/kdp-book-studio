import specs from './config/kdp-specs.json';
import { listTrims, listInkPaper } from './engine/specs.js';
import { formatPageList } from './engine/summarize.js';
import { groupIssues } from './engine/runChecks.js';

const $ = (id) => document.getElementById(id);
const MB = 1e6; // decimal MB, matching how the 650 MB limit is checked
const ICON = { fail: '❌', warn: '⚠️', info: 'ℹ️' };
let worker; // the preflight Web Worker for the current check
// Checks not built yet. Shown so a clean result never implies more than we actually checked.
const NOT_CHECKED_YET = ['bleed artwork', 'blank pages', 'minimum font size'];
// KDP rules we can't check reliably. Listed so authors know to check these themselves.
const NOT_SUPPORTED = ['crop or trim marks drawn on the page', 'resolution of images used as patterns or textures', 'invisible objects', 'placeholder text', 'metadata'];

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
  const bytes = new Uint8Array(await file.arrayBuffer());
  const done = () => { btn.disabled = false; };
  const showError = (message) => { $('result').innerHTML = `<div class="card bad">${escapeHtml(message)}</div>`; done(); };

  // A fresh worker per check; terminating the old one cancels any check still running.
  worker?.terminate();
  worker = new Worker(new URL('./worker/preflight.worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }) => {
    if (data.type === 'progress') showProgress(data.done, data.total);
    else if (data.type === 'result') { render(data.summary, data.issues, file); done(); }
    else if (data.type === 'error') showError(data.message);
  };
  worker.onerror = (err) => {
    console.error(err);
    showError('Something went wrong while checking this file. Please try again, or try re-exporting the PDF.');
  };
  // Transfer (not copy) the bytes: the page doesn't need them any more.
  worker.postMessage({ bytes, settings }, [bytes.buffer]);
});

function showProgress(doneCount, total) {
  const bar = document.getElementById('progress');
  const label = `Checking page ${Math.min(doneCount + 1, total)} of ${total}…`;
  if (bar) {
    bar.value = doneCount;
    bar.max = total;
    document.getElementById('progress-label').textContent = label;
    return;
  }
  $('result').innerHTML = `<div class="card">
    <label class="progress"><span id="progress-label">${label}</span>
      <progress id="progress" value="${doneCount}" max="${total}"></progress>
    </label>
    <p class="hint">Everything runs on your device. Big books take a little while.</p>
  </div>`;
}

function render(s, issues, file) {
  const exp = `${s.expected.width}" x ${s.expected.height}"`;
  const range = s.allowedRange ? `${s.allowedRange[0]}–${s.allowedRange[1]}` : 'not available for this trim';
  const rows = s.sizeGroups.map((g) =>
    `<tr><td>${g.widthIn}" x ${g.heightIn}"</td><td>${formatPageList(g.pages)}</td></tr>`).join('');
  const groups = groupIssues(issues);
  // The verdict counts fails only: things KDP actually blocks. Warnings and notes are listed below it.
  const count = (sev) => groups.filter((i) => i.severity === sev).length;
  const fails = count('fail');
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const extras = [count('warn') && plural(count('warn'), 'warning'), count('info') && plural(count('info'), 'note')]
    .filter(Boolean).join(' and ');
  const verdict = fails
    ? `<div class="card verdict fail">❌ ${plural(fails, 'problem')} KDP will reject${extras ? `<span class="sub">Also ${extras} below.</span>` : ''}</div>`
    : `<div class="card verdict pass">✅ Ready for KDP${extras ? `<span class="sub">${extras} below: worth a look, but KDP doesn't usually block these.</span>` : ''}</div>`;
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
    : `Pages ${formatPageList(g.pages)} (${g.pages.length} pages${g.worstPage != null ? `, worst on page ${g.worstPage}` : ''})`;
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
