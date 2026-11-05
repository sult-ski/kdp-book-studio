// Loads a PDF from bytes and reads basic per-page facts with pdf-lib.
// Runs in browser and Node (used by tests).
import { PDFDocument } from 'pdf-lib';

const PT_PER_INCH = 72;

/**
 * @param {Uint8Array|ArrayBuffer} bytes
 * @returns {Promise<{ pageCount:number, encrypted:boolean, pages:Array, error?:string }>}
 */
export async function loadPdf(bytes) {
  let doc;
  try {
    doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  } catch (e) {
    return { pageCount: 0, encrypted: false, pages: [], error: 'This file could not be read as a PDF.' };
  }

  const pages = doc.getPages().map((page, i) => {
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

  return { pageCount: pages.length, encrypted: doc.isEncrypted, pages };
}
