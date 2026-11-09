// Reading text drawn into a cover's picture (OCR). Used only for the back and front panels that have no real
// (live) PDF text, e.g. a cover flattened in Canva. The OCR engine itself (Tesseract.js) is passed in as
// `ocr({ width, height, rgba, dpi }) => Promise<Array<{ text, confidence, bbox:{x0,y0,x1,y1} }>>` (the adapter
// encodes the pixels: PNG in the browser, BMP in Node), so this file has no DOM and runs in the worker and in tests.

/**
 * Which panels need OCR: back and front panels with no live text whose centre falls inside them.
 * @param {Array<{ x:number, y:number, width:number, height:number }>} textBoxes inches, top-left origin
 * @param {object} L coverLayout() result
 * @returns {Array<'back'|'front'>}
 */
export function panelsWithoutText(textBoxes, L) {
  const foldL = L.rects.spine.x;
  const foldR = foldL + L.rects.spine.width;
  const has = { back: false, front: false };
  for (const b of textBoxes) {
    if (!b.str?.trim()) continue;
    const cx = b.x + b.width / 2;
    if (cx < foldL) has.back = true;
    else if (cx > foldR) has.front = true;
  }
  return ['back', 'front'].filter((p) => !has[p]);
}

/**
 * Horizontal strip of the cover to read for a panel, in inches: from the bleed edge to the fold (back),
 * or the fold to the bleed edge (front), full height. Words that cross the trim or fold stay whole.
 */
export function panelStrip(panel, L, page) {
  const foldL = L.rects.spine.x;
  const foldR = foldL + L.rects.spine.width;
  return panel === 'back'
    ? { x: 0, y: 0, width: foldL, height: page.heightIn }
    : { x: foldR, y: 0, width: page.widthIn - foldR, height: page.heightIn };
}

/**
 * Reads words in the given panels of a rendered cover. Each panel is read twice, as rendered and as an
 * inverted greyscale image, because Tesseract reads dark-on-light text best and covers often use light text on
 * dark art. Where the two readings find the same word, the more confident one is kept.
 * @param {{ widthPx:number, heightPx:number, dpi:number, rgba:Uint8ClampedArray }} render
 * @returns {Promise<Array<{ str:string, x:number, y:number, width:number, height:number, ocr:true, confidence:number, panel:string }>>}
 *   word boxes in inches (top-left origin) with Tesseract's confidence (0-100); filtered by minChars only
 */
export async function readPanels(ocr, render, L, page, panels, { minChars }) {
  const inverted = { ...render, rgba: invertGrey(render.rgba) };
  const words = [];
  for (const panel of panels) {
    const s = panelStrip(panel, L, page);
    const x0 = Math.max(0, Math.round(s.x * render.dpi));
    const x1 = Math.min(render.widthPx, Math.round((s.x + s.width) * render.dpi));
    const px = { x: x0, y: 0, width: x1 - x0, height: render.heightPx };
    if (px.width < 8) continue;
    const found = [];
    for (const r of [render, inverted]) {
      for (const w of await ocr(crop(r, px))) {
        const word = toWord(w, px, render.dpi, minChars);
        if (word) found.push({ ...word, panel });
      }
    }
    words.push(...dedupe(found));
  }
  return words;
}

const isChar = (c) => /[\p{L}\p{N}]/u.test(c);

/** One Tesseract word in inches, or null if it has too few letters/digits to be text. Decorative rules or dashes
 *  read as part of the word ("Vane——") are trimmed off, shrinking the box by their share of the characters. */
function toWord(w, px, dpi, minChars) {
  const raw = (w.text ?? '').trim();
  const chars = [...raw];
  if (chars.filter(isChar).length < minChars) return null;
  const lead = chars.findIndex(isChar);
  const trail = chars.length - 1 - chars.findLastIndex(isChar);
  const { x0, x1 } = w.bbox;
  const per = (x1 - x0) / chars.length;
  const left = x0 + lead * per;
  const right = x1 - trail * per;
  const { top, bottom } = tightRows(w);
  return {
    str: chars.slice(lead, chars.length - trail).join(''),
    x: (px.x + left) / dpi,
    y: (px.y + top) / dpi,
    width: (right - left) / dpi,
    height: (bottom - top) / dpi,
    ocr: true,
    confidence: Math.round(w.confidence),
  };
}

const DESCENDS = /[gjpqyQ,;]/;

/**
 * Tesseract's word boxes often swallow nearby artwork (a stair rail, a decorative rule). The text line's
 * baseline is far more reliable, so: the bottom is the baseline (or a letter's own bottom for descenders like
 * g, p, y), and the top drops letters that stand much taller above the baseline than the others.
 * Falls back to the word box when there is no baseline or no letter boxes.
 */
function tightRows(w) {
  const { y0, y1 } = w.bbox;
  const syms = (w.symbols ?? []).filter((s) => isChar(s.text ?? ''));
  const b = w.baseline;
  if (!b || !syms.length || b.x1 === b.x0) return { top: y0, bottom: y1 };
  const at = (x) => b.y0 + ((b.y1 - b.y0) * (x - b.x0)) / (b.x1 - b.x0);
  const rise = syms.map((s) => at((s.bbox.x0 + s.bbox.x1) / 2) - s.bbox.y0);
  const median = [...rise].sort((a, c) => a - c)[Math.floor(rise.length / 2)];
  let top = Infinity;
  let bottom = -Infinity;
  syms.forEach((s, i) => {
    const base = at((s.bbox.x0 + s.bbox.x1) / 2);
    if (rise[i] <= 1.6 * median) top = Math.min(top, s.bbox.y0);
    bottom = Math.max(bottom, DESCENDS.test(s.text) ? s.bbox.y1 : Math.min(s.bbox.y1, base + 1));
  });
  if (!Number.isFinite(top) || bottom <= top) return { top: y0, bottom: y1 };
  return { top: Math.max(top, y0), bottom: Math.min(bottom, y1) };
}

/** Drops a word when a more confident word covers most of it (the same word found in both readings). */
function dedupe(list) {
  const sorted = [...list].sort((a, b) => b.confidence - a.confidence);
  const kept = [];
  for (const w of sorted) {
    if (!kept.some((k) => overlap(k, w) > 0.5 * Math.min(area(k), area(w)))) kept.push(w);
  }
  return kept;
}
const area = (b) => b.width * b.height;
const overlap = (a, b) => Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
  * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));

function invertGrey(rgba) {
  const out = new Uint8ClampedArray(rgba.length);
  for (let i = 0; i < rgba.length; i += 4) {
    const g = 255 - (0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]);
    out[i] = out[i + 1] = out[i + 2] = g;
    out[i + 3] = 255;
  }
  return out;
}

/** Part of the render as its own RGBA image. */
export function crop(render, { x, y, width, height }) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let row = 0; row < height; row++) {
    const from = ((y + row) * render.widthPx + x) * 4;
    rgba.set(render.rgba.subarray(from, from + width * 4), row * width * 4);
  }
  return { width, height, rgba, dpi: render.dpi };
}

/**
 * An uncompressed 24-bit BMP of an RGBA image, for Tesseract.js in Node (it reads BMP; raw pixels it does not).
 * @param {{ width:number, height:number, rgba:Uint8ClampedArray, dpi:number }} image
 * @returns {Uint8Array}
 */
export function toBmp({ width, height, rgba, dpi }) {
  const rowBytes = Math.ceil((width * 3) / 4) * 4;
  const size = 54 + rowBytes * height;
  const out = new Uint8Array(size);
  const dv = new DataView(out.buffer);
  out[0] = 0x42; out[1] = 0x4d; // "BM"
  dv.setUint32(2, size, true);
  dv.setUint32(10, 54, true);
  dv.setUint32(14, 40, true);
  dv.setInt32(18, width, true);
  dv.setInt32(22, height, true); // positive: bottom-up rows
  dv.setUint16(26, 1, true);
  dv.setUint16(28, 24, true);
  dv.setUint32(34, rowBytes * height, true);
  const ppm = Math.round(dpi / 0.0254);
  dv.setInt32(38, ppm, true);
  dv.setInt32(42, ppm, true);
  for (let row = 0; row < height; row++) {
    let o = 54 + row * rowBytes;
    let i = (height - 1 - row) * width * 4;
    for (let col = 0; col < width; col++, i += 4) {
      out[o++] = rgba[i + 2];
      out[o++] = rgba[i + 1];
      out[o++] = rgba[i];
    }
  }
  return out;
}

/** Flattens a Tesseract.js result (recognize with { blocks: true }) into words. */
export function wordsFromTesseract(data) {
  const words = [];
  for (const block of data?.blocks ?? []) {
    for (const para of block.paragraphs ?? []) {
      for (const line of para.lines ?? []) {
        for (const w of line.words ?? []) {
          words.push({
            text: w.text, confidence: w.confidence, bbox: w.bbox, baseline: line.baseline,
            symbols: (w.symbols ?? []).map((sym) => ({ text: sym.text, bbox: sym.bbox })),
          });
        }
      }
    }
  }
  return words;
}

/** Tesseract settings shared by the browser and Node: automatic page layout, at the DPI we render at. */
export const tesseractParams = (specs) => ({
  tessedit_pageseg_mode: '3',
  user_defined_dpi: String(specs.cover.ocr.dpi),
  debug_file: '/dev/null', // Tesseract's own notes ("Detected 2 diacritics") would otherwise show as console errors
});
