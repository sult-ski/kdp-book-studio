// Page geometry shared by the margin check and the report thumbnails, so they can never disagree.
// Inches, top-left origin, on the upright page. Odd pages bind on the LEFT, even pages on the RIGHT;
// with bleed, the extra paper is at the top, bottom and outside edges only.
import { gutterFor, outsideMarginFor } from './specs.js';

/**
 * The four edges to keep clear, each with how far in from the page edge the trim line is (offset)
 * and the minimum margin from the trim line (required).
 * @returns {Array<{ edge:'top'|'bottom'|'outside'|'inside', physical:'top'|'bottom'|'left'|'right',
 *   offset:number, required:number }>}
 */
export function marginEdges(specs, page, settings, printedPageCount) {
  const ext = settings.bleed ? specs.bleed.extendBeyondTrim : 0;
  const bindsLeft = page.side === 'right'; // recto pages bind on the left
  const outsideMin = outsideMarginFor(specs, settings.bleed);
  // Below KDP's minimum page count (already a fail), still apply the smallest gutter band.
  const firstBand = specs.margins.gutterByPageCount[0];
  const gutter = gutterFor(specs, printedPageCount) ?? (printedPageCount < firstBand.min ? firstBand.inside : null);

  const edges = [
    { edge: 'top', physical: 'top', offset: ext, required: outsideMin },
    { edge: 'bottom', physical: 'bottom', offset: ext, required: outsideMin },
    { edge: 'outside', physical: bindsLeft ? 'right' : 'left', offset: ext, required: outsideMin },
  ];
  if (gutter != null) edges.push({ edge: 'inside', physical: bindsLeft ? 'left' : 'right', offset: 0, required: gutter });
  return edges;
}

/**
 * Trim area (what remains after cutting) and safe area (inside all minimum margins).
 * @returns {{ trim:Rect, safe:Rect }} Rect = { x, y, width, height }
 */
export function pageLayout(specs, page, settings, printedPageCount) {
  const inset = { top: 0, bottom: 0, left: 0, right: 0 };   // page edge -> trim line
  const margin = { top: 0, bottom: 0, left: 0, right: 0 };  // page edge -> safe line
  for (const e of marginEdges(specs, page, settings, printedPageCount)) {
    inset[e.physical] = e.offset;
    margin[e.physical] = e.offset + e.required;
  }
  const rect = (m) => ({ x: m.left, y: m.top, width: page.widthIn - m.left - m.right, height: page.heightIn - m.top - m.bottom });
  return { trim: rect(inset), safe: rect(margin) };
}
