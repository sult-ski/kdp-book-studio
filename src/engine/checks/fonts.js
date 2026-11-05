// Fonts: every font must be embedded (fail). Subset fonts are allowed but KDP recommends full embedding (info).
import { sourceUrl } from '../specs.js';

/**
 * @param {object} specs
 * @param {{ fonts: Array<{name:string, subtype:string, embedded:boolean, subset:boolean, pages:number[]}>|null,
 *           factErrors?: string[] }} pdf
 * @returns {Array<object>} issues
 */
export function checkFonts(specs, pdf) {
  const source = sourceUrl(specs, specs.fonts);
  if (!pdf.fonts) {
    return [{
      id: 'fonts-unreadable', checkId: 'fonts', severity: 'warn', page: null,
      measured: 'font list could not be read', required: 'all fonts embedded',
      message: "We couldn't read the font list in this PDF, so we can't confirm your fonts are embedded.",
      fix: 'Re-export the PDF from your writing app with all fonts embedded, then check again.',
      accuracy: 'best-effort', source,
    }];
  }

  const issues = [];
  for (const f of pdf.fonts) {
    if (f.embedded || !specs.fonts.mustEmbed) continue;
    for (const page of f.pages) {
      issues.push({
        id: `fonts-unembedded-${f.name}-p${page}`,
        checkId: 'fonts',
        severity: 'fail',
        page,
        measured: `${f.name} not embedded`,
        required: 'all fonts embedded',
        message: `The font "${f.name}" is not embedded in the PDF. KDP requires every font to be embedded, otherwise the printer may swap in a different font.`,
        fix: 'Export the PDF again with fonts embedded. In Word: File → Save As → PDF → Options, tick "PDF/A compliant" (this embeds every font). In InDesign, fonts are embedded automatically unless the font\'s licence forbids it; if so, switch to a different font.',
        accuracy: 'verified',
        source,
        fixId: 'embed-fonts',
      });
    }
  }

  const subsets = pdf.fonts.filter((f) => f.embedded && f.subset);
  if (subsets.length && specs.fonts.preferFullOverSubset) {
    const names = [...new Set(subsets.map((f) => f.name))];
    issues.push({
      id: 'fonts-subset',
      checkId: 'fonts',
      severity: 'info',
      page: null,
      measured: `${names.length} subset font${names.length === 1 ? '' : 's'}`,
      required: 'fully embedded fonts (recommended)',
      message: `${names.length === 1 ? 'This font is' : `These ${names.length} fonts are`} embedded as a subset (only the letters you used): ${names.join(', ')}. That still counts as embedded, but KDP recommends embedding fonts in full.`,
      fix: 'Optional. In InDesign: Export Adobe PDF → Advanced → set "Subset fonts when percent of characters used is less than" to 0%. If your app has no such setting, you can leave it: subset fonts are still embedded.',
      accuracy: 'verified',
      source,
    });
  }
  return issues;
}
