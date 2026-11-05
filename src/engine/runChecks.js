// Runs every check and returns one sorted issue list: whole-book issues first, then by page.
import { checkPageSize } from './checks/pageSize.js';
import { checkPageCount } from './checks/pageCount.js';
import { checkFonts } from './checks/fonts.js';
import { checkFileRules } from './checks/fileRules.js';

const SEVERITY_ORDER = { fail: 0, warn: 1, info: 2 };

/**
 * @param {object} specs kdp-specs.json
 * @param {object} pdf   result of loadPdf()
 * @param {{trim:string, inkPaper:string, bleed:boolean, toleranceIn?:number}} settings
 * @returns {Array<object>} issues
 */
export function runChecks(specs, pdf, settings) {
  const issues = [
    ...checkPageCount(specs, pdf, settings),
    ...checkPageSize(specs, pdf, settings),
    ...checkFonts(specs, pdf),
    ...checkFileRules(specs, pdf),
  ];
  return sortIssues(issues);
}

/** Whole-book issues first, then by page; within a page, fails before warnings before info. */
export function sortIssues(issues) {
  return issues.sort((a, b) =>
    (a.page ?? 0) - (b.page ?? 0) || SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

/**
 * Collapse issues that say the same thing on different pages into one: { ...issue, pages:[...] }.
 * Issues with a `groupKey` (e.g. margins, where each page has its own measurement) group by that key
 * and show the worst page's message (smallest `measured` value).
 */
export function groupIssues(issues) {
  const groups = new Map();
  for (const i of issues) {
    const key = `${i.checkId}|${i.severity}|${i.groupKey ?? i.message}`;
    if (!groups.has(key)) groups.set(key, { ...i, pages: [] });
    const g = groups.get(key);
    if (i.page != null) g.pages.push(i.page);
    if (i.groupKey && parseFloat(i.measured) < parseFloat(g.measured)) {
      Object.assign(g, { ...i, pages: g.pages, worstPage: i.page });
    } else if (i.groupKey && g.worstPage == null) {
      g.worstPage = i.page;
    }
  }
  return [...groups.values()].sort((a, b) =>
    SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || (a.pages[0] ?? 0) - (b.pages[0] ?? 0));
}
