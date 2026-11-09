// Test fixture PDFs, generated with pdf-lib.
// Import the builders in tests, or run `node tests/fixtures/make-fixtures.mjs` to write them to tests/fixtures/out/.
// Later milestones add more fixtures here (tiny-margins, low-dpi, unembedded-font, ...).
import {
  PDFDocument, PDFName, PDFString, PDFHexString, StandardFonts, rgb, degrees,
  pushGraphicsState, popGraphicsState, concatTransformationMatrix, drawObject,
} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
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

// EB Garamond (SIL Open Font License 1.1), from the @fontsource/eb-garamond dev dependency.
// @fontsource only ships WOFF; pdf-lib would embed those bytes as-is (not a valid PDF font file),
// so convert to a plain TrueType file first, like a font installed on an author's computer.
export const GARAMOND = woffToTtf(readFileSync(fileURLToPath(new URL(
  '../../node_modules/@fontsource/eb-garamond/files/eb-garamond-latin-400-normal.woff', import.meta.url))));

/** WOFF 1.0 -> TTF/OTF: unpack the (zlib-compressed) tables into a plain sfnt file. */
function woffToTtf(woff) {
  const v = new DataView(woff.buffer, woff.byteOffset, woff.byteLength);
  if (v.getUint32(0) !== 0x774f4646) throw new Error('not a WOFF file');
  const numTables = v.getUint16(12);
  const tables = [];
  for (let i = 0; i < numTables; i++) {
    const e = 44 + i * 20;
    const [offset, compLength, origLength] = [v.getUint32(e + 4), v.getUint32(e + 8), v.getUint32(e + 12)];
    const raw = woff.subarray(offset, offset + compLength);
    tables.push({
      tag: v.getUint32(e), checksum: v.getUint32(e + 16),
      data: compLength < origLength ? inflateSync(raw) : raw,
    });
  }
  const pad4 = (n) => (n + 3) & ~3;
  const headerSize = 12 + numTables * 16;
  const out = new Uint8Array(headerSize + tables.reduce((s, t) => s + pad4(t.data.length), 0));
  const o = new DataView(out.buffer);
  const entrySelector = Math.floor(Math.log2(numTables));
  o.setUint32(0, v.getUint32(4)); // sfnt flavor
  o.setUint16(4, numTables);
  o.setUint16(6, 16 * 2 ** entrySelector);
  o.setUint16(8, entrySelector);
  o.setUint16(10, numTables * 16 - 16 * 2 ** entrySelector);
  let at = headerSize;
  tables.forEach((t, i) => {
    const r = 12 + i * 16;
    o.setUint32(r, t.tag); o.setUint32(r + 4, t.checksum); o.setUint32(r + 8, at); o.setUint32(r + 12, t.data.length);
    out.set(t.data, at);
    at += pad4(t.data.length);
  });
  return out;
}

/**
 * Embeds EB Garamond (a real font, so pages render real text).
 * @returns {Promise<import('pdf-lib').PDFFont>}
 */
export async function embedGaramond(doc, { subset = false } = {}) {
  doc.registerFontkit(fontkit);
  return doc.embedFont(GARAMOND, { subset });
}

/**
 * Saves the document with `font` renamed 'TAG+EBGaramond-Regular', the way InDesign and Word
 * name subset fonts (pdf-lib itself doesn't add the prefix).
 */
export async function saveWithSubsetTag(doc, font, tag = 'ABCDEF') {
  await doc.flush(); // pdf-lib writes font objects lazily; make them exist before renaming
  const name = PDFName.of(`${tag}+EBGaramond-Regular`);
  const type0 = doc.context.lookup(font.ref);
  type0.set(PDFName.of('BaseFont'), name);
  doc.context.lookup(type0.lookup(PDFName.of('DescendantFonts')).get(0)).set(PDFName.of('BaseFont'), name);
  return doc.save();
}

/**
 * Draws real, embedded text on a page.
 * @param {{ font?: import('pdf-lib').PDFFont, text?: string, x?: number, y?: number, size?: number }} [opts]
 *   x/y in inches from the bottom-left corner.
 */
export async function addEmbeddedText(doc, page, { font, text = 'The quick brown fox', x = 1.5, y = 4.5, size = 11 } = {}) {
  const f = font ?? await embedGaramond(doc);
  page.drawText(text, { font: f, x: x * PT, y: y * PT, size });
  return f;
}

const SAMPLE = 'The quick brown fox jumps over the lazy dog';

/**
 * A book with real embedded text (EB Garamond) placed so its ink sits at the given margins,
 * mirrored per page: odd pages bind on the left, even pages on the right.
 * Each page gets a line touching the top margin, one touching the inside margin, one touching the
 * outside margin, and one touching the bottom margin. Glyph shapes make the ink land within a few
 * hundredths of an inch of the requested margin.
 * @param {number} n pages
 * @param {{ trim?: [number, number], bleed?: boolean, top?: number, bottom?: number,
 *           inside?: number, outside?: number, size?: number, blank?: number[] }} [m]
 *   margins in inches from the trim line; `blank` lists page numbers to leave empty
 */
export async function makeTextBook(n, m = {}) {
  const { trim = [6, 9], bleed = false, top = 0.75, bottom = 0.75, inside = 0.75, outside = 0.75, size = 11, blank = [] } = m;
  const ext = bleed ? 0.125 : 0;
  const doc = await PDFDocument.create();
  const font = await embedGaramond(doc);
  const lineW = font.widthOfTextAtSize(SAMPLE, size) / PT; // inches
  for (let i = 0; i < n; i++) {
    const bindsLeft = i % 2 === 0; // page 1 (index 0) is a right-hand page
    const w = trim[0] + ext;
    const h = trim[1] + 2 * ext;
    const page = doc.addPage([w * PT, h * PT]);
    if (blank.includes(i + 1)) continue;
    const trimX0 = bindsLeft ? 0 : ext; // the bleed is on the outside edge only
    const left = trimX0 + (bindsLeft ? inside : outside);
    const right = trimX0 + trim[0] - (bindsLeft ? outside : inside);
    const draw = (text, x, baseline) => page.drawText(text, { font, size, x: x * PT, y: baseline * PT });
    const sz = size / PT;
    draw(SAMPLE, left, h - ext - top - 0.72 * sz);   // cap/ascender top at the top margin
    draw(SAMPLE, left, h / 2 + 0.5);                  // left edge of the text block
    draw(SAMPLE, right - lineW, h / 2);               // right edge of the text block
    draw(SAMPLE, left, ext + bottom + 0.27 * sz);     // descenders at the bottom margin
  }
  return doc.save();
}

/**
 * Draws an image of pxW x pxH pixels at w x h inches, with its bottom-left corner at (x, y) inches.
 * So its resolution is pxW / w DPI. `mask: true` makes a 1-bit stencil mask (line art).
 */
export function addImage(doc, page, { pxW, pxH, x = 1, y = 1, w, h, mask = false, gradient = false }) {
  const ctx = doc.context;
  let data;
  let dict;
  if (mask) {
    const row = Math.ceil(pxW / 8);
    data = new Uint8Array(row * pxH).map((_, i) => (Math.floor(i / row) % 2 ? 0xaa : 0x55));
    dict = { Type: 'XObject', Subtype: 'Image', Width: pxW, Height: pxH, ImageMask: true, BitsPerComponent: 1 };
  } else {
    data = gradient // a smooth left-to-right blue-to-orange blend
      ? new Uint8Array(pxW * pxH * 3).map((_, i) => { const t = (Math.floor(i / 3) % pxW) / pxW; return Math.round([40 + 200 * t, 80 + 60 * t, 200 - 160 * t][i % 3]); })
      : new Uint8Array(pxW * pxH * 3).map((_, i) => (i * 7) % 256); // a busy pattern, not a flat fill
    dict = { Type: 'XObject', Subtype: 'Image', Width: pxW, Height: pxH, ColorSpace: 'DeviceRGB', BitsPerComponent: 8 };
  }
  const ref = ctx.register(ctx.flateStream(data, dict));
  const name = page.node.newXObject('Img', ref);
  page.pushOperators(
    pushGraphicsState(),
    concatTransformationMatrix(w * PT, 0, 0, h * PT, x * PT, y * PT),
    drawObject(name),
    popGraphicsState(),
  );
}

/** Adds an annotation of the given subtype ('Text' = sticky-note comment, 'Link', 'Highlight', ...). */
export function addAnnotation(doc, page, subtype) {
  const ctx = doc.context;
  page.node.addAnnot(ctx.register(ctx.obj({ Type: 'Annot', Subtype: subtype, Rect: [72, 72, 144, 144] })));
}

/**
 * A 6" x 9" book for the deep content check: `pages` lists each page's text lines (drawn inside the margins
 * in embedded Garamond) and optional link URLs (link annotations with a URI action).
 * @param {Array<{ lines?: string[], links?: string[] }>} pages
 */
export async function makeContentBook(pages) {
  const doc = await PDFDocument.create();
  const font = await embedGaramond(doc);
  const ctx = doc.context;
  for (const { lines = [], links = [] } of pages) {
    const page = doc.addPage([6 * PT, 9 * PT]);
    lines.forEach((text, k) => page.drawText(text, { font, size: 11, x: 1 * PT, y: (8 - 0.25 * k) * PT }));
    for (const url of links) {
      page.node.addAnnot(ctx.register(ctx.obj({
        Type: 'Annot', Subtype: 'Link', Rect: [72, 72, 144, 90], Border: [0, 0, 0],
        A: { Type: 'Action', S: 'URI', URI: PDFString.of(url) },
      })));
    }
  }
  return doc.save();
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
  /** 6x9, 120 pages, no bleed, real embedded text inside safe margins: passes all checks. */
  'good-6x9-120p': () => makeTextBook(120, { inside: 0.75, outside: 0.5, top: 0.75, bottom: 0.75 }),
  /** 24 pages with text 0.15" from every edge (KDP needs 0.25" outside, 0.375" gutter). */
  'tiny-margins': () => makeTextBook(24, { top: 0.15, bottom: 0.15, inside: 0.15, outside: 0.15 }),
  /** 212 pages with text 0.31" from the binding (KDP needs 0.5" for 151-300 pages). */
  'gutter-212p': () => makeTextBook(212, { inside: 0.31, outside: 0.5, top: 0.6, bottom: 0.6 }),
  /** 120 pages at 8.5x11 when the book is set up as 6x9. */
  'wrong-size': () => makePdf(repeat(120, [8.5, 11])),
  /** 24-page text book; page 5 has a 300 x 450 px image shown at 2" x 3" = 150 DPI. */
  'low-dpi': async () => {
    const doc = await PDFDocument.load(await makeTextBook(24));
    addImage(doc, doc.getPage(4), { pxW: 300, pxH: 450, x: 2, y: 3, w: 2, h: 3 });
    return doc.save();
  },
  /** Bleed book; page 1 has a band across the top that stops at the trim line instead of the page edge. */
  'bleed-art-short': async () => {
    const doc = await PDFDocument.load(await makeTextBook(24, { bleed: true, top: 1.2 }));
    const page = doc.getPage(0);
    page.drawRectangle({ x: 0, y: (9.25 - 0.125 - 0.8) * PT, width: 6.125 * PT, height: 0.8 * PT, color: rgb(0.2, 0.4, 0.7) });
    return doc.save();
  },
  /** 24-page text book with pages 5-10 empty: 6 blank pages in a row (KDP allows 4 mid-book). */
  '6-consecutive-blanks': () => makeTextBook(24, { blank: [5, 6, 7, 8, 9, 10] }),
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
