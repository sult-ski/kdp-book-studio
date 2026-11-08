// Minimum font size: KDP asks for at least 7 pt. Warning, best-effort: sizes come from pdf.js's text
// positions, and only text that actually shows up on the rendered page counts (so invisible OCR text
// layers in scanned books are ignored).
import { sourceUrl } from '../specs.js';
import { hasInk } from '../ink.js';

const ROUNDING_PT = 0.05; // 6.98 pt is 7 pt as far as anyone setting type is concerned

/**
 * @param {object} specs
 * @param {{ number:number }} page
 * @param {{ dpi:number, textItems:Array<{str:string, sizePt:number, rect:[number,number,number,number]}> }} render
 * @returns {Array<object>} issues (at most one per page)
 */
export function checkPageFontSize(specs, page, render) {
  const min = specs.fonts.minSizePt;
  const small = render.textItems.filter((t) =>
    t.sizePt > 0 && t.sizePt < min - ROUNDING_PT && hasInk(render, specs.app.inkThreshold, t.rect));
  if (!small.length) return [];

  const smallest = Math.min(...small.map((t) => t.sizePt));
  const sizeText = `${Number(smallest.toFixed(1))} pt`;
  const sample = small.find((t) => t.sizePt === smallest).str.trim();
  const quote = sample.length > 30 ? `${sample.slice(0, 30)}…` : sample;
  const xs = small.flatMap((t) => [t.rect[0], t.rect[2]]);
  const ys = small.flatMap((t) => [t.rect[1], t.rect[3]]);
  const d = render.dpi;

  return [{
    id: `fontSize-p${page.number}`,
    checkId: 'fontSize',
    groupKey: 'fontSize',
    severity: specs.fonts.smallTextSeverity,
    page: page.number,
    bbox: {
      x: Math.min(...xs) / d, y: Math.min(...ys) / d,
      width: (Math.max(...xs) - Math.min(...xs)) / d, height: (Math.max(...ys) - Math.min(...ys)) / d,
    },
    measured: sizeText,
    required: `${min} pt`,
    message: `Some text on this page is smaller than ${min} pt (smallest ${sizeText}, for example "${quote}"). KDP's minimum font size is ${min} pt; smaller text may not print clearly.`,
    fix: `Make it at least ${min} pt. In LibreOffice: select the text and change the size in the font size box; for footnotes, captions or page numbers, change the paragraph style instead (right-click → Paragraph → Edit Style → Font).`,
    accuracy: 'best-effort',
    source: sourceUrl(specs, specs.fonts),
    fixId: 'font-size',
  }];
}
