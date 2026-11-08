// The form, the worker and progress. The report itself lives in ui/report.js.
import '@fontsource-variable/inter/opsz.css';
import './ui/styles.css';
import specs from './config/kdp-specs.json';
import { listTrims, listInkPaper, latestVerified } from './engine/specs.js';
import { renderReport, esc } from './ui/report.js';
import { initTabs } from './ui/tabs.js';
import { initCalculator } from './ui/calculator.js';
import { initFilePicker } from './ui/filePicker.js';
import { initCoverCheck } from './ui/coverCheck.js';

const $ = (id) => document.getElementById(id);
const MB = 1e6; // decimal MB, matching how the 650 MB limit is checked
let worker; // the preflight Web Worker for the current check
let thumbs = new Map(); // page number -> object URL of its thumbnail

initTabs();
initCalculator(specs);
initCoverCheck(specs);

// Fill dropdowns from the config, never from hard-coded lists.
$('trim').innerHTML = listTrims(specs)
  .map((t) => `<option value="${t.key}" ${t.key === '6x9' ? 'selected' : ''}>${t.label}</option>`).join('');
$('inkPaper').innerHTML = listInkPaper(specs)
  .map((o) => `<option value="${o.key}">${o.label}</option>`).join('');
$('tolerance').value = specs.app.sizeToleranceIn;
// When the KDP rules in the config were last checked against Amazon's pages (the latest date of any rule),
// e.g. "on 6 November 2026".
$('specs-checked').textContent = `on ${new Date(`${latestVerified(specs)}T12:00:00`)
  .toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`;

initFilePicker({ input: $('file'), zone: $('drop'), status: $('file-status') });

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
    // Deep content check: preview-only switch (?deep=1) until the D4 toggle.
    deepContent: new URLSearchParams(location.search).has('deep'),
  };

  // Too big to upload to KDP, and too big to load safely in a browser tab.
  if (file.size / MB > specs.file.maxSizeMB) {
    showMessage(`This file is ${(file.size / MB).toFixed(0)} MB. KDP's limit is ${specs.file.maxSizeMB} MB, and larger files fail to upload. Reduce the file size (for example, export images at 300 DPI) and check again.`);
    return;
  }

  const btn = e.submitter ?? $('settings').querySelector('button[type=submit]');
  btn.disabled = true;
  showProgress(0, 0);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const done = () => { btn.disabled = false; };

  // A fresh worker per check; terminating the old one cancels any check still running.
  worker?.terminate();
  for (const url of thumbs.values()) URL.revokeObjectURL(url);
  thumbs = new Map();
  worker = new Worker(new URL('./worker/preflight.worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }) => {
    if (data.type === 'progress') showProgress(data.done, data.total);
    else if (data.type === 'thumb') thumbs.set(data.page, URL.createObjectURL(data.blob));
    else if (data.type === 'result') {
      renderReport($('result'), { specs, summary: data.summary, issues: data.issues, pages: data.pages, notChecked: data.notChecked ?? [], thumbs, file, settings });
      done();
    } else if (data.type === 'error') { showMessage(data.message); done(); }
  };
  worker.onerror = (err) => {
    console.error(err);
    showMessage('Something went wrong while checking this file. Try again, or export the PDF again from your writing app.');
    done();
  };
  // Transfer (not copy) the bytes: the page doesn't need them any more.
  worker.postMessage({ bytes, settings }, [bytes.buffer]);
});

function showMessage(text) {
  $('result').innerHTML = `
    <div class="card notice" role="alert">
      <svg class="icon" aria-hidden="true"><use href="#i-fail"/></svg>
      <p>${esc(text)}</p>
    </div>`;
}

function showProgress(doneCount, total) {
  const label = total ? `Checking page ${Math.min(doneCount + 1, total)} of ${total}…` : 'Opening your PDF…';
  const bar = $('progress');
  if (bar) {
    bar.value = doneCount;
    bar.max = total || 1;
    $('progress-label').textContent = label;
    return;
  }
  $('result').innerHTML = `
    <div class="card working" role="status">
      <label for="progress" id="progress-label">${label}</label>
      <progress id="progress" value="${doneCount}" max="${total || 1}"></progress>
      <p class="hint">Everything happens on your device. Long books take a little while.</p>
    </div>`;
  $('result').scrollIntoView({ block: 'nearest' });
}
