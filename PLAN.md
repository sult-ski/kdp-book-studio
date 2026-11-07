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
- [x] **C3 — Safe area, spine text and fold lines.** Live text outside the safe area (fail), spine text crossing a fold line (warn), spine text within 0.0625" of the spine edge (warn), multi-page cover PDF (fail). Outlined text can't be told from cover art: listed under "Not checked yet".
- [x] **C4 — Fonts, DPI, barcode.** Reuse the interior engine for fonts and image DPI; text under 7 pt; barcode area check (best-effort info).
- [ ] **C5 — Cover report UI.** Zone overlay thumbnail; real-cover test with the owner's own book cover.

## Phase 2.5: Deep content check (start only after C5 is done)
Optional text scan of the interior, 100% client-side, no APIs. Based on `docs/research/deep-content-research.pdf` (Top 15 checks). Rules live in a new `content` section of `kdp-specs.json`: phrase/regex lists, `evidence: official | reported | both`, source URL (from the research PDF's links) and lastVerified. Issues show the matched snippet and page number. Exact-pattern rules (Gutenberg markers, lorem ipsum, store URLs) are `verified`; heuristic rules are `best-effort`. Text inside images or converted to outlines can't be read; say so in the report.
- **Must fix:** Project Gutenberg text, placeholder text, links to non-Amazon ebook stores.
- **Worth checking:** bonus content before Chapter 1, duplicate chapters/paragraphs, AI chatbot leftovers (+ AI disclosure reminder), freely available/PLR sources, summary/companion guide patterns, redirect/incomplete content, incentivised review language, metadata mismatch, erotica taboo co-occurrence, children's audience + explicit words.
- **Good to know:** newsletter/sign-up links, lyrics/long quotes.
- **Not supported:** copyright/plagiarism against the web (listed in the report).
- [ ] **D1 — Text extraction + rule engine + 5 rules.** Per-page text (pdf.js) with page numbers and links; rule engine reading the `content` config; Gutenberg, placeholder, store links, AI chatbot leftovers (+ disclosure reminder), newsletter links.
- [ ] **D2 — Structure rules.** Bonus content position/ratio, duplicate paragraphs (≥40 words, hashed) and repeated chapter headings, redirect/incomplete content; also freely-available/PLR, summary/companion guide, incentivised reviews, lyrics/long quotes.
- [ ] **D3 — Genre/audience + metadata.** Genre/audience settings with the research's exceptions (public-domain annotated edition, AI-themed book, hymnal/liturgy, children's audience…); erotica taboo co-occurrence; children's + explicit lexicon; pasted title/author/ISBN vs the manuscript (and Amazon/Kindle/KDP in the publisher line).
- [ ] **D4 — UI.** Optional "Deep content check" toggle on the Interior tab with genre/audience select and optional metadata fields; snippet rows with page numbers in the existing report groups; "Copyright/plagiarism vs the web" under Not supported. Verify at desktop and 360px.

## Test fixtures (generated with pdf-lib)
good-6x9-120p (passes all) · wrong-size · tiny-margins (text at 0.15") · gutter-212p (text 0.31" from binding → needs 0.5") · low-dpi (150 DPI) · unembedded-font · bleed-art-short · 6-consecutive-blanks · annotated · encrypted

## Not supported yet
Crop/trim mark detection. Invisible objects, placeholder text, metadata (KDP lists these; no reliable detection).

## Later phases (design so they plug in; don't build)
P2 cover checker + spine calculator · P3 auto-fix (resize, add bleed, cover template; uses issue `fixId`) · P4 listing guard · P5 AI writing studio.
