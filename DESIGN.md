# DESIGN

Source of truth is `src/ui/styles.css` `:root`. Reuse tokens; never add ad-hoc values.

## Colour (contrast on its own wash)
- text `#1b2130` 16.1:1 on white · muted `#555e70` 6.5:1 (5.9:1 on pearl)
- accent violet `#5a3fc8` 7.0:1 (buttons, links, focus). The only accent.
- Severity, used only where it means something: fail red `#c4122f` on `#fdecee` 5.3:1 · warn amber `#8a5800` on `#fdf4dc` 5.5:1 · info blue `#1f6fa8` on `#e6f1fa` 4.7:1 · pass green `#1f7a4d` on `#e5f4ec` 4.7:1.
- Severity is never colour alone: each has its own icon and a word (Must fix / Worth checking / Good to know).
- Surfaces: white cards on pearl `#f3f2f7` with a faint, slow foil sheen (stills for reduced motion).

## Type
- Inter Variable (self-hosted), one family. h1 clamp 2–3.25rem / 720; card titles 1.25rem / 650; body 1rem / 1.55; hints .875rem.
- `tabular-nums` for counts, pages, sizes. `text-wrap: balance` on headlines.

## Space, shape, motion
- 4px grid in rem: .25 .5 .75 1 1.25 1.75 3. Cards radius 16px, controls 10px, controls 48px high (44px minimum tap target).
- One shadow token. No nested cards; group by spacing first.
- Motion: colour/transform transitions ≤150ms, no `transition: all`, no bounce. Respect `prefers-reduced-motion`.

## Layout
- Desktop ≥60rem: hero left, form card right (27rem). Report is a single centred column, max 50rem.
- Mobile first, verified at 360px. 16px side gutter, no horizontal scroll.
- After a check, the form collapses to a one-line recap with "Edit settings"; the verdict is the first thing in view.

## Anti-references (must NOT look like)
Generic SaaS landing page, purple-gradient AI tool, alarm-red dashboard, feature-grid of identical cards, glassmorphism, emoji icons.

## Taste notes (owner, verbatim)
- "Calmer verdict and severity badges, quieter zero counts, tighter report spacing" (UI1).
- "Features frozen — styling only." Keep UI1 tokens and severity colours consistent.
- Keep the privacy message ("No uploads — runs in your browser"), compressed to one line.
