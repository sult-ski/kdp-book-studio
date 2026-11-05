// Every page must be exactly the trim size (no bleed) or trim + bleed (bleed).
// Pages about twice the trim width are reported as two-page spreads instead.
import { expectedPageSize, sourceUrl } from '../specs.js';
import { size, sizeBoth, inches } from '../format.js';

const EPS = 1e-6;
// Differences below this are PDF rounding (e.g. sizes set in mm), not a real size difference.
const ROUNDING_IN = 0.001;
const LIBREOFFICE_SIZE = 'In LibreOffice Writer: Format → Page Style → Page tab, set Width and Height.';
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
    if (near(w, exp.width, tol) && near(h, exp.height, tol)) {
      if (!near(w, exp.width, ROUNDING_IN) || !near(h, exp.height, ROUNDING_IN)) {
        issues.push(nearMiss(specs, p, exp, tol));
      }
      continue;
    }
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

    let message = `Page size is ${sizeBoth(w, h)}. You chose ${trimLabel} trim ${mode}, so every page must be ${sizeBoth(exp.width, exp.height)}.`;
    let fix = `Set your document's page size to ${sizeBoth(exp.width, exp.height)} and re-export the PDF. ${LIBREOFFICE_SIZE}`;
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

/** Page size within our tolerance but not exact: info only, shown in inches and mm. */
function nearMiss(specs, p, exp, tol) {
  const dw = p.widthIn - exp.width;
  const dh = p.heightIn - exp.height;
  const diffs = [
    Math.abs(dw) > ROUNDING_IN && `${inches(Math.abs(dw))} ${dw > 0 ? 'wider' : 'narrower'}`,
    Math.abs(dh) > ROUNDING_IN && `${inches(Math.abs(dh))} ${dh > 0 ? 'taller' : 'shorter'}`,
  ].filter(Boolean).join(' and ');
  return {
    id: `pageSize-near-p${p.number}`,
    checkId: 'pageSize',
    severity: 'info',
    page: p.number,
    measured: sizeBoth(p.widthIn, p.heightIn),
    required: sizeBoth(exp.width, exp.height),
    message: `Page size is ${sizeBoth(p.widthIn, p.heightIn)}, ${diffs} than ${sizeBoth(exp.width, exp.height)}. That is within our ${inches(tol)} tolerance: a real book this close to its trim size was approved by KDP.`,
    fix: `Nothing to do. To match exactly, set the page size to ${sizeBoth(exp.width, exp.height)}. ${LIBREOFFICE_SIZE}`,
    accuracy: 'verified',
    source: sourceUrl(specs, specs.bleed),
  };
}

/** Width ≈ 2× page width (with or without bleed) and height ≈ trim height (with or without bleed). */
function isSpread(specs, w, h, trim) {
  const r = specs.app.spreadMatchRatio;
  const close = (a, b) => Math.abs(a - b) <= b * r;
  const widthOk = close(w, trim.width * 2) || close(w, (trim.width + specs.bleed.addWidth) * 2);
  const heightOk = close(h, trim.height) || close(h, trim.height + specs.bleed.addHeight);
  return widthOk && heightOk;
}
