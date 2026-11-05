// Transparency: advisory only (info). KDP's rule ("flatten all transparencies") is on its cover page;
// for interiors it is advice. See-through effects and soft shadows are worth a look in the previewer.
import { sourceUrl } from '../specs.js';

/**
 * @param {object} specs
 * @param {{ transparencyPages:number[]|null }} pdf
 * @returns {Array<object>} one info note per page that uses transparency
 */
export function checkTransparency(specs, pdf) {
  return (pdf.transparencyPages ?? []).map((page) => ({
    id: `transparency-p${page}`,
    checkId: 'transparency',
    severity: 'info',
    page,
    measured: 'transparency',
    required: 'none needed (advisory)',
    message: 'This page uses transparency (see-through effects, soft shadows or images with transparent backgrounds). It usually prints fine, but it is worth a close look in KDP\'s print previewer.',
    fix: 'Nothing to do unless KDP\'s previewer shows boxes or odd colors around those items. If it does, flatten the image in your image editor (save it without transparency) and place it again.',
    accuracy: 'best-effort', // the page declares a transparency effect; we don't check it is drawn
    source: sourceUrl(specs, specs.transparency),
    sourceLabel: 'Applies to covers; for interiors this is advice only.',
  }));
}
