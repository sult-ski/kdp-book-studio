// Cover zone overlay: KDP's guides (bleed, fold lines, safe areas, barcode box) drawn over the cover thumbnail,
// plus an outline around each located problem. Returns SVG markup only (no DOM), in the cover's own inches.

const r = (n) => Math.round(n * 1000) / 1000;

/**
 * @param {object} L coverLayout() result (the size KDP expects)
 * @param {{ widthIn:number, heightIn:number }} page the uploaded cover's real size
 * @param {Array<object>} issues issues to outline (those with a bbox)
 * @param {{ guides?:boolean }} opts guides=false draws only the outlines (cover size is wrong, so guides would mislead)
 * @returns {string} SVG child elements, viewBox "0 0 page.widthIn page.heightIn"
 */
export function coverOverlaySvg(L, page, issues, { guides = true } = {}) {
  const W = page.widthIn;
  const H = page.heightIn;
  let out = '';
  if (guides) {
    // Within tolerance the page can differ from L by a hair: stretch the guides to the real page.
    const sx = W / L.widthIn;
    const sy = H / L.heightIn;
    const box = (q, cls) => `<rect class="${cls}" x="${r(q.x * sx)}" y="${r(q.y * sy)}" width="${r(q.width * sx)}" height="${r(q.height * sy)}"/>`;
    const b = L.bleedIn;
    const { backSafe, frontSafe, spineSafe, barcode } = L.rects;
    // Bleed band: the strip that is cut off, hatched like the interior's no-go zones.
    out += `<path class="ov-bleed" fill-rule="evenodd" d="M0 0H${r(W)}V${r(H)}H0Z M${r(b * sx)} ${r(b * sy)}H${r(W - b * sx)}V${r(H - b * sy)}H${r(b * sx)}Z"/>`;
    out += L.folds.map((f) => box(f.band, 'ov-fold')).join('');
    out += box(backSafe, 'ov-safe') + box(frontSafe, 'ov-safe');
    if (L.spineText.allowed && spineSafe.width > 0) out += box(spineSafe, 'ov-safe');
    out += box(barcode, 'ov-barcode');
    out += L.folds.map((f) => `<line class="ov-trim" x1="${r(f.x * sx)}" y1="${r(b * sy)}" x2="${r(f.x * sx)}" y2="${r(H - b * sy)}"/>`).join('');
    out += `<rect class="ov-trim" x="${r(b * sx)}" y="${r(b * sy)}" width="${r(W - 2 * b * sx)}" height="${r(H - 2 * b * sy)}"/>`;
  }
  // Outlines stay visible at any preview size: sized relative to a 9" tall cover.
  const k = H / 9;
  const pad = 0.06 * k;
  out += issues.filter((i) => i.bbox).map((i) => {
    const q = i.bbox;
    const x = Math.max(0, q.x - pad);
    const y = Math.max(0, q.y - pad);
    return `<rect class="mark" data-sev="${i.severity}" x="${r(x)}" y="${r(y)}" width="${r(Math.min(W - x, q.width + 2 * pad))}" height="${r(Math.min(H - y, q.height + 2 * pad))}" rx="${r(0.06 * k)}" stroke-width="${r(0.06 * k)}"/>`;
  }).join('');
  return out;
}

/** Guides are drawn only when the cover is the size KDP expects (no coverSize fail). */
export const guidesFit = (issues) => !issues.some((i) => i.checkId === 'coverSize' && i.severity === 'fail');
