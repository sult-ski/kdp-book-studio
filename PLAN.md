# Build plan — Phase 1 (interior preflight)

Stack: Vite + vanilla JS (JSDoc types), pdf-lib + pdfjs-dist, Web Worker, vite-plugin-pwa, Netlify.

## Milestones
- [x] **M1 — Scaffold.** Upload, settings form filled from config, page count + page sizes grouped. 5 Node tests.
- [x] **M2 — Size & count checks.** `src/engine/checks/pageSize.js` (every page vs trim or trim+bleed, tolerance setting default 0.01"), `pageCount.js` (rounded up to even, vs range for trim+ink/paper; flag unavailable combos), spread detection (width ≈ 2× trim). `runChecks.js` returns issues. Plain issue list in UI. Add `tests/fixtures/make-fixtures.mjs`.
- [ ] **M3 — Fonts & file rules.** pdf-lib: walk page Resources → Font; check FontDescriptor FontFile/FontFile2/FontFile3 (follow Type0 → DescendantFonts; Type3 = embedded; `ABCDEF+` prefix = subset → info). File rules: encrypted, Annots, AcroForm, JavaScript (Names/OpenAction), Outlines/bookmarks, size > 650 MB.
- [ ] **M4 — Worker + margins.** Add pdfjs-dist. Move engine into `src/worker/preflight.worker.js` with progress events. Render each page at ~100 DPI to OffscreenCanvas, find non-white ink bounds; label regions with pdf.js text positions. Margin check: top/bottom/outside min by bleed, gutter by page count, mirrored per page side. Return bbox for highlighting.
- [ ] **M5 — Image DPI.** pdf.js operator list: track CTM, on paintImageXObject compute displayed size; DPI = pixels ÷ inches. <300 warn (KDP), <200 fail (OUR rule). Inline images/masks/patterns = best-effort.
- [ ] **M6 — Bleed & blank pages.** No bleed + ink within 0.02" of edge → warn. Bleed on + edge art stopping at trim line → warn (best-effort). Blank pages: >4 consecutive at start/middle or >10 at end → fail. Min 7 pt font (best-effort). Transparency → advisory info only.
- [ ] **M7 — Report UI.** Verdict + counts, "Whole book" then per-page cards, thumbnail with unsafe zone shaded and issue bbox outlined, Fails-only filter, "Why" link to source, download JSON report. Mobile-first.
- [ ] **M8 — Ship.** PWA (vite-plugin-pwa), privacy note, Netlify deploy, test on one real KDP-approved book.

## Test fixtures (generated with pdf-lib)
good-6x9-120p (passes all) · wrong-size · tiny-margins (text at 0.15") · gutter-212p (text 0.31" from binding → needs 0.5") · low-dpi (150 DPI) · unembedded-font · bleed-art-short · 6-consecutive-blanks · annotated · encrypted

## Not supported yet
Crop/trim mark detection.

## Later phases (design so they plug in; don't build)
P2 cover checker + spine calculator · P3 auto-fix (resize, add bleed, cover template; uses issue `fixId`) · P4 listing guard · P5 AI writing studio.
