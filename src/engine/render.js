// Inspects pages with pdf.js: image placements, rendered pixels and text boxes. No DOM:
// the pdf.js module and its options are passed in, so this runs in a Web Worker and in Node.
import { findImagePlacements } from './images.js';

/**
 * @param {typeof import('pdfjs-dist')} pdfjs
 * @param {Uint8Array} bytes
 * @param {object} docOptions extra getDocument options (asset URLs, canvas factory, ...)
 */
export async function openWithPdfjs(pdfjs, bytes, docOptions = {}) {
  // pdf.js may take ownership of the buffer, so give it a copy.
  return pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false, ...docOptions }).promise;
}

/**
 * Inspects one page as it will print: where images are placed, and (if `render`) the rendered pixels.
 * @param {{ dpi:number, render:boolean }} opts
 * @returns {Promise<{ images: Array<ImagePlacement>, render: null | { widthPx:number, heightPx:number, dpi:number,
 *   rgba:Uint8ClampedArray, textRects:Array<[number, number, number, number]> } }>}
 *   ImagePlacement = { pxW, pxH, widthIn, heightIn, bboxIn:{x,y,width,height}, kind }, inches with a
 *   top-left origin on the upright page; textRects are [x0, y0, x1, y1] in pixels, top-left origin
 */
export async function inspectPage(pdfjs, doc, pageNumber, { dpi, render }) {
  const page = await doc.getPage(pageNumber);
  try {
    const opList = await page.getOperatorList({ intent: 'print' });
    const images = placeImages(pdfjs, page, opList);
    return { images, render: render ? await renderPixels(pdfjs, doc, page, dpi) : null };
  } finally {
    page.cleanup();
  }
}

/** Image placements in page inches (top-left origin, after page rotation). */
function placeImages(pdfjs, page, opList) {
  const viewport = page.getViewport({ scale: 1 }); // 1 unit = 1 pt
  const lookup = (id) => {
    for (const store of [page.objs, page.commonObjs]) {
      try { if (store.has(id)) return store.get(id); } catch { /* not decoded */ }
    }
    return null;
  };
  return findImagePlacements(opList, pdfjs.OPS, lookup).map(({ pxW, pxH, ctm, kind }) => {
    const corners = [[0, 0], [1, 0], [0, 1], [1, 1]]
      .map(([u, v]) => viewport.convertToViewportPoint(ctm[0] * u + ctm[2] * v + ctm[4], ctm[1] * u + ctm[3] * v + ctm[5]));
    const xs = corners.map((c) => c[0] / 72);
    const ys = corners.map((c) => c[1] / 72);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return {
      pxW, pxH, kind,
      widthIn: Math.hypot(ctm[0], ctm[1]) / 72,   // displayed length of the image's x side
      heightIn: Math.hypot(ctm[2], ctm[3]) / 72,  // displayed length of the image's y side
      bboxIn: { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y },
    };
  });
}

/** Renders the page for printing at `dpi` on a white background, plus text boxes. */
async function renderPixels(pdfjs, doc, page, dpi) {
  const viewport = page.getViewport({ scale: dpi / 72 });
  const widthPx = Math.ceil(viewport.width);
  const heightPx = Math.ceil(viewport.height);
  const target = doc.canvasFactory.create(widthPx, heightPx);
  try {
    await page.render({ canvas: target.canvas, viewport, intent: 'print', background: 'white' }).promise;
    const rgba = target.context.getImageData(0, 0, widthPx, heightPx).data;
    const text = await page.getTextContent();
    const textRects = text.items
      .filter((item) => item.str && item.str.trim())
      .map((item) => textRect(pdfjs, viewport, item));
    return { widthPx, heightPx, dpi, rgba, textRects };
  } finally {
    doc.canvasFactory.destroy(target);
  }
}

/** Axis-aligned pixel box around a text run, including ascenders and descenders, at any rotation. */
function textRect(pdfjs, viewport, item) {
  const t = pdfjs.Util.transform(viewport.transform, item.transform);
  const fontPx = Math.hypot(t[2], t[3]);
  const lenPx = item.width * viewport.scale;
  const run = unit(t[0], t[1]);   // along the baseline
  const up = unit(t[2], t[3]);    // towards the top of the glyphs (already flipped for canvas y-down)
  const [bx, by] = [t[4], t[5]];
  const corners = [
    [bx - up[0] * fontPx * 0.25, by - up[1] * fontPx * 0.25],                      // below baseline (descenders)
    [bx + up[0] * fontPx, by + up[1] * fontPx],                                    // top
  ].flatMap(([x, y]) => [[x, y], [x + run[0] * lenPx, y + run[1] * lenPx]]);
  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

function unit(x, y) {
  const len = Math.hypot(x, y) || 1;
  return [x / len, y / len];
}
