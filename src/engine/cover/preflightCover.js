// Cover preflight: reads the cover PDF, renders its first page once, and runs the cover checks.
// No DOM: runs in the worker and in Node tests (pdf.js and its options are passed in).
import { loadPdf } from '../loadPdf.js';
import { openWithPdfjs, inspectPage } from '../render.js';
import { sortIssues } from '../runChecks.js';
import { coverLayout } from './layout.js';
import { checkCoverSize, checkCoverPages } from './checks/coverSize.js';
import { checkSpineText } from './checks/spineText.js';
import { checkCoverZones } from './checks/zones.js';
import { checkBarcodeArea } from './checks/barcode.js';
import { checkFonts } from '../checks/fonts.js';
import { checkPageImages } from '../checks/imageDpi.js';
import { checkPageFontSize } from '../checks/fontSize.js';

// Cover-specific fix wording: covers are usually made in Canva, Photoshop or Affinity, not a word processor.
const CANVA_EXPORT = 'download with Share → Download → "PDF Print" and tick "Flatten PDF"';
const PRO_EXPORT = 'In Photoshop or Affinity: export as PDF/X-1a with all fonts embedded and images at 300 DPI.';
const COVER_FIX = {
  images: (fix) => fix.replace(/ If the original picture[\s\S]*$/, '') +
    ` In Canva: upload images that are at least 300 DPI at their printed size, use them at full resolution without stretching them bigger, then ${CANVA_EXPORT}. ${PRO_EXPORT}`,
  fontSize: () => `Make it at least 7 pt. In Canva: select the text, raise the size in the toolbar, then ${CANVA_EXPORT}. ${PRO_EXPORT}`,
  'fonts-unreadable': () => `Export the cover again. In Canva: ${CANVA_EXPORT}. ${PRO_EXPORT}`,
  'fonts-subset': () => 'Nothing to do: subset fonts are fine on a cover.',
  fonts: () => `In Canva: ${CANVA_EXPORT} (flattening turns text into shapes, so no font can go missing). ${PRO_EXPORT} If a font still will not embed, its licence forbids it: switch to a different font.`,
};
const withCoverFix = (issues) => issues.map((i) => {
  const f = COVER_FIX[i.id] ?? COVER_FIX[i.checkId];
  return f ? { ...i, fix: f(i.fix) } : i;
});

/** The interior checks read specs.fonts / specs.images; on a cover they use the cover's values and sources. */
const forCover = (specs) => ({
  ...specs,
  fonts: { ...specs.fonts, ...specs.cover.fonts },
  images: { ...specs.images, ...specs.cover.images },
});

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
  const cs = forCover(specs);
  // Fonts: only those used on the cover page (page 1); extra pages are already a Must fix.
  const coverFonts = pdf.fonts && pdf.fonts.map((f) => ({ ...f, pages: f.pages.filter((n) => n === 1) })).filter((f) => f.pages.length);
  const issues = [
    ...checkCoverPages(specs, pdf.pageCount),
    ...checkCoverSize(specs, first, L, settings),
    ...withCoverFix(checkFonts(cs, { ...pdf, fonts: coverFonts })),
  ];

  const doc = await openWithPdfjs(pdfjs, bytes, docOptions);
  try {
    const { images, render } = await inspectPage(pdfjs, doc, 1, { dpi: specs.app.renderDpi, render: true });
    issues.push(...withCoverFix([...checkPageImages(cs, first, images), ...checkPageFontSize(cs, first, render)]));
    const textBoxes = render.textItems.map(({ str, rect: [x0, y0, x1, y1] }) => ({
      str, x: x0 / render.dpi, y: y0 / render.dpi, width: (x1 - x0) / render.dpi, height: (y1 - y0) / render.dpi,
    }));
    issues.push(...checkSpineText(specs, textBoxes, L, settings));
    // Zones only make sense on a cover of the right size; otherwise the size issue explains what to fix.
    const sizeOk = !issues.some((i) => i.checkId === 'coverSize' && i.severity === 'fail');
    if (sizeOk) {
      issues.push(...checkCoverZones(specs, textBoxes, L, { toleranceIn: 1 / render.dpi }));
      issues.push(...checkBarcodeArea(specs, render, L));
    }
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
