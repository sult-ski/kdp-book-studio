# DESIGN

Source of truth is `src/ui/styles.css` `:root`. Reuse tokens; never add ad-hoc values. Theme name: **Forest Press** (UI3). The previous look is tagged `ui-classic`.

## Colour (contrast on its own surface)
- Page cream `#f6f1e6`; cards `#fffdf8`; fills `#f3ecdc`. Text `#1c2b23` 13.1:1 · muted `#48564d` 7.0:1 (6.4:1 on fills).
- Brand forest `#1e4d3b` (buttons, links, focus, form band) 9.5:1 on cards, white on it 9.6:1. The only action colour.
- Walnut `#2a1d15` (footer; cream on it 13.7:1) and clay `#9a4f2e` (numerals, labels, example sheets; 5.3:1 on cream). Decorative warmth only: never used for a status.
- Severity, only where it means something: Must fix red `#c4122f` on `#fdecee` · Worth checking amber `#7a5200` on `#fff1bf` 6.1:1 · Good to know blue `#1f6fa8` on `#e6f1fa` 4.7:1. Each has its own icon and a word.
- **Ready** is leaf green `#256b2b` on `#e2f2d9` (5.6:1), a yellower green than the brand, on a filled scalloped seal with a ring that goes out once. It never reuses the forest brand colour.
- Background: iridescent foil, retuned to moss, sage, teal and amber washes, drifting slowly (still for reduced motion).

## Type
- Display: EB Garamond 500/600, upright (self-hosted, @fontsource): h1 clamp 2.6–4.6rem, report headings, counts, form band, footer line. Body and controls: Inter Variable. `tabular-nums` for counts, pages, sizes. `text-wrap: balance` on headlines.

## Space, shape, motion
- 4px grid in rem. Cards radius 18px, controls 10px, controls 48px high (44px minimum tap target). One shadow token, warm-tinted.
- Motion (UI4, owner taste: slow and clearly visible; all off under `prefers-reduced-motion`; transform + opacity, **ease-in-out** `cubic-bezier(.4,0,.2,1)`, 600–900ms):
  tab indicator glides 700ms and the new panel slides in from its side with a blur-to-sharp; buttons, count tiles and the file drop lift 2–3px on hover and press to .97 (press responds in 150ms); report rows rise 90ms apart, groups 160ms apart; verdict card rises in over 900ms, seal turns in, a ring goes out once, count tiles stagger; Bleed switch thumb glides.
- Scenery: seven shapes (fern, two leaves, walnut-grain disc, paper sheet, book) from inline SVG symbols in index.html, blur 10–14px so veins, rings and leaflets still read, fill set with `fill: currentColor` (without it they render black/grey). Saturated hues at alphas picked by script so a single shape keeps muted text above 4.6:1 over the foil peak (fern is stronger on wide screens only, where just the dark headline sits on it; phones use the safe strength). Placed in separate zones (edges, gutters, bottom) so they rarely overlap. Drift 64–90s, small scroll parallax where supported, static for reduced motion; three dropped on phones.
- Hover effects only under `(hover: hover) and (pointer: fine)`. No `transition: all`, no bounce.

## Layout
- ≥900px (56.25rem): a hero band (headline left, explanation and three trust lines right), then **form left (28rem), results right**. The results are a sticky pane (own scroll) that shows the example finding until a check runs; the form stays on screen, so there is no recap. The report lays itself out by the pane's own width (container queries): verdict with counts stacked beside it from 36rem, 2-up tiles below.
- Calculator: inputs left, results and cover overlay right. Cover: same as interior.
- Phones <48rem: tabs are a fixed bottom bar; Trim + Ink/paper side by side from 32rem up (trim sized to its longest value, 14px text) and stacked below it, because "Black ink, groundwood paper" does not fit beside Trim at 360px (measured, not guessed); Bleed switch on one row; trust points are a swipeable snap row; page previews swipe sideways; the example finding is one tappable line. The Check button turns sticky only once a file is chosen, and choosing a file scrolls the form to the top so the button sits below the upload card, never on it. After a check the form folds into a recap with chips and "Change settings". 16px gutter, verified at 360px.

## Anti-references (must NOT look like)
Generic SaaS landing page, purple-gradient AI tool, alarm-red dashboard, feature-grid of identical cards, glassmorphism, emoji icons, italic serif display type.

## Copy voice
Calm, plain, honest. Say what the tool catches; never promise "will pass KDP". Verdict: "Looks ready to upload" + "We check printing rules, not whether KDP approves your content."

## Taste notes (owner, verbatim)
- "Calmer verdict and severity badges, quieter zero counts, tighter report spacing" (UI1).
- "Features frozen — styling only." Keep severity colours clearly distinct from brand green/brown.
- "A site that looks designed, not basic — noticeable difference on first glance." Theme: forest green + walnut/clay brown + cream, iridescent background kept (UI3).
- Keep the privacy message, compressed to one line.
- "Less vertical": pair short fields, inline Bleed, horizontal scroll-snap for trust points and page previews, two columns from 900px (UI4).
- "Slow all animations: ~600–900ms, ease-in-out, tab glide ~700ms, row stagger ~90ms. Keep them clearly visible." Overrides the skill's default of fast ease-out (UI4).
- "Blurry background objects, on theme": leaves, ferns, walnut-grain discs, paper sheets, book silhouettes (UI4).
