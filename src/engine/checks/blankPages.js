// Blank pages: KDP allows at most 4 blank pages in a row at the start or in the middle of a book,
// and at most 10 at the end. Warning: KDP's manual review may flag longer runs.
import { sourceUrl } from '../specs.js';
import { formatPageList } from '../summarize.js';

/**
 * @param {object} specs
 * @param {Array<boolean|null>} blank blank[i] for page i+1: true = prints nothing, false = has ink,
 *   null = not rendered (wrong size or render failed), treated as not blank
 * @returns {Array<object>} issues, one per run that is too long
 */
export function checkBlankPages(specs, blank) {
  const { maxConsecutiveStartOrMiddle: maxMid, maxConsecutiveEnd: maxEnd } = specs.blankPages;
  const issues = [];
  let i = 0;
  while (i < blank.length) {
    if (blank[i] !== true) { i++; continue; }
    let j = i;
    while (j + 1 < blank.length && blank[j + 1] === true) j++;
    const count = j - i + 1;
    const atEnd = j === blank.length - 1;
    const limit = atEnd ? maxEnd : maxMid;
    if (count > limit) {
      const pages = Array.from({ length: count }, (_, k) => i + k + 1);
      const where = atEnd ? 'at the end of a book' : i === 0 ? 'at the start of a book' : 'in the middle of a book';
      issues.push({
        id: `blankPages-${i + 1}-${j + 1}`,
        checkId: 'blankPages',
        severity: 'warn',
        page: null,
        measured: `${count} blank pages in a row`,
        required: `at most ${limit} in a row ${where}`,
        message: `Pages ${formatPageList(pages)} are blank: ${count} blank pages in a row ${where.replace('of a book', 'of the book')}. KDP allows at most ${maxMid} in a row at the start or middle of a book and ${maxEnd} at the end, so its review may flag this.`,
        fix: 'Remove the extra blank pages, or give some of them content (for example a section title or "Notes"). In LibreOffice, turn on View → Formatting Marks to find stray page breaks.',
        accuracy: 'verified',
        source: sourceUrl(specs, specs.blankPages),
        fixId: 'remove-blank-pages',
      });
    }
    i = j + 1;
  }
  return issues;
}
