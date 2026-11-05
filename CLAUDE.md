# KDP Book Studio — instructions for Claude Code

## What this is
Phase 1 of KDP Book Studio: a client-side KDP paperback **interior** preflight checker. User uploads a PDF, picks trim, ink/paper and bleed, and gets a per-page pass/fail report with plain-English fixes. Portfolio project + owner uses it on real KDP books, so accuracy and credibility come first.

## Hard rules
- 100% client-side. The PDF never leaves the device. No uploads, no analytics on file content.
- Libraries: pdf-lib (MIT) and pdfjs-dist (Apache-2.0) only for PDF work. Never PyMuPDF or any AGPL code. Ask before adding any other dependency.
- Every KDP value lives in `src/config/kdp-specs.json` (with source URL + lastVerified). Never hard-code spec numbers elsewhere; read them via `src/engine/specs.js`.
- Never claim a check you can't do reliably. Each issue carries `accuracy: "verified" | "best-effort"`. Unsupported checks are listed as "Not supported yet" in the UI.
- The 200 DPI fail threshold is OUR rule (`images.appFailBelowDpi`), not KDP's. Label it that way in the report.
- Engine (`src/engine/`) has no DOM code, so it runs in a Web Worker and in Node tests.
- UI is for non-technical authors: plain English, mobile-first, no jargon without explanation.

## Conventions
- Units: PDF points internally, 72 pt = 1 inch; report in inches.
- Page 1 is a right-hand (recto) page. Odd pages: binding edge on the LEFT. Even pages: binding edge on the RIGHT.
- Bleed applies to top, bottom and outside edges only, never the gutter.
- Issue shape:
  `{ id, checkId, severity: "fail"|"warn"|"info", page|null, bbox?, measured, required, message, fix, accuracy, source, fixId? }`
- Report message style example:
  "❌ Page 47 — Text inside gutter zone. Your book has 212 pages, so KDP requires a 0.5" inside margin; this text sits 0.31" from the binding edge. Fix: increase the inside margin to at least 0.5" in your document and re-export the PDF."

## Workflow
- Work ONE milestone at a time from `PLAN.md`. When a milestone is done: run `npm test`, run the app and check it in the browser, tick the milestone in PLAN.md, summarise in a few lines, then STOP and wait for the owner to say "next".
- Every check gets Node tests using generated fixture PDFs (`tests/fixtures/make-fixtures.mjs`).
- Keep replies short. End long replies with a "Simplified Summary": key points + next step.
- If a KDP rule looks wrong or unclear, check the source URL in the config and tell the owner; don't guess.

## Commands
- `npm install`, `npm run dev`, `npm test`, `npm run build`
