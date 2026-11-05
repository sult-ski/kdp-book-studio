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
  return issues.sort((a, b) =>
    (a.page ?? 0) - (b.page ?? 0) || SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

/** Collapse issues that say the same thing on different pages into one: { ...firstIssue, pages:[...] } */
export function groupIssues(issues) {
  const groups = new Map();
  for (const i of issues) {
    const key = `${i.checkId}|${i.severity}|${i.message}`;
    if (!groups.has(key)) groups.set(key, { ...i, pages: [] });
    if (i.page != null) groups.get(key).pages.push(i.page);
  }
  return [...groups.values()].sort((a, b) =>
    SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || (a.pages[0] ?? 0) - (b.pages[0] ?? 0));
}
