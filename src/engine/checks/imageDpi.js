// Image resolution: pixels ÷ displayed inches. KDP asks for at least 300 DPI (warn below that).
// Below 200 DPI is OUR "very low" threshold (images.appVeryLowBelowDpi), not KDP's; still a warning,
// because KDP doesn't block low-resolution images.
import { sourceUrl } from '../specs.js';
import { inches } from '../format.js';

const LIBREOFFICE_EXPORT = 'If the original picture is sharp, check your export settings. In LibreOffice: File → Export as PDF → General tab, untick "Reduce image resolution" (or set it to 300 DPI or more) and choose "Lossless compression" or a JPEG quality of 90% or more.';

/**
 * @param {object} specs
 * @param {{ number:number, widthIn:number, heightIn:number }} page
 * @param {Array<{ pxW:number, pxH:number, widthIn:number, heightIn:number,
 *   bboxIn:{x:number,y:number,width:number,height:number}, kind:string }>} images from inspectPage()
 * @returns {Array<object>} issues
 */
export function checkPageImages(specs, page, images) {
  const { minDpi, appVeryLowBelowDpi, belowMinSeverity } = specs.images;
  // Covers set belowMinSeverity "info": one gentle level, no "very low" tier. Interior: unset, so warn as before.
  const soft = belowMinSeverity === 'info';
  const minPx = specs.app.minImagePixels;
  const source = sourceUrl(specs, specs.images);
  const issues = [];

  images.forEach((img, index) => {
    if (img.pxW < minPx || img.pxH < minPx) return; // fills, rules, gradients
    if (img.widthIn <= 0 || img.heightIn <= 0) return;
    if (!onPage(img.bboxIn, page)) return;            // placed entirely off the page: never printed

    const dpi = Math.round(Math.min(img.pxW / img.widthIn, img.pxH / img.heightIn));
    if (dpi >= minDpi) return;
    const veryLow = !soft && dpi < appVeryLowBelowDpi;
    const shown = `${inches(img.widthIn)} x ${inches(img.heightIn)}`;
    const needW = Math.ceil(img.widthIn * minDpi);
    const needH = Math.ceil(img.heightIn * minDpi);
    const what = img.kind === 'mask' ? 'A black-and-white image (line art)' : 'An image';

    issues.push({
      id: `images-${veryLow ? 'verylow' : 'low'}-p${page.number}-${index}`,
      checkId: 'images',
      groupKey: `images|${veryLow ? 'verylow' : 'low'}`,
      severity: soft ? 'info' : 'warn',
      page: page.number,
      bbox: img.bboxIn,
      measured: `${dpi} DPI`,
      required: `${minDpi} DPI`,
      message: soft
        ? `${what} is ${dpi} DPI, below KDP's recommended ${minDpi} DPI, so it may print slightly soft. KDP usually accepts it. It is ${img.pxW} x ${img.pxH} pixels shown at ${shown}.`
        : veryLow
        ? `${what} is only ${dpi} DPI: very low (below ${appVeryLowBelowDpi} DPI, our threshold; KDP's minimum is ${minDpi} DPI), so it will likely print blurry or pixelated. It is ${img.pxW} x ${img.pxH} pixels shown at ${shown}.`
        : `${what} is ${dpi} DPI. KDP recommends at least ${minDpi} DPI so images print sharply. It is ${img.pxW} x ${img.pxH} pixels shown at ${shown}.`,
      fix: `Use a higher-resolution version (at least ${needW} x ${needH} pixels at this size), or show it smaller. ${LIBREOFFICE_EXPORT}`,
      accuracy: img.kind === 'xobject' ? 'verified' : 'best-effort',
      source,
      fixId: 'replace-image',
    });
  });
  return issues;
}

function onPage(b, page) {
  return b.x < page.widthIn && b.y < page.heightIn && b.x + b.width > 0 && b.y + b.height > 0;
}
