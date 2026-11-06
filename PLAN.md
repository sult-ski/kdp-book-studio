# Build plan — Phase 1 (interior preflight)

Stack: Vite + vanilla JS (JSDoc types), pdf-lib + pdfjs-dist, Web Worker, vite-plugin-pwa, Vercel (owner changed from Netlify, Nov 2026).

## Milestones
- [x] **M1 — Scaffold.** Upload, settings form filled from config, page count + page sizes grouped. 5 Node tests.
- [x] **M2 — Size & count checks.** `src/engine/checks/pageSize.js` (every page vs trim or trim+bleed, tolerance setting default 0.01"), `pageCount.js` (rounded up to even, vs range for trim+ink/paper; flag unavailable combos), spread detection (width ≈ 2× trim). `runChecks.js` returns issues. Plain issue list in UI. Add `tests/fixtures/make-fixtures.mjs`.
- [x] **M3 — Fonts & file rules.** pdf-lib: walk page Resources → Font; check FontDescriptor FontFile/FontFile2/FontFile3 (follow Type0 → DescendantFonts; Type3 = embedded; `ABCDEF+` prefix = subset → info). File rules: encrypted, Annots, AcroForm, JavaScript (Names/OpenAction), Outlines/bookmarks, size > 650 MB.
- [x] **M4 — Worker + margins.** Add pdfjs-dist. Move engine into `src/worker/preflight.worker.js` with progress events. Render each page at ~100 DPI to OffscreenCanvas, find non-white ink bounds; label regions with pdf.js text positions. Margin check: top/bottom/outside min by bleed, gutter by page count, mirrored per page side. Return bbox for highlighting.
- [x] **M5 — Image DPI.** pdf.js operator list: track CTM, on paintImageXObject compute displayed size; DPI = pixels ÷ inches. <300 warn (KDP), <200 warn as "very low" (OUR rule; owner re-tiered Nov 2026: KDP doesn't block low DPI). Inline images/masks/patterns = best-effort.
- [x] **M6 — Bleed & blank pages.** No bleed + art within 0.02" of edge → warn. Bleed on + edge art stopping short of the bleed edge → info (best-effort). Blank pages: >4 consecutive at start/middle or >10 at end → warn (owner: manual review may flag). Text under 7 pt → warn (best-effort). Transparency → advisory info only.
- [x] **M7 — Report UI.** Verdict + counts, "Whole book" then per-page cards, thumbnail with unsafe zone shaded and issue bbox outlined, Fails-only filter, "Why" link to source, download JSON report. Mobile-first.
- [x] **M8 — Ship.** PWA (vite-plugin-pwa), privacy note, Vercel deploy (Vercel CLI, project kdp-book-studio; ask before the first production deploy), test on one real KDP-approved book (owner confirmed "Ready for KDP" on the live site, Nov 2026).
- [x] **M9 — UI redesign.** Premium, simple SaaS look; no engine changes. Self-hosted Inter (@fontsource), neutral palette + one accent, subtle static iridescent background. Hero with value statement, 3 steps, trust badges. Form in one card with custom selects, file picker and bleed toggle (44px targets). Results summary-first: verdict card, one expandable row per issue grouped Must fix / Worth checking / Good to know (collapsed), collapsed "Check details". Short footer. Verify at desktop and 360px.

## Phase 2: Cover checker + calculator (owner-verified specs, Nov 2026)
Tabs alongside the interior checker, same design system, 100% client-side. Specs in `kdp-specs.json` → `cover`.
- [x] **C1 — Tabs + Calculator.** Spine width, full cover size, to-scale diagram, downloadable PDF template with guides (trim, bleed, safe area, spine, barcode box).
- [x] **C2 — Cover size + spine check.** Cover tab: upload cover PDF, compare its size to the calculated size (tolerance), spine text only from 79 pages.
- [ ] **C3 — Safe area, spine text and fold lines.** Reuse render-and-scan: text outside safe area (fail), text within 0.0625" of fold lines (warn), spine text too close to spine edge (warn).
- [ ] **C4 — Fonts, DPI, barcode.** Reuse the interior engine for fonts and image DPI; text under 7 pt; barcode area check (best-effort info).
- [ ] **C5 — Cover report UI.** Zone overlay thumbnail; real-cover test with the owner's own book cover.

## Test fixtures (generated with pdf-lib)
good-6x9-120p (passes all) · wrong-size · tiny-margins (text at 0.15") · gutter-212p (text 0.31" from binding → needs 0.5") · low-dpi (150 DPI) · unembedded-font · bleed-art-short · 6-consecutive-blanks · annotated · encrypted

## Not supported yet
Crop/trim mark detection. Invisible objects, placeholder text, metadata (KDP lists these; no reliable detection).

## Later phases (design so they plug in; don't build)
P2 cover checker + spine calculator · P3 auto-fix (resize, add bleed, cover template; uses issue `fixId`) · P4 listing guard · P5 AI writing studio.
