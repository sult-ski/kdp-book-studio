// Margins: text and art must stay inside KDP's minimum margins.
// Top, bottom and outside use the bleed-dependent minimum; the inside (gutter) depends on page count.
// Mirrored per page: odd pages bind on the LEFT, even pages on the RIGHT.
// With bleed, distances are measured from the trim line (bleed is added at top, bottom and outside only).
import { expectedPageSize, gutterFor, outsideMarginFor, sourceUrl } from '../specs.js';
import { scanEdge } from '../ink.js';
import { artAtEdgeWithoutBleed, artShortOfBleedEdge } from './bleed.js';
import { inches } from '../format.js';

const EPS = 1e-6;

/**
 * @param {object} specs
 * @param {{ number:number, side:'left'|'right', widthIn:number, heightIn:number }} page
 * @param {object} render result of renderPage()
 * @param {{ settings:{trim:string, bleed:boolean, toleranceIn?:number}, printedPageCount:number }} ctx
 * @returns {Array<object>} issues
 */
export function checkPageMargins(specs, page, render, { settings, printedPageCount }) {
  if (!pageMatchesExpectedSize(specs, page, settings)) return []; // the page size check reports it

  const ext = settings.bleed ? specs.bleed.extendBeyondTrim : 0;
  const bindsLeft = page.side === 'right'; // recto pages bind on the left
  const outsideMin = outsideMarginFor(specs, settings.bleed);
  // Below KDP's minimum page count (already a fail), still apply the smallest gutter band.
  const firstBand = specs.margins.gutterByPageCount[0];
  const gutter = gutterFor(specs, printedPageCount) ?? (printedPageCount < firstBand.min ? firstBand.inside : null);
  const tolerance = 1 / render.dpi; // measurement resolution
  const source = sourceUrl(specs, specs.margins);

  const edges = [
    { edge: 'top', physical: 'top', offset: ext, required: outsideMin },
    { edge: 'bottom', physical: 'bottom', offset: ext, required: outsideMin },
    { edge: 'outside', physical: bindsLeft ? 'right' : 'left', offset: ext, required: outsideMin },
  ];
  if (gutter != null) edges.push({ edge: 'inside', physical: bindsLeft ? 'left' : 'right', offset: 0, required: gutter });

  const issues = [];
  for (const e of edges) {
    const hits = scanEdge(render, page, e.physical, e.offset + e.required, specs.app.inkThreshold);
    for (const kind of ['text', 'art']) {
      const hit = hits[kind];
      if (!hit) continue;
      const distance = hit.insetIn - e.offset; // from the trim line (or binding edge)
      if (distance >= e.required - tolerance - EPS) continue;
      if (kind === 'art') {
        const atEdge = hit.insetIn <= specs.app.edgeInkIn + EPS;
        // No bleed, but art touches the page edge: a bleed problem, reported instead of a margin warning.
        if (!settings.bleed && atEdge) {
          issues.push(artAtEdgeWithoutBleed(specs, { e, hit, page, bbox: bboxIn(hit, render), trimKey: settings.trim }));
          continue;
        }
        // With bleed, art that runs to the page edge is deliberate full-bleed art, which is allowed.
        // That includes art running into the binding edge (e.g. a full-page picture); text there still fails.
        if (settings.bleed && atEdge) continue;
        // With bleed, art that reaches the trim line but stops short of the page edge: bleed is too short.
        if (settings.bleed && e.edge !== 'inside' && hit.insetIn <= e.offset + specs.app.edgeInkIn + EPS) {
          issues.push(artShortOfBleedEdge(specs, { e, hit, page, bbox: bboxIn(hit, render) }));
          continue;
        }
      }
      issues.push(makeIssue({ e, kind, distance, hit, page, render, settings, printedPageCount, source }));
    }
  }
  return issues;
}

export function pageMatchesExpectedSize(specs, page, settings) {
  const exp = expectedPageSize(specs, settings.trim, settings.bleed);
  const tol = (settings.toleranceIn ?? specs.app.sizeToleranceIn) + EPS;
  return Math.abs(page.widthIn - exp.width) <= tol && Math.abs(page.heightIn - exp.height) <= tol;
}

// Zone names in messages, and the margin name used in fixes.
const ZONE = { top: 'top margin', bottom: 'bottom margin', outside: 'outside margin', inside: 'gutter zone (inside margin)' };
const MARGIN = { top: 'top', bottom: 'bottom', outside: 'outside', inside: 'inside' };
const LIBREOFFICE_MARGIN = {
  top: 'In LibreOffice: Format → Page Style → Page tab, raise "Top" (if a header sits in the margin, also check the Header tab).',
  bottom: 'In LibreOffice: Format → Page Style → Page tab, raise "Bottom" (if a footer or page number sits in the margin, also check the Footer tab).',
  outside: 'In LibreOffice: Format → Page Style → Page tab, set "Page layout" to Mirrored, then raise "Outer".',
  inside: 'In LibreOffice: Format → Page Style → Page tab, set "Page layout" to Mirrored, then raise "Inner".',
};

function makeIssue({ e, kind, distance: raw, hit, page, render, settings, printedPageCount, source }) {
  const distance = Math.round(raw * 100) / 100; // report at the measurement resolution (0.01" at 100 DPI)
  const req = inches(e.required);
  const from = e.edge === 'inside' ? 'the binding edge'
    : settings.bleed ? `the trim line (where the ${e.edge} of the page is cut)` : `the ${e.edge} edge of the page`;
  const where = distance < 0
    ? `it runs ${inches(-distance)} past the trim line, so it will be cut off`
    : `it sits ${inches(distance)} from ${e.edge === 'inside' ? 'the binding edge' : 'it'}`;
  const why = e.edge === 'inside'
    ? `Your book has ${printedPageCount} pages, so KDP requires a ${req} inside margin`
    : `KDP requires at least ${req} from ${from}${settings.bleed ? ' in books with bleed' : ''}`;
  const bbox = bboxIn(hit, render);
  const base = {
    id: `margins-${e.edge}-${kind}-p${page.number}`,
    checkId: 'margins',
    groupKey: `margins|${e.edge}|${kind}`,
    page: page.number,
    bbox,
    measured: inches(Math.max(distance, -99)),
    required: req,
    source,
    fixId: 'adjust-margins',
  };

  if (kind === 'text') {
    return {
      ...base,
      severity: 'fail',
      accuracy: 'verified',
      message: `Text inside the ${ZONE[e.edge]}. ${why}; this text ${where.replace(/^it /, '')}.`,
      fix: `Increase the ${MARGIN[e.edge]} margin to at least ${req} in your document and re-export the PDF. ${LIBREOFFICE_MARGIN[e.edge]}`,
    };
  }
  return {
    ...base,
    severity: 'warn',
    accuracy: 'best-effort',
    message: `An image, line or shape is inside the ${ZONE[e.edge]}. ${why}; ${where}.`,
    fix: e.edge === 'inside' || !settings.bleed
      ? `Move or shrink it so it stays at least ${req} from ${e.edge === 'inside' ? 'the binding edge' : 'the edge'}${e.edge !== 'inside' ? '. If it is meant to run off the page, choose "Bleed" and extend it past the page edge' : ''}.`
      : `Move or shrink it so it stays at least ${req} from the trim line, or, if it is meant to run off the page, extend it all the way to the page edge.`,
  };
}

/** Pixel bbox of a scan hit -> inches, top-left origin. */
function bboxIn(hit, render) {
  const [x0, y0, x1, y1] = hit.bboxPx;
  return { x: x0 / render.dpi, y: y0 / render.dpi, width: (x1 - x0) / render.dpi, height: (y1 - y0) / render.dpi };
}
