// Page count vs KDP's allowed range for the chosen trim + ink/paper.
// KDP rounds an odd page count up to even (a blank page is added at the end).
import { pageCountRange, sourceUrl } from '../specs.js';
import { size } from '../format.js';

/**
 * @param {object} specs
 * @param {{pageCount:number}} pdf
 * @param {{trim:string, inkPaper:string}} settings
 * @returns {Array<object>} issues
 */
export function checkPageCount(specs, pdf, settings) {
  const issues = [];
  const ink = specs.pageCount.inkPaperTypes[settings.inkPaper] ?? settings.inkPaper;
  const [tw, th] = settings.trim.split('x').map(Number);
  const combo = `${ink.toLowerCase()} at ${size(tw, th)} trim`;
  const actual = pdf.pageCount;
  const printed = specs.pageCount.roundUpToEven && actual % 2 === 1 ? actual + 1 : actual;
  const base = { checkId: 'pageCount', page: null, accuracy: 'verified', source: sourceUrl(specs, specs.pageCount) };

  if (printed !== actual) {
    issues.push({
      ...base,
      id: 'pageCount-odd',
      severity: 'info',
      measured: `${actual} pages`,
      required: 'an even number of pages',
      message: `Your PDF has ${actual} pages. KDP counts pages in pairs (front and back of each sheet), so it will add 1 blank page at the end and print ${printed} pages.`,
      fix: `Nothing to do. If you'd rather choose what goes on that last page, add it yourself so the PDF has ${printed} pages.`,
    });
  }

  const range = pageCountRange(specs, settings.trim, settings.inkPaper);
  if (!range) {
    issues.push({
      ...base,
      id: 'pageCount-unavailable',
      severity: 'fail',
      measured: combo,
      required: 'a trim size and ink/paper combination KDP offers',
      message: `KDP doesn't offer ${combo}.`,
      fix: 'Choose a different trim size or ink and paper type (in KDP and above), then check again.',
    });
    return issues;
  }

  const [min, max] = range;
  const counted = printed !== actual ? `${printed} pages (after KDP rounds up to an even number)` : `${actual} pages`;
  if (printed < min) {
    issues.push({
      ...base,
      id: 'pageCount-low',
      severity: 'fail',
      measured: `${printed} pages`,
      required: `${min}–${max} pages`,
      message: `Your book has ${counted}. For ${combo}, KDP needs at least ${min} pages.`,
      fix: `Add content to reach at least ${min} pages, or choose an ink and paper type with a lower minimum.`,
    });
  } else if (printed > max) {
    issues.push({
      ...base,
      id: 'pageCount-high',
      severity: 'fail',
      measured: `${printed} pages`,
      required: `${min}–${max} pages`,
      message: `Your book has ${counted}. For ${combo}, KDP allows at most ${max} pages.`,
      fix: `Bring the book down to ${max} pages or fewer (for example with a slightly smaller font or line spacing), or choose a trim size or paper that allows more pages.`,
    });
  }
  return issues;
}
