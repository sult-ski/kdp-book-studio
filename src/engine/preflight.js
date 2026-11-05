// The whole preflight: structural checks (pdf-lib), then page-by-page checks with pdf.js
// (image resolution on every page, margins on pages of the right size).
// No DOM: pdf.js and its options are passed in, so this runs in the Web Worker and in Node tests.
import { loadPdf } from './loadPdf.js';
import { runChecks, sortIssues } from './runChecks.js';
import { summarize, formatPageList } from './summarize.js';
import { openWithPdfjs, inspectPage } from './render.js';
import { checkPageImages } from './checks/imageDpi.js';
import { checkPageMargins, pageMatchesExpectedSize } from './checks/margins.js';
import { sourceUrl } from './specs.js';

/**
 * @param {object} specs
 * @param {Uint8Array} bytes
 * @param {{trim:string, inkPaper:string, bleed:boolean, toleranceIn?:number}} settings
 * @param {{ pdfjs: object, docOptions?: object, onProgress?: (p:{done:number,total:number}) => void }} env
 * @returns {Promise<{ error?:string, summary?:object, issues?:Array<object> }>}
 */
export async function preflight(specs, bytes, settings, { pdfjs, docOptions = {}, onProgress = () => {} }) {
  const pdf = await loadPdf(bytes);
  if (pdf.error) return { error: pdf.error };

  const issues = runChecks(specs, pdf, settings);
  const summary = summarize(specs, pdf, settings);
  const printedPageCount = pdf.pageCount + (specs.pageCount.roundUpToEven && pdf.pageCount % 2 ? 1 : 0);
  const source = sourceUrl(specs, specs.margins);

  let doc;
  try {
    doc = await openWithPdfjs(pdfjs, bytes, docOptions);
  } catch (e) {
    console.error('pdf.js could not open the document:', e);
    issues.push(marginsUnchecked(source, e?.name === 'PasswordException'
      ? 'This PDF is password-protected, so we could not open its pages to check margins and image resolution.'
      : "We couldn't render this PDF's pages, so margins and image resolution were not checked."));
    return { summary, issues: sortIssues(issues) };
  }

  const failedPages = [];
  try {
    for (const page of pdf.pages) {
      onProgress({ done: page.number - 1, total: pdf.pageCount });
      // Wrong-size pages are already reported; their margins can't be measured meaningfully,
      // so only render pages of the right size. Image resolution is checked on every page.
      const measureMargins = pageMatchesExpectedSize(specs, page, settings);
      try {
        const { images, render } = await inspectPage(pdfjs, doc, page.number,
          { dpi: specs.app.renderDpi, render: measureMargins });
        issues.push(...checkPageImages(specs, page, images));
        if (render) issues.push(...checkPageMargins(specs, page, render, { settings, printedPageCount }));
      } catch (e) {
        console.error(`pdf.js could not render page ${page.number}:`, e);
        failedPages.push(page.number);
      }
    }
  } finally {
    await doc.loadingTask.destroy(); // frees pdf.js memory (v6 moved destroy() to the loading task)
  }
  onProgress({ done: pdf.pageCount, total: pdf.pageCount });

  if (failedPages.length) {
    issues.push(marginsUnchecked(source,
      `We couldn't render page${failedPages.length === 1 ? '' : 's'} ${formatPageList(failedPages)}, so ${failedPages.length === 1 ? 'its' : 'their'} margins and images were not checked.`));
  }
  return { summary, issues: sortIssues(issues) };
}

function marginsUnchecked(source, message) {
  return {
    id: `margins-unchecked-${message.length}`,
    checkId: 'margins',
    severity: 'warn',
    page: null,
    measured: 'not checked',
    required: 'margins checked',
    message,
    fix: 'Re-export the PDF from your writing app and check again. Until then, check your margins and image quality yourself.',
    accuracy: 'best-effort',
    source,
  };
}
