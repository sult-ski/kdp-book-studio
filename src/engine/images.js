// Finds where images are painted on a page by walking pdf.js's operator list and tracking the
// current transformation matrix (CTM), the same way pdf.js's canvas renderer does. No DOM.
//
// Tracked: image XObjects (verified), inline images, stencil masks and repeated images (best-effort).
// Not tracked: images inside tiling patterns, Type 3 font glyphs, and annotation appearances.

/**
 * @param {{ fnArray:number[], argsArray:any[] }} opList from page.getOperatorList()
 * @param {object} OPS pdf.js OPS table
 * @param {(objId:string) => {width:number,height:number}|null} lookupImage size of a decoded image by id
 * @returns {Array<{ pxW:number, pxH:number, ctm:number[], kind:'xobject'|'inline'|'mask'|'repeat' }>}
 *   ctm maps the image's unit square to page user space (points)
 */
export function findImagePlacements(opList, OPS, lookupImage) {
  const out = [];
  let ctm = [1, 0, 0, 1, 0, 0];
  const stack = [];
  let annotationDepth = 0;
  const { fnArray, argsArray } = opList;

  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    const args = argsArray[i];
    switch (fn) {
      case OPS.save:
      case OPS.beginGroup:
        stack.push(ctm);
        break;
      case OPS.restore:
      case OPS.endGroup:
      case OPS.paintFormXObjectEnd:
        ctm = stack.pop() ?? [1, 0, 0, 1, 0, 0];
        break;
      case OPS.transform:
        ctm = multiply(ctm, args);
        break;
      case OPS.paintFormXObjectBegin:
        stack.push(ctm);
        if (args[0]) ctm = multiply(ctm, args[0]);
        break;
      case OPS.beginAnnotation:
        annotationDepth++;
        break;
      case OPS.endAnnotation:
        annotationDepth--;
        break;
      default:
        if (annotationDepth > 0) break; // comments/stamps are reported by the file rules check
        if (fn === OPS.paintImageXObject) {
          out.push({ pxW: args[1], pxH: args[2], ctm, kind: 'xobject' });
        } else if (fn === OPS.paintInlineImageXObject || fn === OPS.paintImageMaskXObject) {
          const img = args[0];
          if (img?.width && img?.height) {
            out.push({ pxW: img.width, pxH: img.height, ctm, kind: fn === OPS.paintImageMaskXObject ? 'mask' : 'inline' });
          }
        } else if (fn === OPS.paintImageXObjectRepeat) {
          // args: [objId, scaleX, scaleY, positions[x0, y0, x1, y1, ...]]
          const size = lookupImage(args[0]);
          if (size) {
            const [, sx, sy, pos] = args;
            for (let p = 0; p < pos.length; p += 2) {
              out.push({ pxW: size.width, pxH: size.height, ctm: multiply(ctm, [sx, 0, 0, sy, pos[p], pos[p + 1]]), kind: 'repeat' });
            }
          }
        }
    }
  }
  return out;
}

/** m1 · m2 as PDF matrices [a b c d e f]: apply m2 first, then m1 (same as pdf.js Util.transform). */
export function multiply(m1, m2) {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}
