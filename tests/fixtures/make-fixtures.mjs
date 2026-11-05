// Test fixture PDFs, generated with pdf-lib.
// Import the builders in tests, or run `node tests/fixtures/make-fixtures.mjs` to write them to tests/fixtures/out/.
// Later milestones add more fixtures here (tiny-margins, low-dpi, unembedded-font, ...).
import { PDFDocument, PDFName, PDFString, PDFHexString, StandardFonts, rgb, degrees } from 'pdf-lib';
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

/** 6x9 pages with a grey block, as a PDFDocument (not yet saved) so tests can add things to it. */
export async function makeDoc(n = 24) {
  return PDFDocument.load(await makePdf(repeat(n, [6, 9])));
}

/**
 * Adds a font that counts as embedded (a FontDescriptor with a FontFile2 stream) to a page's resources.
 * The font program is dummy bytes: enough for structure checks, not for rendering.
 * @param {{ name?:string, type0?:boolean }} [opts] name like 'ABCDEF+Garamond' marks a subset
 */
export function addEmbeddedFont(doc, page, { name = 'Garamond', type0 = false } = {}) {
  const ctx = doc.context;
  const fontFile = ctx.register(ctx.flateStream(new Uint8Array([0, 1, 0, 0])));
  const descriptor = ctx.register(ctx.obj({
    Type: 'FontDescriptor', FontName: name, Flags: 32, FontBBox: [0, 0, 1000, 1000],
    ItalicAngle: 0, Ascent: 800, Descent: -200, CapHeight: 700, StemV: 80, FontFile2: fontFile,
  }));
  let font;
  if (type0) {
    const cid = ctx.register(ctx.obj({
      Type: 'Font', Subtype: 'CIDFontType2', BaseFont: name, FontDescriptor: descriptor,
      CIDSystemInfo: { Registry: PDFString.of('Adobe'), Ordering: PDFString.of('Identity'), Supplement: 0 },
    }));
    font = ctx.register(ctx.obj({ Type: 'Font', Subtype: 'Type0', BaseFont: name, Encoding: 'Identity-H', DescendantFonts: [cid] }));
  } else {
    font = ctx.register(ctx.obj({ Type: 'Font', Subtype: 'TrueType', BaseFont: name, FontDescriptor: descriptor }));
  }
  page.node.setFontDictionary(PDFName.of(`F${name.replace(/\W/g, '')}`), font);
  return font;
}

/** Adds an annotation of the given subtype ('Text' = sticky-note comment, 'Link', 'Highlight', ...). */
export function addAnnotation(doc, page, subtype) {
  const ctx = doc.context;
  page.node.addAnnot(ctx.register(ctx.obj({ Type: 'Annot', Subtype: subtype, Rect: [72, 72, 144, 144] })));
}

/** Marks the file as encrypted (an /Encrypt entry in the trailer). Content is not actually scrambled. */
export function markEncrypted(doc) {
  const ctx = doc.context;
  ctx.trailerInfo.Encrypt = ctx.register(ctx.obj({
    Filter: 'Standard', V: 1, R: 2, P: -4,
    O: PDFHexString.of('00'.repeat(32)), U: PDFHexString.of('00'.repeat(32)),
  }));
}

/** Adds a one-entry bookmark outline. */
export function addBookmark(doc) {
  const ctx = doc.context;
  const outlines = ctx.register(ctx.obj({ Type: 'Outlines', Count: 1 }));
  const item = ctx.register(ctx.obj({
    Title: PDFString.of('Chapter 1'), Parent: outlines, Dest: [doc.getPage(0).ref, 'Fit'],
  }));
  const dict = ctx.lookup(outlines);
  dict.set(PDFName.of('First'), item);
  dict.set(PDFName.of('Last'), item);
  doc.catalog.set(PDFName.of('Outlines'), outlines);
}

/** Named fixtures from PLAN.md. */
export const fixtures = {
  /** 6x9, 120 pages, no bleed: passes all checks. */
  'good-6x9-120p': () => makePdf(repeat(120, [6, 9])),
  /** 120 pages at 8.5x11 when the book is set up as 6x9. */
  'wrong-size': () => makePdf(repeat(120, [8.5, 11])),
  /** 24 pages; Helvetica text on pages 3-5. pdf-lib never embeds its standard fonts. */
  'unembedded-font': async () => {
    const doc = await makeDoc();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    for (const i of [2, 3, 4]) {
      doc.getPage(i).drawText('Chapter text', { x: 1.5 * PT, y: 4.5 * PT, size: 11, font });
    }
    return doc.save();
  },
  /** 24 pages; a sticky-note comment on page 2, a highlight on page 2, a link on page 4. */
  annotated: async () => {
    const doc = await makeDoc();
    addAnnotation(doc, doc.getPage(1), 'Text');
    addAnnotation(doc, doc.getPage(1), 'Highlight');
    addAnnotation(doc, doc.getPage(3), 'Link');
    return doc.save();
  },
  /** 24 pages with an /Encrypt dictionary. */
  encrypted: async () => {
    const doc = await makeDoc();
    markEncrypted(doc);
    return doc.save();
  },
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const outDir = new URL('./out/', import.meta.url);
  mkdirSync(outDir, { recursive: true });
  for (const [name, build] of Object.entries(fixtures)) {
    writeFileSync(new URL(`${name}.pdf`, outDir), await build());
    console.log('wrote', `tests/fixtures/out/${name}.pdf`);
  }
}
