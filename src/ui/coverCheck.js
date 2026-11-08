// Cover check tab: the form, the worker run and the cover report.
// The report reuses the interior report's pieces (verdict card, grouped rows, proof previews).
import { listTrims, listInkPaper, sourceUrl } from '../engine/specs.js';
import { groupIssues } from '../engine/runChecks.js';
import { inches3 } from '../engine/format.js';
import { esc, verdictHtml, groupHtml } from './report.js';
import { initFilePicker } from './filePicker.js';
import { coverOverlaySvg, guidesFit } from './coverOverlay.js';

const $ = (id) => document.getElementById(id);
const MB = 1e6;
// Cover rules not checked (or only partly checked). Listed so authors know to check them against the template.
const NOT_CHECKED_YET = [
  'Text converted to outlines or drawn into images: only live text is checked against the safe area, fold lines and 7 pt minimum',
  'Barcode area: we check that it looks clear and white, but cannot tell your own barcode from artwork',
];

let worker;
let thumbs = new Map();

export function initCoverCheck(specs) {
  $('cover-trim').innerHTML = listTrims(specs)
    .map((t) => `<option value="${t.key}" ${t.key === '6x9' ? 'selected' : ''}>${t.label}</option>`).join('');
  $('cover-ink').innerHTML = listInkPaper(specs)
    .map((o) => `<option value="${o.key}">${o.label}</option>`).join('');
  $('cover-tolerance').value = specs.app.sizeToleranceIn;
  initFilePicker({ input: $('cover-file'), zone: $('cover-drop'), status: $('cover-file-status') });
  $('cover-form').addEventListener('submit', (e) => {
    e.preventDefault();
    run(specs, e.submitter ?? $('cover-form').querySelector('button[type=submit]'));
  });
}

async function run(specs, button) {
  const file = $('cover-file').files[0];
  const pages = Number($('cover-pages').value);
  if (!file || !Number.isInteger(pages) || pages < 1) return; // the browser's own validation explains
  const tol = parseFloat($('cover-tolerance').value);
  const settings = {
    trim: $('cover-trim').value,
    inkPaper: $('cover-ink').value,
    pages,
    toleranceIn: Number.isFinite(tol) && tol >= 0 ? tol : specs.app.sizeToleranceIn,
  };
  const root = $('cover-result');
  if (file.size / MB > specs.file.maxSizeMB) {
    message(root, `This file is ${(file.size / MB).toFixed(0)} MB. KDP's limit is ${specs.file.maxSizeMB} MB. Reduce the file size (for example, export images at 300 DPI) and check again.`);
    return;
  }

  button.disabled = true;
  root.innerHTML = `<div class="card working" role="status"><p class="working__label">Checking your cover…</p>
    <p class="hint">Everything happens on your device.</p></div>`;
  const bytes = new Uint8Array(await file.arrayBuffer());

  worker?.terminate(); // a new check cancels one still running
  for (const url of thumbs.values()) URL.revokeObjectURL(url);
  thumbs = new Map();
  worker = new Worker(new URL('../worker/preflight.worker.js', import.meta.url), { type: 'module' });
  const done = () => { button.disabled = false; };
  worker.onmessage = ({ data }) => {
    if (data.type === 'thumb') thumbs.set(data.page, URL.createObjectURL(data.blob));
    else if (data.type === 'result') { renderCoverReport(root, { specs, ...data, file, settings }); done(); }
    else if (data.type === 'error') { message(root, data.message); done(); }
  };
  worker.onerror = (err) => {
    console.error(err);
    message(root, 'Something went wrong while checking this file. Try again, or export the PDF again from your design app.');
    done();
  };
  worker.postMessage({ mode: 'cover', bytes, settings }, [bytes.buffer]);
}

function message(root, text) {
  root.innerHTML = `<div class="card notice" role="alert"><svg class="icon" aria-hidden="true"><use href="#i-fail"/></svg><p>${esc(text)}</p></div>`;
}

function renderCoverReport(root, data) {
  const { specs, issues, pages } = data;
  const groups = groupIssues(issues);
  const counts = Object.fromEntries(['fail', 'warn', 'info'].map((sev) => [sev, groups.filter((g) => g.severity === sev).length]));
  const fit = guidesFit(issues);
  const overlay = (list) => coverOverlaySvg(data.layout, pages[0], list, { guides: fit });
  const pageInfo = new Map(pages.map((p) => [p.number, { ...p, caption: 'Your cover', overlay, legend: fit ? legendHtml(specs) : '' }]));
  const ctx = { issues, pageInfo, thumbs, specs, prefix: 'cover-', onePageLabel: 'Cover' };

  root.innerHTML = `
    <div class="report">
      ${verdictHtml(counts, 'cover', 'cover-')}
      ${overviewHtml(pages[0], thumbs.get(1), overlay(issues), fit, specs)}
      ${['fail', 'warn', 'info'].map((sev) => groupHtml(sev, groups.filter((g) => g.severity === sev), ctx)).join('')}
      ${detailsHtml(data)}
    </div>`;

  const report = root.querySelector('.report');
  report.querySelector('[data-action="save-report"]').addEventListener('click', () => saveReport(data, counts));
  report.addEventListener('click', (e) => {
    if (e.target.closest('a[data-group="info"]')) report.querySelector('details.group[data-sev="info"]').open = true;
  });
  const toggle = report.querySelector('#cover-guides');
  toggle?.addEventListener('change', () => report.querySelector('.cover-view').classList.toggle('cover-view--plain', !toggle.checked));
  report.querySelector('.verdict__title').focus({ preventScroll: true });
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  report.querySelector('.verdict').scrollIntoView({ behavior: reduce ? 'instant' : 'smooth', block: 'start' });
}

const legendHtml = (specs) => `
  <p class="proofs__legend cover-legend">
    <span class="legend-item"><span class="key key--zone"></span> Bleed, cut off (${specs.cover.size.bleedIn}")</span>
    <span class="legend-item"><span class="key key--fold"></span> Where the spine may fold (&plusmn;${specs.cover.fold.varianceIn}")</span>
    <span class="legend-item"><span class="key key--safe"></span> Safe area for text</span>
    <span class="legend-item"><span class="key key--barcode"></span> Barcode box, keep empty</span>
    <span class="legend-item"><span class="key key--mark"></span> A problem we found</span>
  </p>`;

/** The whole cover with KDP's guides on top, so authors see where each zone falls on their own artwork. */
function overviewHtml(page, thumb, svg, fit, specs) {
  const r = (n) => Math.round(n * 1000) / 1000;
  return `
    <section class="card cover-overview" aria-labelledby="cover-overview-title">
      <div class="cover-overview__head">
        <h2 id="cover-overview-title" class="card__title">Your cover with KDP's guides</h2>
        ${fit ? `<label class="switch"><input type="checkbox" id="cover-guides" checked> Show guides</label>` : ''}
      </div>
      <figure class="cover-view">
        <div class="proof__page">
          ${thumb ? `<img src="${thumb}" alt="Preview of your cover">` : ''}
          <svg viewBox="0 0 ${r(page.widthIn)} ${r(page.heightIn)}" aria-hidden="true">${svg}</svg>
        </div>
        <figcaption class="hint">Back cover on the left, spine in the middle, front cover on the right.</figcaption>
      </figure>
      ${fit ? legendHtml(specs)
        : '<p class="hint">Guides are hidden because your cover is not the size KDP expects. Fix the size first (see Must fix), then check again.</p>'}
    </section>`;
}

function detailsHtml({ specs, summary, pages, layout: L, file, settings }) {
  const ink = (specs.pageCount.inkPaperTypes[settings.inkPaper] ?? settings.inkPaper).toLowerCase();
  const p = pages[0];
  return `
    <details class="card check-details">
      <summary>
        <span><span class="check-details__title">Check details</span>
        <span class="check-details__sub">File info, sizes and what to check yourself</span></span>
        <svg class="chevron" aria-hidden="true"><use href="#i-chevron"/></svg>
      </summary>
      <div class="check-details__body">
        <dl class="facts">
          <dt>File</dt><dd>${esc(file.name)}</dd>
          <dt>Pages in the PDF</dt><dd>${summary.pageCount}, ${(file.size / 1e6).toFixed(1)} MB</dd>
          <dt>Checked as</dt><dd>${settings.trim.replace('x', '" x ')}" trim, ${settings.pages} pages, ${esc(ink)}</dd>
          <dt>Spine width</dt><dd>${inches3(L.spineIn)}</dd>
          <dt>Cover size needed</dt><dd>${inches3(L.widthIn)} x ${inches3(L.heightIn)}</dd>
          <dt>Your cover</dt><dd>${inches3(p.widthIn)} x ${inches3(p.heightIn)}</dd>
        </dl>
        <h3>Not fully checked</h3>
        <p>Compare these with the template from the Cover calculator tab:</p>
        <ul class="selfcheck">${NOT_CHECKED_YET.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
        <p><a href="${esc(sourceUrl(specs, specs.cover.size))}" target="_blank" rel="noopener">KDP's paperback cover guidelines</a></p>
      </div>
    </details>`;
}

function saveReport({ specs, summary, issues, layout: L, file, settings }, counts) {
  const report = {
    tool: 'KDP Book Studio cover check',
    generatedAt: new Date().toISOString(),
    kdpSpecsLastVerified: specs.cover.size.lastVerified,
    file: { name: file.name, sizeBytes: file.size, pageCount: summary.pageCount },
    settings,
    verdict: counts.fail ? 'fix-before-upload' : 'ready-for-kdp',
    counts: { mustFix: counts.fail, worthChecking: counts.warn, goodToKnow: counts.info },
    expectedCoverSizeIn: { width: L.widthIn, height: L.heightIn, spine: L.spineIn },
    issues,
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${file.name.replace(/\.pdf$/i, '')}-kdp-cover-check.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
