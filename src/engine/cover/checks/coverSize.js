// Cover size: the PDF page must be the full cover size (bleed + back + spine + front + bleed) for the trim,
// paper and page count. When it isn't, say which common mistake it looks like:
// no bleed, front cover only, or a spine made for another page count or paper.
import { inches, size, sizeBoth } from '../../format.js';
import { sourceUrl } from '../../specs.js';

const ROUNDING_IN = 0.0005; // PDF sizes are stored in points; differences below this are rounding

/**
 * @param {object} specs
 * @param {{ widthIn:number, heightIn:number }} page the cover PDF's first page
 * @param {ReturnType<import('../layout.js').coverLayout>} L
 * @param {{ trim:string, inkPaper:string, pages:number, toleranceIn?:number }} settings
 */
export function checkCoverSize(specs, page, L, settings) {
  const tol = settings.toleranceIn ?? specs.app.sizeToleranceIn;
  const { widthIn: w, heightIn: h } = page;
  const W = L.widthIn;
  const H = L.heightIn;
  const b = L.bleedIn;
  const tw = L.trimWidthIn;
  const th = L.trimHeightIn;
  const close = (a, x) => Math.abs(a - x) <= tol;
  const ink = (key) => (specs.pageCount.inkPaperTypes[key] ?? key).toLowerCase();
  const need = sizeBoth(W, H);
  const base = {
    checkId: 'coverSize',
    page: 1,
    measured: sizeBoth(w, h),
    required: need,
    accuracy: 'verified',
    source: sourceUrl(specs, specs.cover.size),
    fixId: 'resize-cover',
  };
  const fix = `Set your cover document to exactly ${need} and export the PDF again. The Cover calculator tab has a template at this size with every guide in place.`;

  if (close(w, W) && close(h, H)) {
    const dw = w - W;
    const dh = h - H;
    if (Math.abs(dw) <= ROUNDING_IN && Math.abs(dh) <= ROUNDING_IN) return [];
    const diffs = [
      Math.abs(dw) > ROUNDING_IN && `${inches(Math.abs(dw))} ${dw > 0 ? 'wider' : 'narrower'}`,
      Math.abs(dh) > ROUNDING_IN && `${inches(Math.abs(dh))} ${dh > 0 ? 'taller' : 'shorter'}`,
    ].filter(Boolean).join(' and ');
    return [{
      ...base, id: 'cover-size-near', severity: 'info',
      message: `Cover size is ${sizeBoth(w, h)}, ${diffs} than ${need}. That is within our ${inches(tol)} tolerance (our setting, not a KDP rule).`,
      fix: `Nothing to do. To match exactly, set your cover document to ${need}.`,
    }];
  }

  if (close(w, W - 2 * b) && close(h, H - 2 * b)) {
    return [{
      ...base, id: 'cover-size-no-bleed', severity: 'fail',
      message: `Your cover is ${sizeBoth(w, h)}: that is the size without bleed. KDP needs ${inches(b)} of extra background on every outside edge (it is trimmed off), so the full cover must be ${need}.`,
      fix: `Extend your background ${inches(b)} past the trim on all four sides, set the document to ${need} and export again. The Cover calculator tab has a template at this size.`,
    }];
  }

  const panel = [[tw, th], [tw + b, th + 2 * b], [tw + 2 * b, th + 2 * b]];
  if (panel.some(([pw, ph]) => close(w, pw) && close(h, ph))) {
    return [{
      ...base, id: 'cover-size-front-only', severity: 'fail',
      message: `Your PDF is ${sizeBoth(w, h)}, about the size of the front cover only. KDP needs the back cover, spine and front cover side by side in one PDF: ${need} with bleed.`,
      fix: `Make one document of ${need} with the back cover on the left, the spine in the middle and the front cover on the right, then export again. The Cover calculator tab has a template with each panel marked.`,
    }];
  }

  const impliedSpine = w - 2 * b - 2 * tw;
  if (close(h, H) && impliedSpine > 0) {
    const perPage = specs.cover.spine.perPageIn;
    const otherPaper = Object.keys(perPage)
      .find((key) => key !== settings.inkPaper && Math.abs(settings.pages * perPage[key] - impliedSpine) <= tol);
    const fits = otherPaper
      ? `which matches ${settings.pages} pages of ${ink(otherPaper)}`
      : `which fits about ${Math.round(impliedSpine / perPage[settings.inkPaper])} pages of ${ink(settings.inkPaper)}`;
    return [{
      ...base, id: 'cover-size-spine', severity: 'fail',
      message: `Your cover has a ${inches(impliedSpine)} spine, ${fits}. You entered ${settings.pages} pages of ${ink(settings.inkPaper)}, which needs a ${inches(L.spineIn)} spine, so the full cover must be ${need}.`,
      fix: `Check the page count and the ink and paper you chose on KDP. If they are right, make the spine ${inches(L.spineIn)} wide so the full cover is ${need}, then export again.`,
    }];
  }

  return [{
    ...base, id: 'cover-size', severity: 'fail',
    message: `Your cover is ${sizeBoth(w, h)}. A ${size(tw, th)} book with ${settings.pages} pages of ${ink(settings.inkPaper)} needs a cover of exactly ${need}, including ${inches(b)} bleed on every outside edge.`,
    fix,
  }];
}

/** A cover PDF must be a single page; we check the first one. */
export function checkCoverPages(specs, pageCount) {
  if (pageCount <= 1) return [];
  return [{
    id: 'cover-pages', checkId: 'coverPages', severity: 'fail', page: null,
    measured: `${pageCount} pages`, required: '1 page',
    message: `Your cover PDF has ${pageCount} pages. KDP needs the whole cover (back, spine and front) as a single page. Only the first page was checked.`,
    fix: 'Export just the cover as a one-page PDF, with the back cover, spine and front cover side by side.',
    accuracy: 'verified',
    source: sourceUrl(specs, specs.cover.size),
  }];
}
