// Tesseract.js in the browser, loaded only when a cover panel has no real text. Everything comes from our own
// origin (public/ocr/, see scripts/copy-pdfjs-assets.mjs): no CDN, and the picture never leaves the device.
// Once used, the files are kept by the service worker, so OCR also works offline.
import { wordsFromTesseract, tesseractParams } from '../engine/cover/ocr.js';

/** @returns {Promise<{ ocr:(image:{width,height,rgba})=>Promise<Array>, close:()=>Promise<void> }>} */
export async function browserOcr(specs) {
  const { createWorker } = await import('tesseract.js');
  const base = new URL(`${import.meta.env.BASE_URL}ocr/`, self.location.origin).href;
  const worker = await createWorker('eng', 1, {
    workerPath: `${base}worker.min.js`,
    corePath: `${base}core/`,
    langPath: `${base}lang/`,
    workerBlobURL: false, // our Content-Security-Policy allows workers from 'self' only, not blob: URLs
    gzip: false, // eng.traineddata is stored unzipped; the host compresses it on the wire (see the assets script)
    cacheMethod: 'none', // the service worker caches the files; no second copy in IndexedDB
    // Without a handler Tesseract throws its errors uncaught, killing the whole check. With one, the failed call
    // still rejects, so the cover is checked without OCR (see coverWithOcr in preflight.worker.js).
    errorHandler: (e) => console.warn('Text reader (OCR):', e),
  });
  await worker.setParameters(tesseractParams(specs));
  return {
    ocr: async (image) => wordsFromTesseract((await worker.recognize(await toPng(image), {}, { blocks: true, text: false })).data),
    close: () => worker.terminate(),
  };
}

/** PNG of an RGBA image (Tesseract's BMP reader needs Node's Buffer, so the browser sends PNG). */
function toPng({ width, height, rgba }) {
  const canvas = new OffscreenCanvas(width, height);
  canvas.getContext('2d').putImageData(new ImageData(rgba, width, height), 0, 0);
  return canvas.convertToBlob({ type: 'image/png' });
}
