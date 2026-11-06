// Runs the whole preflight off the main thread, so the page stays responsive on big books.
// Messages in:  { mode?: 'interior' | 'cover', bytes: Uint8Array, settings }
// Messages out: { type: 'progress', done, total } | { type: 'thumb', page, blob }
//             | { type: 'result', summary, issues, pages, layout? } | { type: 'error', message }
import * as pdfjs from 'pdfjs-dist';
import * as pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs';
import specs from '../config/kdp-specs.json';
import { preflight } from '../engine/preflight.js';
import { preflightCover } from '../engine/cover/preflightCover.js';

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

const THUMB_WIDTH_PX = 320; // interior pages: shown at up to 160 CSS px, sharp on 2x screens
const COVER_THUMB_WIDTH_PX = 1000; // the whole cover: shown up to ~500 CSS px wide

/** A small image of a rendered page for the report (only pages with issues, or the cover). */
async function thumbnail(render, width = THUMB_WIDTH_PX) {
  const w = Math.min(width, render.widthPx);
  const full = new OffscreenCanvas(render.widthPx, render.heightPx);
  full.getContext('2d').putImageData(new ImageData(render.rgba, render.widthPx, render.heightPx), 0, 0);
  const scale = w / render.widthPx;
  const small = new OffscreenCanvas(w, Math.round(render.heightPx * scale));
  const ctx = small.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(full, 0, 0, small.width, small.height);
  return small.convertToBlob({ type: 'image/webp', quality: 0.8 }); // browsers without WebP fall back to PNG
}

const assets = new URL(`${import.meta.env.BASE_URL}pdfjs/`, self.location.origin).href;

self.onmessage = async ({ data: { mode = 'interior', bytes, settings } }) => {
  try {
    const docOptions = {
      CanvasFactory: OffscreenCanvasFactory,
      FilterFactory: NoFilterFactory,
      disableFontFace: true, // draw glyphs as outlines; FontFace needs `document`
      isOffscreenCanvasSupported: true,
      verbosity: pdfjs.VerbosityLevel.ERRORS, // hide the expected "Setting up fake worker" notice
      useWorkerFetch: true, // set explicitly: pdf.js's default reads document.baseURI
      standardFontDataUrl: `${assets}standard_fonts/`,
      cMapUrl: `${assets}cmaps/`,
      wasmUrl: `${assets}wasm/`,
    };
    const onPage = (width) => async ({ page, render }) => {
      try {
        self.postMessage({ type: 'thumb', page: page.number, blob: await thumbnail(render, width) });
      } catch (e) {
        console.error(`Could not make a thumbnail for page ${page.number}:`, e); // the report works without it
      }
    };
    const result = mode === 'cover'
      ? await preflightCover(specs, bytes, settings, { pdfjs, docOptions, onPage: onPage(COVER_THUMB_WIDTH_PX) })
      : await preflight(specs, bytes, settings, {
        pdfjs,
        docOptions,
        onProgress: ({ done, total }) => self.postMessage({ type: 'progress', done, total }),
        onPage: onPage(THUMB_WIDTH_PX),
      });
    if (result.error) self.postMessage({ type: 'error', message: result.error });
    else self.postMessage({ type: 'result', summary: result.summary, issues: result.issues, pages: result.pages, layout: result.layout });
  } catch (e) {
    console.error(e);
    self.postMessage({ type: 'error', message: 'Something went wrong while checking this file. Please try again, or try re-exporting the PDF.' });
  }
};
