// Cover preflight: reads the cover PDF, renders its first page once, and runs the cover checks.
// No DOM: runs in the worker and in Node tests (pdf.js and its options are passed in).
import { loadPdf } from '../loadPdf.js';
import { openWithPdfjs, inspectPage } from '../render.js';
import { sortIssues } from '../runChecks.js';
import { coverLayout } from './layout.js';
import { checkCoverSize, checkCoverPages } from './checks/coverSize.js';
import { checkSpineText } from './checks/spineText.js';

/**
 * @param {object} specs
 * @param {Uint8Array} bytes
 * @param {{ trim:string, inkPaper:string, pages:number, toleranceIn?:number }} settings
 * @param {{ pdfjs:object, docOptions?:object, onPage?:Function }} env
 *   onPage({ page, render, issues }) is called with the rendered cover (the worker makes its thumbnail)
 */
export async function preflightCover(specs, bytes, settings, { pdfjs, docOptions = {}, onPage = null }) {
  const pdf = await loadPdf(bytes);
  if (pdf.error) return { error: pdf.error };
  const L = coverLayout(specs, settings);
  const first = pdf.pages[0];
  const issues = [...checkCoverPages(specs, pdf.pageCount), ...checkCoverSize(specs, first, L, settings)];

  const doc = await openWithPdfjs(pdfjs, bytes, docOptions);
  try {
    const { render } = await inspectPage(pdfjs, doc, 1, { dpi: specs.app.renderDpi, render: true });
    const textBoxes = render.textItems.map(({ str, rect: [x0, y0, x1, y1] }) => ({
      str, x: x0 / render.dpi, y: y0 / render.dpi, width: (x1 - x0) / render.dpi, height: (y1 - y0) / render.dpi,
    }));
    issues.push(...checkSpineText(specs, textBoxes, L, settings));
    if (onPage) await onPage({ page: first, render, issues });
  } finally {
    await doc.loadingTask.destroy();
  }

  return {
    issues: sortIssues(issues),
    layout: L,
    pages: [{ number: 1, side: 'right', widthIn: first.widthIn, heightIn: first.heightIn, layout: null }],
    summary: { pageCount: pdf.pageCount, sizeBytes: pdf.sizeBytes, expected: { width: L.widthIn, height: L.heightIn } },
  };
}
