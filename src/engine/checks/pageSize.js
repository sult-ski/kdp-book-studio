// Every page must be exactly the trim size (no bleed) or trim + bleed (bleed).
// Pages about twice the trim width are reported as two-page spreads instead.
import { expectedPageSize, sourceUrl } from '../specs.js';
import { size } from '../format.js';

const EPS = 1e-6;
const near = (a, b, tol) => Math.abs(a - b) <= tol + EPS;

/**
 * @param {object} specs  kdp-specs.json
 * @param {{pages:Array<{number:number,widthIn:number,heightIn:number}>}} pdf
 * @param {{trim:string, bleed:boolean, toleranceIn?:number}} settings
 * @returns {Array<object>} issues
 */
export function checkPageSize(specs, pdf, settings) {
  const tol = settings.toleranceIn ?? specs.app.sizeToleranceIn;
  const exp = expectedPageSize(specs, settings.trim, settings.bleed);
  const other = expectedPageSize(specs, settings.trim, !settings.bleed);
  const trim = expectedPageSize(specs, settings.trim, false);
  const want = size(exp.width, exp.height);
  const trimLabel = size(trim.width, trim.height);
  const mode = settings.bleed ? 'with bleed' : 'with no bleed';
  const issues = [];

  for (const p of pdf.pages) {
    const { widthIn: w, heightIn: h } = p;
    if (near(w, exp.width, tol) && near(h, exp.height, tol)) continue;
    const measured = size(w, h);

    if (isSpread(specs, w, h, trim)) {
      issues.push({
        id: `spread-p${p.number}`,
        checkId: 'spread',
        severity: 'fail',
        page: p.number,
        measured,
        required: want,
        message: `This page is ${measured}, about twice as wide as your ${trimLabel} trim, so it looks like two pages side by side (a "spread"). KDP needs every page as a separate single page.`,
        fix: `Export your PDF as single pages, not spreads (in InDesign, choose "Pages", not "Spreads", in the PDF export window). Each page should be ${want}.`,
        accuracy: 'verified',
        source: sourceUrl(specs, specs.file),
        fixId: 'split-spreads',
      });
      continue;
    }

    let message = `Page size is ${measured}. You chose ${trimLabel} trim ${mode}, so every page must be ${want}.`;
    let fix = `Set your document's page size to ${want} and re-export the PDF.`;
    if (near(w, other.width, tol) && near(h, other.height, tol)) {
      message += settings.bleed
        ? ' That is the size for the same trim without bleed.'
        : ' That is the size for the same trim with bleed (images or color running off the page edge).';
      fix = settings.bleed
        ? `If nothing in your book runs off the page edge, choose "No bleed" above and check again. Otherwise set the page size to ${want} and re-export.`
        : `If your book has images or color running off the page edge, choose "Bleed" above and check again. Otherwise set the page size to ${want} and re-export.`;
    } else if (near(w, exp.height, tol) && near(h, exp.width, tol)) {
      message += ' This page is sideways (landscape).';
      fix = `Turn this page upright so it is ${want}, then re-export the PDF.`;
    }

    issues.push({
      id: `pageSize-p${p.number}`,
      checkId: 'pageSize',
      severity: 'fail',
      page: p.number,
      measured,
      required: want,
      message,
      fix,
      accuracy: 'verified',
      source: sourceUrl(specs, specs.bleed),
      fixId: 'resize-pages',
    });
  }
  return issues;
}

/** Width ≈ 2× page width (with or without bleed) and height ≈ trim height (with or without bleed). */
function isSpread(specs, w, h, trim) {
  const r = specs.app.spreadMatchRatio;
  const close = (a, b) => Math.abs(a - b) <= b * r;
  const widthOk = close(w, trim.width * 2) || close(w, (trim.width + specs.bleed.addWidth) * 2);
  const heightOk = close(h, trim.height) || close(h, trim.height + specs.bleed.addHeight);
  return widthOk && heightOk;
}
