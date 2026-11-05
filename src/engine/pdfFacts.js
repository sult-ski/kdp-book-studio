// Reads font and file-structure facts from a pdf-lib document.
// Checks work on these plain facts, so they stay simple and testable. No DOM.
import { PDFName, PDFDict, PDFArray, PDFStream } from 'pdf-lib';

const N = (s) => PDFName.of(s);
const nameText = (obj) => (obj instanceof PDFName ? obj.decodeText() : undefined);
const SUBSET_PREFIX = /^[A-Z]{6}\+/;

/**
 * Every font used by the pages, including fonts inside Form XObjects (placed PDFs, grouped art).
 * @param {import('pdf-lib').PDFDocument} doc
 * @returns {Array<{ name:string, subtype:string, embedded:boolean, subset:boolean, pages:number[] }>}
 */
export function readFonts(doc) {
  const ctx = doc.context;
  const fonts = new Map(); // font dict -> fact

  const walkResources = (resources, pageNo, seen) => {
    if (!(resources instanceof PDFDict) || seen.has(resources)) return;
    seen.add(resources);

    const fontDict = resources.lookup(N('Font'));
    if (fontDict instanceof PDFDict) {
      for (const [, value] of fontDict.entries()) {
        const font = ctx.lookup(value);
        if (!(font instanceof PDFDict)) continue;
        if (!fonts.has(font)) fonts.set(font, { ...describeFont(ctx, font), pages: [] });
        const pages = fonts.get(font).pages;
        if (pages[pages.length - 1] !== pageNo) pages.push(pageNo);
      }
    }

    const xobjects = resources.lookup(N('XObject'));
    if (xobjects instanceof PDFDict) {
      for (const [, value] of xobjects.entries()) {
        const xo = ctx.lookup(value);
        if (xo instanceof PDFStream && xo.dict.get(N('Subtype')) === N('Form')) {
          walkResources(xo.dict.lookup(N('Resources')), pageNo, seen);
        }
      }
    }
  };

  doc.getPages().forEach((page, i) => walkResources(page.node.Resources(), i + 1, new Set()));
  return [...fonts.values()];
}

function describeFont(ctx, font) {
  const name = nameText(font.lookup(N('BaseFont'))) ?? '(unnamed font)';
  const subtype = nameText(font.lookup(N('Subtype'))) ?? 'Unknown';
  let embedded;
  if (subtype === 'Type3') {
    embedded = true; // glyphs are drawn by the PDF itself
  } else {
    let target = font;
    if (subtype === 'Type0') {
      const desc = font.lookup(N('DescendantFonts'));
      target = desc instanceof PDFArray ? ctx.lookup(desc.get(0)) : undefined;
    }
    const fd = target instanceof PDFDict ? target.lookup(N('FontDescriptor')) : undefined;
    embedded = fd instanceof PDFDict && ['FontFile', 'FontFile2', 'FontFile3'].some((k) => fd.has(N(k)));
  }
  return { name: name.replace(SUBSET_PREFIX, ''), subtype, embedded, subset: SUBSET_PREFIX.test(name) };
}

/**
 * File-level facts: encryption, annotations per page, forms, scripts, bookmarks.
 * @param {import('pdf-lib').PDFDocument} doc
 */
export function readFileFacts(doc) {
  const ctx = doc.context;
  const catalog = doc.catalog;

  const annotations = [];
  doc.getPages().forEach((page, i) => {
    const annots = page.node.Annots();
    if (!(annots instanceof PDFArray)) return;
    for (let j = 0; j < annots.size(); j++) {
      const a = ctx.lookup(annots.get(j));
      if (a instanceof PDFDict) annotations.push({ page: i + 1, subtype: nameText(a.lookup(N('Subtype'))) ?? 'Unknown' });
    }
  });

  const acroForm = catalog.lookup(N('AcroForm'));
  const fields = acroForm instanceof PDFDict ? acroForm.lookup(N('Fields')) : undefined;
  const hasFormFields = (fields instanceof PDFArray && fields.size() > 0)
    || annotations.some((a) => a.subtype === 'Widget');

  const names = catalog.lookup(N('Names'));
  const openAction = catalog.lookup(N('OpenAction'));
  const hasJavaScript = (names instanceof PDFDict && names.has(N('JavaScript')))
    || (openAction instanceof PDFDict && openAction.lookup(N('S')) === N('JavaScript'))
    || catalog.has(N('AA'))
    || doc.getPages().some((p) => p.node.has(N('AA')));

  const outlines = catalog.lookup(N('Outlines'));
  const hasBookmarks = outlines instanceof PDFDict && outlines.has(N('First'));

  return { encrypted: doc.isEncrypted, annotations, hasFormFields, hasJavaScript, hasBookmarks };
}
