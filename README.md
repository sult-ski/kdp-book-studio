# KDP Book Studio — Preflight Checker

Checks a paperback interior PDF against Amazon KDP rules, 100% in the browser.

## Run
```
npm install
npm run dev     # open the local URL
npm test        # engine tests (Node 18+)
```

## Where things live
- `src/config/kdp-specs.json` — every KDP rule, with source URL and last-verified date. Edit specs here only.
- `src/engine/` — PDF reading and checks. No UI code; runs in Node tests and in the worker.
- `src/worker/preflight.worker.js` — runs the engine off the main thread (pdf.js in the same worker thread, OffscreenCanvas).
- `public/pdfjs/` — pdf.js fonts, cmaps and image decoders, copied from node_modules by `npm run assets` (runs before dev/build; git-ignored).
- `src/ui/` — styles (UI logic in `src/main.js` for now).

## Status
Milestones 2–6: page size (vs trim or trim + bleed, with tolerance), spread detection and page count checks; fonts embedded (including inside placed PDFs); file rules (encryption, 650 MB limit, comments, links, forms, bookmarks, JavaScript). Milestone 4: checks run in a Web Worker with a progress bar; each page is rendered with pdf.js at 100 DPI and text/art inside the top, bottom, outside or gutter margin is reported (mirrored per page, measured from the trim line with bleed). Milestone 5: image resolution from pdf.js operator lists (pixels ÷ printed inches, including images inside placed PDFs); below 300 DPI warns (KDP), below 200 DPI is labelled very low (our threshold). Milestone 6: bleed art at the page edges, runs of blank pages, text under 7 pt and transparency notes. Shown as a plain issue list. `npm run fixtures` writes test PDFs to `tests/fixtures/out/`.
