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
        severity: specs.fonts.unembeddedSeverity,
        page,
        measured: `${f.name} not embedded`,
        required: 'all fonts embedded',
        message: `The font "${f.name}" is not embedded in the PDF. KDP usually accepts this; the printer may substitute the font.`,
        fix: 'Export the PDF again with fonts embedded. In LibreOffice: File → Export as PDF → General tab, tick "Archive (PDF/A, ISO 19005)", which embeds every font. In Word: File → Save As → PDF → Options, tick "PDF/A compliant". If a font still will not embed, its licence forbids it: switch to a different font.',
        accuracy: 'verified',
        source,
        fixId: 'embed-fonts',
        sourceNote: specs.fonts.unembeddedNote,
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
      message: `${names.length === 1 ? 'This font is' : `These ${names.length} fonts are`} embedded as a subset (only the letters you used): ${names.join(', ')}. That still counts as embedded. KDP recommends embedding fonts in full, but subset fonts usually pass review.`,
      fix: 'Nothing to do (LibreOffice always embeds subsets). In InDesign you can embed fonts in full: Export Adobe PDF → Advanced → set "Subset fonts when percent of characters used is less than" to 0%.',
      accuracy: 'verified',
      source,
    });
  }
  return issues;
}
