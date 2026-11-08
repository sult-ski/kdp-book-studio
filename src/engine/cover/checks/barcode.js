// Barcode area (best-effort, warn). KDP prints the ISBN barcode on a white box on the back cover, bottom right,
// at least 0.25" from the spine and the trim. A flat colour or smooth gradient there is fine: the white box simply
// covers it. We flag only text or distinct elements (edges, sharp contrast changes) inside the suggested 2" x 1.2" box.
// Pixels can't tell "your own barcode" from artwork, so this is advice only.
import { sourceUrl } from '../../specs.js';

/**
 * @param {object} specs
 * @param {{ dpi:number, widthPx:number, heightPx:number, rgba:Uint8ClampedArray,
 *   textItems?:Array<{ str:string, rect:[number,number,number,number] }> }} render
 * @param {ReturnType<import('../layout.js').coverLayout>} L
 * @returns {Array<object>} issues (at most one)
 */
export function checkBarcodeArea(specs, render, L) {
  const bc = specs.cover.barcode;
  const box = L.rects.barcode;
  const d = render.dpi;
  // Shrink by one pixel so anti-aliased art just outside the box doesn't count.
  const x0 = Math.max(0, Math.ceil(box.x * d) + 1);
  const y0 = Math.max(0, Math.ceil(box.y * d) + 1);
  const x1 = Math.min(render.widthPx - 1, Math.floor((box.x + box.width) * d) - 1);
  const y1 = Math.min(render.heightPx - 1, Math.floor((box.y + box.height) * d) - 1);

  const text = (render.textItems ?? []).filter(({ rect: [a, b, c, e] }) => c > x0 && a < x1 && e > y0 && b < y1);
  const edges = countEdges(render, [x0, y0, x1, y1], specs.app.barcodeEdgeContrast);
  const hasEdges = edges > specs.app.barcodeMinEdgeIn * d;
  if (!text.length && !hasEdges) return [];

  const size = (w, h) => `${w}" x ${h}"`;
  const found = text.length
    ? `text ("${text.map((t) => t.str.trim()).join(' ').slice(0, 40)}")`
    : 'shapes, lines or sharp colour changes';
  return [{
    id: 'cover-barcode-blocked', checkId: 'coverBarcode', severity: 'warn', page: 1, accuracy: 'best-effort',
    bbox: box,
    source: sourceUrl(specs, bc),
    required: `no text or artwork details in the ${size(bc.suggestedIn.width, bc.suggestedIn.height)} barcode box`,
    measured: found,
    message: `KDP prints the barcode on the back cover, bottom right, ${bc.clearanceIn}" from the spine and the bottom trim, on a ${bc.background} box at least ${size(bc.minIn.width, bc.minIn.height)} (${size(bc.suggestedIn.width, bc.suggestedIn.height)} suggested). We found ${found} there, which the barcode box will cover. A plain colour or gradient background is fine. If you printed your own barcode there, you can ignore this.`,
    fix: `Move text and artwork details out of that corner (a plain background can stay). Use the template from the Cover calculator tab to see the exact box.`,
  }];
}

/** Pixels whose colour jumps by more than `contrast` (any RGB channel) to the right or lower neighbour. */
function countEdges({ widthPx: W, rgba }, [x0, y0, x1, y1], contrast) {
  let n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * W + x) * 4;
      for (const j of [i + 4, i + W * 4]) {
        if (Math.abs(rgba[i] - rgba[j]) > contrast || Math.abs(rgba[i + 1] - rgba[j + 1]) > contrast
          || Math.abs(rgba[i + 2] - rgba[j + 2]) > contrast) { n++; break; }
      }
    }
  }
  return n;
}
