// Cover calculator: spine width and full cover size, a to-scale diagram, and a PDF template download.
// Updates as you type. All numbers come from the engine (specs.js / cover/layout.js), never from here.
import { listTrims, listInkPaper, sourceUrl } from '../engine/specs.js';
import { coverLayout } from '../engine/cover/layout.js';
import { inches3 } from '../engine/format.js';
import { esc } from './report.js';

const $ = (id) => document.getElementById(id);
const inch = inches3;
const mm = (n) => `${(n * 25.4).toFixed(1)} mm`;

export function initCalculator(specs) {
  $('calc-trim').innerHTML = listTrims(specs)
    .map((t) => `<option value="${t.key}" ${t.key === '6x9' ? 'selected' : ''}>${t.label}</option>`).join('');
  $('calc-ink').innerHTML = listInkPaper(specs)
    .map((o) => `<option value="${o.key}">${o.label}</option>`).join('');
  const form = $('calc');
  form.addEventListener('submit', (e) => e.preventDefault());
  form.addEventListener('input', () => update(specs));
  form.addEventListener('change', () => update(specs));
  $('calc-result').addEventListener('click', (e) => {
    if (e.target.closest('#calc-download')) download(specs, e.target.closest('#calc-download'));
  });
  update(specs);
}

function readSettings() {
  const pages = Number($('calc-pages').value);
  return { trim: $('calc-trim').value, inkPaper: $('calc-ink').value, pages };
}

function update(specs) {
  const settings = readSettings();
  const root = $('calc-result');
  if (!Number.isInteger(settings.pages) || settings.pages < 1) {
    root.innerHTML = `<div class="card notice">${icon('info')}<p>Enter your page count as a whole number, for example 212.</p></div>`;
    $('calc-status').textContent = '';
    return;
  }
  const L = coverLayout(specs, settings);
  const trimLabel = settings.trim.replace('x', '" x ') + '"';
  const ink = (specs.pageCount.inkPaperTypes[settings.inkPaper] ?? '').toLowerCase();

  const notes = [];
  if (!L.pageRange) {
    notes.push(['fail', `KDP doesn't print ${trimLabel} books in ${ink}. Choose another trim size or ink and paper.`]);
  } else if (!L.inRange) {
    notes.push(['fail', `KDP prints ${trimLabel} books in ${ink} with ${L.pageRange[0]} to ${L.pageRange[1]} pages. Your interior needs to be in that range.`]);
  }
  if (settings.pages % 2 === 1) {
    notes.push(['info', `An odd page count is fine: KDP adds a blank page at the end of the interior when printing. The spine is still worked out from ${settings.pages} pages, as KDP's own cover calculator does.`]);
  }
  if (L.spineText.note) notes.push(['info', L.spineText.note]);

  root.innerHTML = `
    <div class="card calc">
      <dl class="figures">
        <div class="figure"><dt>Spine width</dt><dd><strong>${inch(L.spineIn)}</strong><span>${mm(L.spineIn)}</span></dd></div>
        <div class="figure"><dt>Full cover size</dt><dd><strong>${inch(L.widthIn)} x ${inch(L.heightIn)}</strong><span>${mm(L.widthIn)} x ${mm(L.heightIn)}</span></dd></div>
        <div class="figure"><dt>Spine text</dt><dd><strong>${L.spineText.allowed ? 'Allowed' : 'Not allowed'}</strong><span>${L.spineText.allowed
          ? `Keep it ${specs.cover.spineText.clearanceIn}" clear of each fold`
          : `KDP needs ${L.spineText.minPages} pages or more`}</span></dd></div>
      </dl>
      ${notes.map(([sev, text]) => `<p class="calc__note" data-sev="${sev}">${icon(sev)}<span>${esc(text)}</span></p>`).join('')}
      <figure class="diagram">
        ${diagramSvg(L, specs)}
        <figcaption>
          <span class="legend-item"><span class="key key--bleed"></span> Bleed, cut off (${specs.cover.size.bleedIn}")</span>
          <span class="legend-item"><span class="key key--fold"></span> Where the spine may fold (&plusmn;${specs.cover.fold.varianceIn}")</span>
          <span class="legend-item"><span class="key key--safe"></span> Safe area for text (${specs.cover.safeArea.textMarginIn}" inside the trim)</span>
          <span class="legend-item"><span class="key key--barcode"></span> Barcode box, keep empty</span>
        </figcaption>
      </figure>
      <div class="calc__actions">
        <button type="button" class="btn btn--primary" id="calc-download">Download PDF template</button>
        <p class="hint">A one-page PDF at exactly ${inch(L.widthIn)} x ${inch(L.heightIn)} with these guides. Put your artwork on top, then delete the guides before you upload.</p>
      </div>
      <p class="calc__sources">Rules from KDP:
        <a href="${esc(sourceUrl(specs, specs.cover.size))}" target="_blank" rel="noopener">cover size and spine</a>,
        <a href="${esc(sourceUrl(specs, specs.cover.barcode))}" target="_blank" rel="noopener">barcode</a>.</p>
    </div>`;
  $('calc-status').textContent = `Spine ${inch(L.spineIn)}. Full cover ${inch(L.widthIn)} by ${inch(L.heightIn)}.`;
}

/** The cover drawn to scale in inches: bleed, trim, fold bands, safe areas, barcode box and labels. */
function diagramSvg(L, specs) {
  const { back, spine, front, backSafe, frontSafe, spineSafe, barcode } = L.rects;
  const r = (n) => Math.round(n * 1000) / 1000;
  const rect = (q, cls) => `<rect class="${cls}" x="${r(q.x)}" y="${r(q.y)}" width="${r(q.width)}" height="${r(q.height)}"/>`;
  const W = L.widthIn;
  const H = L.heightIn;
  const b = L.bleedIn;
  const k = H / 9; // label size relative to a 9" tall cover
  const label = (str, x, y, cls = 'd-label') => `<text class="${cls}" x="${r(x)}" y="${r(y)}" font-size="${r(0.32 * k)}">${str}</text>`;
  const spineLabel = spine.width >= 0.18
    ? `<text class="d-label d-label--spine" transform="translate(${r(spine.x + spine.width / 2)} ${r(H / 2)}) rotate(90)" font-size="${r(Math.min(0.32 * k, spine.width * 0.6))}">Spine</text>` : '';
  return `
    <svg viewBox="0 0 ${r(W)} ${r(H)}" role="img" aria-label="Cover layout: back cover on the left, spine ${inch(L.spineIn)} wide in the middle, front cover on the right.">
      <rect class="d-bleed" width="${r(W)}" height="${r(H)}"/>
      <rect class="d-paper" x="${r(b)}" y="${r(b)}" width="${r(W - 2 * b)}" height="${r(H - 2 * b)}"/>
      ${L.folds.map((f) => rect({ ...f.band, y: b, height: H - 2 * b }, 'd-fold')).join('')}
      ${rect(backSafe, 'd-safe')}${rect(frontSafe, 'd-safe')}
      ${L.spineText.allowed && spineSafe.width > 0 ? rect(spineSafe, 'd-safe') : ''}
      ${rect(barcode, 'd-barcode')}
      <rect class="d-trim" x="${r(b)}" y="${r(b)}" width="${r(W - 2 * b)}" height="${r(H - 2 * b)}"/>
      ${L.folds.map((f) => `<line class="d-trim" x1="${r(f.x)}" y1="${r(b)}" x2="${r(f.x)}" y2="${r(H - b)}"/>`).join('')}
      ${label('Back cover', back.x + back.width / 2, back.y + back.height / 2)}
      ${label('Front cover', front.x + front.width / 2, front.y + front.height / 2)}
      ${spineLabel}
      ${label('Barcode', barcode.x + barcode.width / 2, barcode.y + barcode.height / 2, 'd-label d-label--barcode')}
    </svg>`;
}

async function download(specs, button) {
  const settings = readSettings();
  button.disabled = true;
  try {
    // Loaded on demand: pdf-lib is only needed when someone downloads a template.
    const { makeCoverTemplate } = await import('../engine/cover/template.js');
    const bytes = await makeCoverTemplate(specs, settings);
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `kdp-cover-template-${settings.trim}-${settings.pages}p-${settings.inkPaper}.pdf`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } finally {
    button.disabled = false;
  }
}

const icon = (name) => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
