// Bleed: art near the page edges. Called from the margin check, which already scans each edge band.
//   No bleed + art touching an edge        -> warn (best-effort)
//   Bleed + art stopping short of the edge -> info (best-effort): it reaches the trim line but not the bleed edge
import { outsideMarginFor, expectedPageSize, sourceUrl } from '../specs.js';
import { inches, size } from '../format.js';

const WHERE = { top: 'top', bottom: 'bottom', outside: 'outside', inside: 'binding (inside)' };

/**
 * @param {object} specs
 * @param {{ e:{edge:string}, hit:{insetIn:number}, page:{number:number}, bbox:object, trimKey:string }} ctx
 */
export function artAtEdgeWithoutBleed(specs, { e, hit, page, bbox, trimKey }) {
  const min = inches(outsideMarginFor(specs, false));
  const away = Math.round(hit.insetIn * 100) / 100;
  const base = issueBase(specs, { kind: 'edge', e, page, bbox, measured: inches(away), required: e.edge === 'inside' ? 'away from the binding' : `${min} from the edge, or bleed` });
  if (e.edge === 'inside') {
    return {
      ...base,
      message: `An image, line or shape runs into the binding edge (${inches(away)} away). Bleed doesn't apply at the binding, so part of it will be hidden in the spine fold.`,
      fix: 'Move or shrink it so it stays clear of the binding edge (outside the gutter margin), then re-export the PDF.',
    };
  }
  return {
    ...base,
    message: `An image, line or shape touches the ${WHERE[e.edge]} edge of the page (${inches(away)} away), but you chose "No bleed". Without bleed, KDP needs white paper around it, so it may be flagged in review or trimmed unevenly.`,
    fix: `If it is meant to run off the page, choose "Bleed" above, make your pages ${bleedSize(specs, trimKey)} and extend it ${inches(specs.bleed.extendBeyondTrim)} past the trim line. Otherwise move it at least ${min} from the edge.`,
  };
}

/** @param {object} specs @param {{ e:{edge:string, offset:number}, hit:{insetIn:number}, page:object, bbox:object }} ctx */
export function artShortOfBleedEdge(specs, { e, hit, page, bbox }) {
  const gap = Math.round(hit.insetIn * 100) / 100;
  const ext = inches(specs.bleed.extendBeyondTrim);
  return {
    ...issueBase(specs, { kind: 'short', e, page, bbox, measured: inches(gap), required: 'to the page edge' }),
    severity: 'info',
    message: `An image or shape at the ${WHERE[e.edge]} edge stops ${inches(gap)} before the edge of the page, at about the trim line, instead of running into the bleed area. If it is meant to run off the page, a small shift when the book is trimmed can leave a thin white line.`,
    fix: `If it should run off the page, extend it all the way to the page edge (${ext} past the trim line). If it is meant to stop inside the page, move it at least ${inches(outsideMarginFor(specs, true))} in from the trim line.`,
  };
}

function issueBase(specs, { kind, e, page, bbox, measured, required }) {
  return {
    id: `bleed-${kind}-${e.edge}-p${page.number}`,
    checkId: 'bleed',
    groupKey: `bleed|${kind}|${e.edge}`,
    severity: 'warn',
    page: page.number,
    bbox,
    measured,
    required,
    accuracy: 'best-effort',
    source: sourceUrl(specs, specs.bleed),
    fixId: 'fix-bleed',
  };
}

/** Page size for a trim with bleed, e.g. '6.125" x 9.25"'. */
function bleedSize(specs, trimKey) {
  const { width, height } = expectedPageSize(specs, trimKey, true);
  return size(width, height);
}
