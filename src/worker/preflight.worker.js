// Runs the whole preflight off the main thread, so the page stays responsive on big books.
// Messages in:  { bytes: Uint8Array, settings }
// Messages out: { type: 'progress', done, total } | { type: 'result', summary, issues } | { type: 'error', message }
import * as pdfjs from 'pdfjs-dist';
import * as pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs';
import specs from '../config/kdp-specs.json';
import { preflight } from '../engine/preflight.js';

// We are already in a worker: run pdf.js's parser in this same thread instead of starting another worker.
globalThis.pdfjsWorker = pdfjsWorker;

/** pdf.js's default canvas factory needs `document`; workers have OffscreenCanvas instead. */
class OffscreenCanvasFactory {
  create(width, height) {
    if (width <= 0 || height <= 0) throw new Error('Invalid canvas size');
    const canvas = new OffscreenCanvas(width, height);
    return { canvas, context: canvas.getContext('2d', { willReadFrequently: true }) };
  }

  reset(target, width, height) {
    target.canvas.width = width;
    target.canvas.height = height;
  }

  destroy(target) {
    target.canvas.width = 0;
    target.canvas.height = 0;
    target.canvas = null;
    target.context = null;
  }

  getNoAlphaContext(canvas) {
    return canvas.getContext('2d', { alpha: false, willReadFrequently: true });
  }
}

/** pdf.js's default filter factory builds SVG filters in `document`. Workers can't, so skip them. */
class NoFilterFactory {
  addFilter() { return 'none'; }
  addHCMFilter() { return 'none'; }
  addAlphaFilter() { return 'none'; }
  addLuminosityFilter() { return 'none'; }
  addKnockoutFilter() { return 'none'; }
  addHighlightHCMFilter() { return 'none'; }
  addSelectionHCMFilter() { return 'none'; }
  addSelectionFilter() { return 'none'; }
  createSelectionStyle() { return ''; }
  destroy() {}
}

const assets = new URL(`${import.meta.env.BASE_URL}pdfjs/`, self.location.origin).href;

self.onmessage = async ({ data: { bytes, settings } }) => {
  try {
    const result = await preflight(specs, bytes, settings, {
      pdfjs,
      docOptions: {
        CanvasFactory: OffscreenCanvasFactory,
        FilterFactory: NoFilterFactory,
        disableFontFace: true, // draw glyphs as outlines; FontFace needs `document`
        isOffscreenCanvasSupported: true,
        verbosity: pdfjs.VerbosityLevel.ERRORS, // hide the expected "Setting up fake worker" notice
        useWorkerFetch: true, // set explicitly: pdf.js's default reads document.baseURI
        standardFontDataUrl: `${assets}standard_fonts/`,
        cMapUrl: `${assets}cmaps/`,
        wasmUrl: `${assets}wasm/`,
      },
      onProgress: ({ done, total }) => self.postMessage({ type: 'progress', done, total }),
    });
    if (result.error) self.postMessage({ type: 'error', message: result.error });
    else self.postMessage({ type: 'result', summary: result.summary, issues: result.issues });
  } catch (e) {
    console.error(e);
    self.postMessage({ type: 'error', message: 'Something went wrong while checking this file. Please try again, or try re-exporting the PDF.' });
  }
};
