// Test fixture PDFs, generated with pdf-lib.
// Import the builders in tests, or run `node tests/fixtures/make-fixtures.mjs` to write them to tests/fixtures/out/.
// Later milestones add more fixtures here (tiny-margins, low-dpi, unembedded-font, ...).
import { PDFDocument, rgb, degrees } from 'pdf-lib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PT = 72;

/**
 * A PDF whose pages have the given sizes (inches). Each page gets a grey block well inside
 * the safe area (1" from every edge) so it is not blank and has no margin problems.
 * @param {Array<[number, number]>} sizesIn
 * @param {{ rotate?: Record<number, number> }} [opts] page index -> rotation degrees
 */
export async function makePdf(sizesIn, opts = {}) {
  const doc = await PDFDocument.create();
  sizesIn.forEach(([w, h], i) => {
    const page = doc.addPage([w * PT, h * PT]);
    const inset = Math.min(1, w / 4, h / 4) * PT;
    page.drawRectangle({
      x: inset, y: inset, width: w * PT - 2 * inset, height: h * PT - 2 * inset,
      color: rgb(0.85, 0.85, 0.85),
    });
    if (opts.rotate?.[i]) page.setRotation(degrees(opts.rotate[i]));
  });
  return doc.save();
}

const repeat = (n, size) => Array.from({ length: n }, () => size);

/** Named fixtures from PLAN.md. */
export const fixtures = {
  /** 6x9, 120 pages, no bleed: passes all checks. */
  'good-6x9-120p': () => makePdf(repeat(120, [6, 9])),
  /** 120 pages at 8.5x11 when the book is set up as 6x9. */
  'wrong-size': () => makePdf(repeat(120, [8.5, 11])),
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const outDir = new URL('./out/', import.meta.url);
  mkdirSync(outDir, { recursive: true });
  for (const [name, build] of Object.entries(fixtures)) {
    writeFileSync(new URL(`${name}.pdf`, outDir), await build());
    console.log('wrote', `tests/fixtures/out/${name}.pdf`);
  }
}
