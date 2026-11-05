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
- `src/engine/` — PDF reading and checks. No UI code.
- `src/ui/` — styles (UI logic in `src/main.js` for now).

## Status
Milestone 2: page size (vs trim or trim + bleed, with tolerance), spread detection and page count checks, shown as a plain issue list. `npm run fixtures` writes test PDFs to `tests/fixtures/out/`.
