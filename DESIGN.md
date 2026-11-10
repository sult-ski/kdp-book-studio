# DESIGN

Source of truth is `src/ui/styles.css` `:root`. Reuse tokens; never add ad-hoc values. Theme name: **Forest Press** (UI3). The previous look is tagged `ui-classic`.

## Colour (contrast on its own surface)
- Page cream `#f6f1e6`; cards `#fffdf8`; fills `#f3ecdc`. Text `#1c2b23` 13.1:1 · muted `#4f5d54` 6.2:1 (5.7:1 on fills).
- Brand forest `#1e4d3b` (buttons, links, focus, form band) 9.5:1 on cards, white on it 9.6:1. The only action colour.
- Walnut `#2a1d15` (footer; cream on it 13.7:1) and clay `#9a4f2e` (numerals, labels, example sheets; 5.3:1 on cream). Decorative warmth only: never used for a status.
- Severity, only where it means something: Must fix red `#c4122f` on `#fdecee` · Worth checking amber `#7a5200` on `#fff1bf` 6.1:1 · Good to know blue `#1f6fa8` on `#e6f1fa` 4.7:1. Each has its own icon and a word.
- **Ready** is leaf green `#256b2b` on `#e2f2d9` (5.6:1), a yellower green than the brand, on a filled scalloped seal with a ring that goes out once. It never reuses the forest brand colour.
- Background: iridescent foil, retuned to moss, sage, teal and amber washes, drifting slowly (still for reduced motion).

## Type
- Display: EB Garamond 500/600, upright (self-hosted, @fontsource): h1 clamp 2.6–4.6rem, report headings, counts, form band, footer line. Body and controls: Inter Variable. `tabular-nums` for counts, pages, sizes. `text-wrap: balance` on headlines.

## Space, shape, motion
- 4px grid in rem. Cards radius 18px, controls 10px, controls 48px high (44px minimum tap target). One shadow token, warm-tinted.
- Motion (all off under `prefers-reduced-motion`; transform + opacity, ease-out `cubic-bezier(.23,1,.32,1)`):
  tab indicator glides (translate + scale) and the new panel slides in from its side with a 450ms blur-to-sharp; buttons, count tiles and the file drop lift 2–3px on hover (shadow fades in via a pseudo-element) and press to .97; report rows rise in 55ms apart; verdict card rises in, seal pops, count tiles stagger; Bleed switch thumb glides.
- Hover effects only under `(hover: hover) and (pointer: fine)`. No `transition: all`, no bounce.

## Layout
- Desktop ≥60rem: hero left (headline, lead, ruled steps, privacy line, stacked "example finding" sheets), form card right with a forest title band. Tabs are an underline nav top right. Report is 56rem wide; the verdict puts headline and actions left and the three counts stacked right.
- Phones <48rem: tabs become a fixed bottom bar (icon over label, indicator on its top edge); the primary button is sticky above it; steps are hidden; recap settings are a horizontal chip row; severity tiles are 2-up with Must fix across the whole top row. 16px gutter, verified at 360px, no horizontal scroll.
- After a check the form collapses to a recap with "Change settings"; the verdict is the first thing in view.

## Anti-references (must NOT look like)
Generic SaaS landing page, purple-gradient AI tool, alarm-red dashboard, feature-grid of identical cards, glassmorphism, emoji icons, italic serif display type.

## Copy voice
Calm, plain, honest. Say what the tool catches; never promise "will pass KDP". Verdict: "Looks ready to upload" + "We check printing rules, not whether KDP approves your content."

## Taste notes (owner, verbatim)
- "Calmer verdict and severity badges, quieter zero counts, tighter report spacing" (UI1).
- "Features frozen — styling only." Keep severity colours clearly distinct from brand green/brown.
- "A site that looks designed, not basic — noticeable difference on first glance." Theme: forest green + walnut/clay brown + cream, iridescent background kept (UI3).
- Keep the privacy message, compressed to one line.
