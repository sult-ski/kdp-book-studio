// Finds ink in a rendered page region. Pure pixel logic, no DOM.

/**
 * Scans a band along one page edge for ink, split into text (pixels inside a pdf.js text box)
 * and art (everything else). For each kind, returns the ink closest to that page edge.
 *
 * @param {{ widthPx:number, heightPx:number, dpi:number, rgba:ArrayLike<number>,
 *           textRects:Array<[number,number,number,number]> }} render
 * @param {{ widthIn:number, heightIn:number }} pageIn exact page size in inches
 * @param {'top'|'bottom'|'left'|'right'} edge
 * @param {number} depthIn how far in from the page edge to look, in inches
 * @param {number} threshold a pixel is ink when its darkest RGB channel is below this
 * @returns {{ text: Hit|null, art: Hit|null }}
 *   Hit = { insetIn: distance from the page edge to the nearest ink, in inches;
 *           bboxPx: [x0, y0, x1, y1] of all ink of that kind in the band }
 */
export function scanEdge(render, pageIn, edge, depthIn, threshold) {
  const { widthPx: W, heightPx: H, dpi, rgba } = render;
  const depthPx = Math.min(Math.ceil(depthIn * dpi), edge === 'top' || edge === 'bottom' ? H : W);
  const [x0, y0, x1, y1] = {
    top: [0, 0, W, depthPx],
    bottom: [0, H - depthPx, W, H],
    left: [0, 0, depthPx, H],
    right: [W - depthPx, 0, W, H],
  }[edge];

  // Distance (inches) from the page edge to the near side of pixel (x, y).
  // Uses the exact page size, because the canvas is rounded up to whole pixels.
  const inset = {
    top: (x, y) => y / dpi,
    bottom: (x, y) => pageIn.heightIn - (y + 1) / dpi,
    left: (x) => x / dpi,
    right: (x) => pageIn.widthIn - (x + 1) / dpi,
  }[edge];

  // Only text boxes that reach into the band matter; pad by 1px for anti-aliasing.
  const rects = render.textRects
    .map(([a, b, c, d]) => [a - 1, b - 1, c + 1, d + 1])
    .filter(([a, b, c, d]) => c > x0 && a < x1 && d > y0 && b < y1);

  const hits = { text: null, art: null };
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * W + x) * 4;
      if (Math.min(rgba[i], rgba[i + 1], rgba[i + 2]) >= threshold) continue;
      const kind = rects.some(([a, b, c, d]) => x + 1 > a && x < c && y + 1 > b && y < d) ? 'text' : 'art';
      const d = inset(x, y);
      const hit = hits[kind];
      if (!hit) {
        hits[kind] = { insetIn: d, bboxPx: [x, y, x + 1, y + 1] };
      } else {
        if (d < hit.insetIn) hit.insetIn = d;
        const b = hit.bboxPx;
        if (x < b[0]) b[0] = x;
        if (y < b[1]) b[1] = y;
        if (x + 1 > b[2]) b[2] = x + 1;
        if (y + 1 > b[3]) b[3] = y + 1;
      }
    }
  }
  return hits;
}

/**
 * Is there any ink inside a pixel rectangle (default: the whole page)?
 * @param {[number, number, number, number]} [rectPx] [x0, y0, x1, y1], clamped to the page
 */
export function hasInk(render, threshold, rectPx) {
  const { widthPx: W, heightPx: H, rgba } = render;
  const [x0, y0, x1, y1] = rectPx
    ? [Math.max(0, Math.floor(rectPx[0])), Math.max(0, Math.floor(rectPx[1])), Math.min(W, Math.ceil(rectPx[2])), Math.min(H, Math.ceil(rectPx[3]))]
    : [0, 0, W, H];
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * W + x) * 4;
      if (Math.min(rgba[i], rgba[i + 1], rgba[i + 2]) < threshold) return true;
    }
  }
  return false;
}
