// Milestone 1: group pages by size so a 300-page book shows as one line, not 300.
// Real pass/fail checks arrive in Milestone 2; this only reports what the file contains.
import { expectedPageSize, pageCountRange } from './specs.js';

const round = (n) => Math.round(n * 1000) / 1000;

export function summarize(specs, pdf, settings) {
  const groups = new Map();
  for (const p of pdf.pages) {
    const key = `${round(p.widthIn)} x ${round(p.heightIn)}`;
    if (!groups.has(key)) groups.set(key, { widthIn: round(p.widthIn), heightIn: round(p.heightIn), pages: [] });
    groups.get(key).pages.push(p.number);
  }
  return {
    pageCount: pdf.pageCount,
    encrypted: pdf.encrypted,
    expected: expectedPageSize(specs, settings.trim, settings.bleed),
    allowedRange: pageCountRange(specs, settings.trim, settings.inkPaper),
    sizeGroups: [...groups.values()],
  };
}

/** "1-3, 7, 9-12" from [1,2,3,7,9,10,11,12] */
export function formatPageList(nums) {
  const out = [];
  for (let i = 0; i < nums.length; i++) {
    let j = i;
    while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++;
    out.push(i === j ? `${nums[i]}` : `${nums[i]}-${nums[j]}`);
    i = j;
  }
  return out.join(', ');
}
