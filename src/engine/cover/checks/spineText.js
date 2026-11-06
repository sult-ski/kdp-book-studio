// Spine text vs page count: KDP allows text on the spine only from spineText.minPages (79) pages.
// Text counts as on the spine when the centre of its box lies between the two fold lines.
// Only real (live) text is found here; text converted to outlines is covered by the render scan (C3).
import { sourceUrl } from '../../specs.js';

/**
 * @param {object} specs
 * @param {Array<{ str:string, x:number, y:number, width:number, height:number }>} textBoxes inches, top-left origin
 * @param {ReturnType<import('../layout.js').coverLayout>} L
 * @param {{ pages:number }} settings
 */
export function checkSpineText(specs, textBoxes, L, settings) {
  const spine = L.rects.spine;
  const onSpine = textBoxes.filter((t) => {
    const cx = t.x + t.width / 2;
    return cx >= spine.x && cx <= spine.x + spine.width;
  });
  if (!onSpine.length) return [];
  const rule = specs.cover.spineText;
  const sample = onSpine.map((t) => t.str.trim()).join(' ').slice(0, 40);
  const base = {
    checkId: 'coverSpineText',
    page: 1,
    bbox: union(onSpine),
    measured: `spine text, ${settings.pages} pages`,
    accuracy: 'verified',
    source: sourceUrl(specs, rule),
  };
  if (settings.pages < rule.minPages) {
    return [{
      ...base, id: 'cover-spine-text', severity: 'fail',
      required: `no spine text under ${rule.minPages} pages`,
      message: `There is text on the spine ("${sample}"), but your book has ${settings.pages} pages. KDP only allows spine text from ${rule.minPages} pages: a thinner spine is too narrow to print it reliably.`,
      fix: 'Remove the text from the spine and leave it as plain colour or artwork, then export again.',
      fixId: 'remove-spine-text',
    }];
  }
  if (settings.pages < rule.coverCreatorMinPages) {
    return [{
      ...base, id: 'cover-spine-text-cover-creator', severity: 'info',
      required: `spine text from ${rule.minPages} pages`,
      message: `Your spine has text and your book has ${settings.pages} pages. KDP allows spine text from ${rule.minPages} pages, but its Cover Creator tool only adds it from ${rule.coverCreatorMinPages}.`,
      fix: `Nothing to do. If a reviewer questions it, KDP's cover guidelines allow spine text from ${rule.minPages} pages.`,
    }];
  }
  return [];
}

function union(boxes) {
  const x0 = Math.min(...boxes.map((b) => b.x));
  const y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.width));
  const y1 = Math.max(...boxes.map((b) => b.y + b.height));
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}
