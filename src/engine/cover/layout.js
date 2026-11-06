// Cover geometry: where the back cover, spine, front cover, safe areas, fold lines and barcode box sit.
// All rects are in inches with a top-left origin, on the full cover (bleed included), like engine/layout.js.
// Used by the calculator (diagram and template) and later by the cover checks.
import { coverSize, pageCountRange } from '../specs.js';

/**
 * @param {object} specs
 * @param {{ trim:string, inkPaper:string, pages:number }} settings
 */
export function coverLayout(specs, { trim, inkPaper, pages }) {
  const c = specs.cover;
  const size = coverSize(specs, trim, inkPaper, pages);
  const { bleedIn: bleed, trimWidthIn: tw, trimHeightIn: th, spineIn: spine } = size;
  const safe = c.safeArea.textMarginIn;
  const clear = c.spineText.clearanceIn;
  const v = c.fold.varianceIn;
  const rect = (x, y, width, height) => ({ x, y, width, height });

  const back = rect(bleed, bleed, tw, th);
  const spineRect = rect(bleed + tw, bleed, spine, th);
  const front = rect(bleed + tw + spine, bleed, tw, th);
  const inset = (r, d) => rect(r.x + d, r.y + d, r.width - 2 * d, r.height - 2 * d);

  // Barcode: back cover, bottom right, clear of the spine and the bottom trim.
  const bc = c.barcode;
  const barcode = rect(
    spineRect.x - bc.clearanceIn - bc.suggestedIn.width,
    back.y + th - bc.clearanceIn - bc.suggestedIn.height,
    bc.suggestedIn.width, bc.suggestedIn.height);

  const folds = [spineRect.x, spineRect.x + spine].map((x) => ({ x, band: rect(x - v, 0, 2 * v, size.heightIn) }));

  const range = pageCountRange(specs, trim, inkPaper);
  const allowed = pages >= c.spineText.minPages;
  const note = allowed && pages < c.spineText.coverCreatorMinPages
    ? `KDP allows spine text from ${c.spineText.minPages} pages, but its Cover Creator tool only adds it from ${c.spineText.coverCreatorMinPages}.`
    : null;

  return {
    ...size,
    pages,
    pageRange: range,
    inRange: Boolean(range) && pages >= range[0] && pages <= range[1],
    spineText: { allowed, note, minPages: c.spineText.minPages },
    rects: {
      full: rect(0, 0, size.widthIn, size.heightIn),
      back, spine: spineRect, front,
      backSafe: inset(back, safe),
      frontSafe: inset(front, safe),
      spineSafe: rect(spineRect.x + clear, spineRect.y + safe, Math.max(0, spine - 2 * clear), th - 2 * safe),
      barcode,
    },
    folds,
  };
}
