// Loads a PDF from bytes and reads per-page and file facts with pdf-lib.
// Runs in browser and Node (used by tests).
import { PDFDocument } from 'pdf-lib';
import { readFonts, readFileFacts } from './pdfFacts.js';

const PT_PER_INCH = 72;

/**
 * @param {Uint8Array|ArrayBuffer} bytes
 * @returns {Promise<{ pageCount:number, encrypted:boolean, sizeBytes:number, pages:Array,
 *   fonts:Array|null, file:object|null, factErrors:string[], error?:string }>}
 */
export async function loadPdf(bytes) {
  const sizeBytes = bytes.byteLength;
  let doc;
  let pdfPages;
  try {
    doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
    // pdf-lib parses damaged files leniently; the page tree is where they actually fail.
    pdfPages = doc.getPages();
    if (pdfPages.length === 0) throw new Error('no pages');
  } catch (e) {
    const error = looksEncrypted(bytes)
      ? 'This PDF is locked or encrypted, so it could not be opened. KDP does not accept locked files either. Remove the password or security in your PDF tool, then export again.'
      : 'This file could not be read as a PDF. It may be damaged; try exporting it again.';
    return { pageCount: 0, encrypted: false, sizeBytes, pages: [], fonts: null, file: null, factErrors: [], error };
  }

  const pages = pdfPages.map((page, i) => {
    // KDP prints the visible area: CropBox, which pdf-lib falls back to MediaBox when missing.
    const box = page.getCropBox();
    const rotation = ((page.getRotation().angle % 360) + 360) % 360;
    const sideways = rotation === 90 || rotation === 270;
    const wIn = box.width / PT_PER_INCH;
    const hIn = box.height / PT_PER_INCH;
    return {
      number: i + 1,
      // Page 1 is a right-hand (recto) page; binding edge is on the left for odd pages.
      side: (i + 1) % 2 === 1 ? 'right' : 'left',
      rotation,
      widthIn: sideways ? hIn : wIn,
      heightIn: sideways ? wIn : hIn,
    };
  });

  // A damaged structure shouldn't sink the whole report: record which facts couldn't be read.
  const factErrors = [];
  const attempt = (label, fn) => {
    try { return fn(); } catch { factErrors.push(label); return null; }
  };
  const fonts = attempt('fonts', () => readFonts(doc));
  const file = attempt('file', () => readFileFacts(doc));

  return { pageCount: pages.length, encrypted: doc.isEncrypted, sizeBytes, pages, fonts, file, factErrors };
}

/** Looks for an /Encrypt entry in the first and last 1 MB (where trailers live). */
function looksEncrypted(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const span = 1024 * 1024;
  const decode = (a) => new TextDecoder('latin1').decode(a);
  return decode(u8.subarray(0, span)).includes('/Encrypt')
    || decode(u8.subarray(Math.max(0, u8.length - span))).includes('/Encrypt');
}
