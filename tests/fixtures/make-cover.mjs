// Cover fixture PDFs for the Phase 2 tests, built with pdf-lib and the embedded EB Garamond font.
import { PDFDocument, degrees } from 'pdf-lib';
import { embedGaramond } from './make-fixtures.mjs';

const PT = 72;

/**
 * A cover PDF. `text` items are placed by centre, in inches from the top-left; `rotate` 90 = spine text.
 * @param {{ w:number, h:number, pages?:number, text?:Array<{ str:string, cx:number, cy:number, size?:number, rotate?:number }> }} o
 */
export async function makeCover({ w, h, pages = 1, text = [] }) {
  const doc = await PDFDocument.create();
  const font = await embedGaramond(doc);
  for (let i = 0; i < pages; i++) {
    const page = doc.addPage([w * PT, h * PT]);
    if (i > 0) continue;
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
