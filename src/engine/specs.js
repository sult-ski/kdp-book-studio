// Reads kdp-specs.json. No spec values are hard-coded anywhere else.

/** List of trim sizes from the config, e.g. { key: "6x9", width: 6, height: 9, label: '6" x 9"' } */
export function listTrims(specs) {
  return Object.keys(specs.pageCount.ranges).map((key) => {
    const [width, height] = key.split('x').map(Number);
    return { key, width, height, label: `${width}" x ${height}"` };
  });
}

/** Ink/paper options, e.g. { key: "bw_cream", label: "Black ink, cream paper" } */
export function listInkPaper(specs) {
  return Object.entries(specs.pageCount.inkPaperTypes).map(([key, label]) => ({ key, label }));
}

/** Expected page size in inches for a trim, with or without bleed. */
export function expectedPageSize(specs, trimKey, bleed) {
  const [w, h] = trimKey.split('x').map(Number);
  if (!bleed) return { width: w, height: h };
  return { width: w + specs.bleed.addWidth, height: h + specs.bleed.addHeight };
}

/** [min, max] pages for a trim + ink/paper, or null if that combination isn't offered. */
export function pageCountRange(specs, trimKey, inkPaperKey) {
  const idx = Object.keys(specs.pageCount.inkPaperTypes).indexOf(inkPaperKey);
  const row = specs.pageCount.ranges[trimKey];
  if (!row || idx < 0) return null;
  return row[idx];
}

/** Minimum inside (gutter) margin in inches for a page count, or null if out of range. */
export function gutterFor(specs, pageCount) {
  const band = specs.margins.gutterByPageCount.find((b) => pageCount >= b.min && pageCount <= b.max);
  return band ? band.inside : null;
}

/** Minimum top/bottom/outside margin in inches. */
export function outsideMarginFor(specs, bleed) {
  return bleed ? specs.margins.outsideMin.bleed : specs.margins.outsideMin.noBleed;
}

/** Source URL for a rule section, e.g. sourceUrl(specs, specs.margins) */
export function sourceUrl(specs, section) {
  return specs._meta.sources[section.source];
}

/** Spine width in inches: page count x per-page thickness for the ink and paper. */
export function spineWidth(specs, inkPaperKey, pages) {
  const perPage = specs.cover.spine.perPageIn[inkPaperKey];
  if (perPage == null) throw new Error(`No spine thickness for ink and paper "${inkPaperKey}"`);
  return pages * perPage;
}

/** Full cover size in inches (back + spine + front, plus bleed on all four outside edges). */
export function coverSize(specs, trimKey, inkPaperKey, pages) {
  const [w, h] = trimKey.split('x').map(Number);
  const bleed = specs.cover.size.bleedIn;
  const spineIn = spineWidth(specs, inkPaperKey, pages);
  return { widthIn: bleed + w + spineIn + w + bleed, heightIn: bleed + h + bleed, spineIn, trimWidthIn: w, trimHeightIn: h, bleedIn: bleed };
}
