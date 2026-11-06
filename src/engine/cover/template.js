// A one-page PDF cover template at the exact full cover size, with guides: bleed, trim, fold lines,
// safe areas, spine text area and the barcode box. Authors put their artwork on top in their design app.
// pdf-lib only; no DOM, so it runs in the browser and in Node tests.
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';
import { coverLayout } from './layout.js';

const PT = 72;
const COLOR = {
  bleed: rgb(0.98, 0.86, 0.87),   // pale red: will be trimmed off
  fold: rgb(0.88, 0.89, 0.93),    // pale grey: the fold can land anywhere in here
  trim: rgb(0.11, 0.13, 0.19),
  safe: rgb(0.12, 0.44, 0.66),    // blue: keep text inside
  barcode: rgb(0.35, 0.25, 0.78), // violet box: keep empty
  text: rgb(0.11, 0.13, 0.19),
  muted: rgb(0.33, 0.37, 0.44),
};
const r3 = (n) => (Math.round(n * 1000 + 1e-6) / 1000).toString(); // epsilon: 11.4075 must show as 11.408

/**
 * @param {object} specs
 * @param {{ trim:string, inkPaper:string, pages:number }} settings
 * @returns {Promise<Uint8Array>}
 */
export async function makeCoverTemplate(specs, settings) {
  const L = coverLayout(specs, settings);
  const W = L.widthIn;
  const H = L.heightIn;
  const doc = await PDFDocument.create();
  doc.setTitle(`KDP cover template ${settings.trim.replace('x', '" x ')}", ${settings.pages} pages`);
  doc.setCreator('KDP Book Studio');
  doc.setProducer('KDP Book Studio (pdf-lib)');
  const page = doc.addPage([W * PT, H * PT]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  // Inches, top-left origin -> PDF points, bottom-left origin.
  const box = (r, opts) => page.drawRectangle({ x: r.x * PT, y: (H - r.y - r.height) * PT, width: r.width * PT, height: r.height * PT, ...opts });
  const line = (x1, y1, x2, y2, opts) => page.drawLine({ start: { x: x1 * PT, y: (H - y1) * PT }, end: { x: x2 * PT, y: (H - y2) * PT }, ...opts });
  const text = (str, x, y, { size = 9, f = font, color = COLOR.text, center = false, rotate = 0 } = {}) => {
    const w = f.widthOfTextAtSize(str, size);
    if (rotate) {
      // Rotated 90° (reads bottom to top), centred on (x, y).
      page.drawText(str, { x: x * PT + size * 0.35, y: (H - y) * PT - w / 2, size, font: f, color, rotate: degrees(rotate) });
    } else {
      page.drawText(str, { x: x * PT - (center ? w / 2 : 0), y: (H - y) * PT - size * 0.35, size, font: f, color });
    }
  };

  const { back, spine, front, backSafe, frontSafe, spineSafe, barcode } = L.rects;
  const b = L.bleedIn;

  // Bleed: everything outside the trim gets cut off.
  box({ x: 0, y: 0, width: W, height: b }, { color: COLOR.bleed });
  box({ x: 0, y: H - b, width: W, height: b }, { color: COLOR.bleed });
  box({ x: 0, y: b, width: b, height: H - 2 * b }, { color: COLOR.bleed });
  box({ x: W - b, y: b, width: b, height: H - 2 * b }, { color: COLOR.bleed });

  // Fold variance bands, then the trim and fold lines.
  for (const f of L.folds) box({ ...f.band, y: b, height: H - 2 * b }, { color: COLOR.fold, opacity: 0.9 });
  box({ x: b, y: b, width: W - 2 * b, height: H - 2 * b }, { borderColor: COLOR.trim, borderWidth: 0.75 });
  for (const f of L.folds) line(f.x, b, f.x, H - b, { color: COLOR.trim, thickness: 0.75 });

  // Safe areas (dashed blue).
  const dashed = { borderColor: COLOR.safe, borderWidth: 1, borderDashArray: [4, 3] };
  box(backSafe, dashed);
  box(frontSafe, dashed);
  if (L.spineText.allowed && spineSafe.width > 0) box(spineSafe, dashed);

  // Barcode box: white, outlined.
  box(barcode, { color: rgb(1, 1, 1), borderColor: COLOR.barcode, borderWidth: 1, borderDashArray: [3, 2] });
  const bcx = barcode.x + barcode.width / 2;
  text('Barcode area', bcx, barcode.y + barcode.height / 2 - 0.12, { size: 8, f: bold, color: COLOR.barcode, center: true });
  text(`${r3(barcode.width)}" x ${r3(barcode.height)}", keep empty`, bcx, barcode.y + barcode.height / 2 + 0.06, { size: 7, color: COLOR.barcode, center: true });
  text('KDP prints the barcode here', bcx, barcode.y + barcode.height / 2 + 0.22, { size: 7, color: COLOR.barcode, center: true });

  // Panel names.
  text('BACK COVER', back.x + back.width / 2, back.y + back.height / 2, { size: 14, f: bold, color: COLOR.muted, center: true });
  text('FRONT COVER', front.x + front.width / 2, front.y + front.height / 2, { size: 14, f: bold, color: COLOR.muted, center: true });
  const spineSize = Math.max(2, Math.min(9, spine.width * PT * 0.55));
  text('SPINE', spine.x + spine.width / 2, spine.y + spine.height / 2, { size: spineSize, f: bold, color: COLOR.muted, rotate: 90 });

  // Guide notes inside the back cover's safe area, top left.
  const ink = specs.pageCount.inkPaperTypes[settings.inkPaper] ?? settings.inkPaper;
  const notes = [
    [`${settings.trim.replace('x', '" x ')}" trim, ${settings.pages} pages, ${ink.toLowerCase()}`, bold],
    [`Full cover ${r3(W)}" x ${r3(H)}" (with ${b}" bleed). Spine ${r3(L.spineIn)}".`, font],
    ['Pink edge: bleed, cut off. Black line: trim. Grey bands: where the spine may fold.', font],
    [`Safe area (dashed blue): keep text ${specs.cover.safeArea.textMarginIn}" inside the trim.`, font],
    [L.spineText.allowed
      ? `Spine text: keep it ${specs.cover.spineText.clearanceIn}" clear of each fold.`
      : `No spine text: KDP needs at least ${L.spineText.minPages} pages.`, font],
    ['Delete or hide these guides before you upload your cover.', bold],
  ];
  // 7 pt, or smaller if the longest line wouldn't fit across the back cover's safe area (small trims).
  const widest = Math.max(...notes.map(([str, f]) => f.widthOfTextAtSize(str, 7)));
  const size = Math.min(7, (7 * (backSafe.width - 0.1) * PT) / widest);
  notes.forEach(([str, f], i) => text(str, backSafe.x + 0.05, backSafe.y + 0.15 + i * size * 0.024, { size, f, color: COLOR.text }));

  return doc.save();
}
