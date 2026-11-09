// Cover fixture PDFs for the Phase 2 tests, built with pdf-lib and the embedded EB Garamond font.
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { embedGaramond, addImage, GARAMOND } from './make-fixtures.mjs';

const PT = 72;

/**
 * A cover PDF. `text` items are placed by centre, in inches from the top-left; `rotate` 90 = spine text.
 * `fills` are solid rectangles (x, y from the top-left, inches); `images` are placed like addImage() (bottom-left).
 * `unembedded: true` sets the text in Helvetica, which pdf-lib does not embed.
 * `outlined: true` draws the (horizontal) text as shapes, with no text layer, like a flattened Canva export;
 * `textColor` [r,g,b] 0-1 sets its colour.
 * @param {{ w:number, h:number, pages?:number, text?:Array<{ str:string, cx:number, cy:number, size?:number, rotate?:number }>,
 *   fills?:Array<{ x:number, y:number, w:number, h:number, color?:[number,number,number] }>, images?:Array<object>, unembedded?:boolean }} o
 */
export async function makeCover({ w, h, pages = 1, text = [], fills = [], images = [], unembedded = false, outlined = false, textColor = [0, 0, 0] }) {
  const doc = await PDFDocument.create();
  const font = unembedded ? await doc.embedFont(StandardFonts.Helvetica) : await embedGaramond(doc);
  for (let i = 0; i < pages; i++) {
    const page = doc.addPage([w * PT, h * PT]);
    if (i > 0) continue;
    for (const f of fills) {
      page.drawRectangle({ x: f.x * PT, y: (h - f.y - f.h) * PT, width: f.w * PT, height: f.h * PT, color: rgb(...(f.color ?? [0.2, 0.3, 0.6])) });
    }
    for (const img of images) addImage(doc, page, img);
    if (outlined) {
      for (const t of text) drawOutlined(page, h, t, textColor);
      continue;
    }
    for (const { str, cx, cy, size = 10, rotate = 0 } of text) {
      const len = font.widthOfTextAtSize(str, size);
      const x = cx * PT;
      const y = (h - cy) * PT;
      if (rotate === 90) page.drawText(str, { font, size, x: x + size * 0.35, y: y - len / 2, rotate: degrees(90) });
      else page.drawText(str, { font, size, x: x - len / 2, y: y - size * 0.35 });
    }
  }
  return doc.save();
}

let garamondShapes;
/** Text as filled glyph outlines (centre at cx, cy like drawText above): no text layer for pdf.js to find. */
function drawOutlined(page, h, { str, cx, cy, size = 10 }, color) {
  garamondShapes ??= fontkit.create(GARAMOND);
  const f = garamondShapes;
  const run = f.layout(str);
  const k = size / f.unitsPerEm;
  let pen = 0;
  let d = '';
  run.glyphs.forEach((g, i) => {
    d += g.path.translate(pen, 0).scale(1, -1).toSVG(); // font units are y-up; SVG paths are y-down
    pen += run.positions[i].xAdvance;
  });
  page.drawSvgPath(d, { x: cx * PT - (pen * k) / 2, y: (h - cy) * PT - size * 0.35, scale: k, color: rgb(...color) });
}
