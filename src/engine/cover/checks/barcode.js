// Barcode area (best-effort, info): KDP prints the ISBN barcode on the back cover, bottom right, on a white box
// at least 0.25" from the spine and the trim. We look at the rendered cover: is the suggested 2" x 1.2" box clear
// and white? If not, is at least the minimum 1.4" x 0.8" box clear? Pixels can't tell "your own barcode" from
// artwork, so this is advice only.
import { sourceUrl } from '../../specs.js';
import { hasInk } from '../../ink.js';

/**
 * @param {object} specs
 * @param {{ dpi:number, widthPx:number, heightPx:number, rgba:Uint8ClampedArray }} render
 * @param {ReturnType<import('../layout.js').coverLayout>} L
 * @returns {Array<object>} issues (at most one)
 */
export function checkBarcodeArea(specs, render, L) {
  const bc = specs.cover.barcode;
  const suggested = L.rects.barcode;
  // The minimum box shares the suggested box's bottom-right corner (clearance from spine and bottom trim).
  const min = {
    x: suggested.x + suggested.width - bc.minIn.width,
    y: suggested.y + suggested.height - bc.minIn.height,
    width: bc.minIn.width, height: bc.minIn.height,
  };
  const d = render.dpi;
  // Shrink by one pixel so anti-aliased art just outside the box doesn't count.
  const px = (r) => [r.x * d + 1, r.y * d + 1, (r.x + r.width) * d - 1, (r.y + r.height) * d - 1];
  const clear = (r) => !hasInk(render, specs.app.inkThreshold, px(r));
  if (clear(suggested)) return [];

  const size = (w, h) => `${w}" x ${h}"`;
  const where = `on the back cover, bottom right, ${bc.clearanceIn}" from the spine and the bottom trim`;
  const own = 'If you printed your own barcode there, you can ignore this.';
  const base = {
    checkId: 'coverBarcode', severity: 'info', page: 1, accuracy: 'best-effort',
    source: sourceUrl(specs, bc), required: `clear ${bc.background} box ${size(bc.suggestedIn.width, bc.suggestedIn.height)}`,
  };
  if (clear(min)) {
    return [{
      ...base, id: 'cover-barcode-small', bbox: suggested,
      measured: `only the minimum ${size(bc.minIn.width, bc.minIn.height)} is clear`,
      message: `KDP prints the barcode ${where}. The minimum ${size(bc.minIn.width, bc.minIn.height)} box there is clear and white, but the suggested ${size(bc.suggestedIn.width, bc.suggestedIn.height)} box has artwork or text in it. ${own}`,
      fix: `Keep a white ${size(bc.suggestedIn.width, bc.suggestedIn.height)} area clear there if you can (the template from the Cover calculator tab shows it). The minimum size usually works.`,
    }];
  }
  return [{
    ...base, id: 'cover-barcode-blocked', bbox: suggested,
    measured: 'artwork or a coloured background in the barcode area',
    message: `KDP prints the barcode ${where}, on a ${bc.background} box at least ${size(bc.minIn.width, bc.minIn.height)} (${size(bc.suggestedIn.width, bc.suggestedIn.height)} suggested). That area of your cover isn't clear and white, so the barcode box will cover part of your design. ${own}`,
    fix: `Move text and important artwork out of that corner and give it a white background, at least ${size(bc.minIn.width, bc.minIn.height)}. Use the template from the Cover calculator tab to see the exact box.`,
  }];
}
