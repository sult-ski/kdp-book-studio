// Tesseract.js for Node tests, with the English data from node_modules (no download, nothing cached to disk).
import { createWorker } from 'tesseract.js';
import { fileURLToPath } from 'node:url';
import { wordsFromTesseract, tesseractParams, toBmp } from '../../src/engine/cover/ocr.js';

export async function nodeOcr(specs) {
  const langPath = fileURLToPath(new URL('../../node_modules/@tesseract.js-data/eng/4.0.0_best_int/', import.meta.url));
  const worker = await createWorker('eng', 1, { langPath, cacheMethod: 'none', gzip: true });
  await worker.setParameters(tesseractParams(specs));
  const ocr = async (image) => wordsFromTesseract((await worker.recognize(Buffer.from(toBmp(image)), {}, { blocks: true, text: false })).data);
  return { ocr, close: () => worker.terminate() };
}
