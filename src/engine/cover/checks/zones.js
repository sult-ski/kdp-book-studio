// Cover zones: text must sit inside the safe area (0.25" inside the trim and the spine folds) on the back and
// front covers; spine text must stay clear of the fold lines and of the spine's edges.
// Uses live text positions from pdf.js. Text converted to outlines or drawn inside images can't be told apart
// from artwork on a full-colour cover, so it isn't checked here (the report says so).
import { inches } from '../../format.js';
import { sourceUrl } from '../../specs.js';

const EPS = 1e-6;
const spec = (n) => `${n}"`; // KDP's own figures, shown as KDP writes them (0.0625", not 0.063")
const PANEL_NAME = { back: 'back cover', front: 'front cover', spine: 'spine' };

/**
 * @param {object} specs
 * @param {Array<{ str:string, x:number, y:number, width:number, height:number }>} textBoxes inches, top-left origin
 * @param {ReturnType<import('../layout.js').coverLayout>} L
 * @param {{ toleranceIn:number }} opts measurement tolerance (one rendered pixel)
 */
export function checkCoverZones(specs, textBoxes, L, { toleranceIn: tol }) {
  const safe = specs.cover.safeArea.textMarginIn;
  const clear = specs.cover.spineText.clearanceIn;
  const variance = specs.cover.fold.varianceIn;
  const spine = L.rects.spine;
  const top = spine.y;
  const bottom = spine.y + spine.height;
  const foldL = spine.x;
  const foldR = spine.x + spine.width;

  const found = { back: [], front: [], spine: [], fold: [], edge: [] };
  for (const b of textBoxes) {
    const x1 = b.x + b.width;
    const y1 = b.y + b.height;
    const cx = b.x + b.width / 2;
    const vertical = [
      { d: b.y - top, edge: 'top' },
      { d: bottom - y1, edge: 'bottom' },
    ];
    if (cx >= foldL && cx <= foldR) {
      if (!L.spineText.allowed) continue; // the spine text check reports it
      const v = closest(vertical);
      if (v.d < safe - tol - EPS) { found.spine.push({ b, ...v }); continue; }
      const over = Math.max(foldL - b.x, x1 - foldR);
      if (over > tol + EPS) { found.fold.push({ b, d: over }); continue; }
      const side = Math.min(b.x - foldL, foldR - x1);
      if (side < clear - tol - EPS) found.edge.push({ b, d: side });
      continue;
    }
    const panel = cx < foldL ? 'back' : 'front';
    const p = L.rects[panel];
    const foldDist = panel === 'back' ? foldL - x1 : b.x - foldR;
    const outerDist = panel === 'back' ? b.x - p.x : p.x + p.width - x1;
    const c = closest([...vertical, { d: outerDist, edge: 'outside' }, { d: foldDist, edge: 'fold' }]);
    if (c.d < safe - tol - EPS) found[panel].push({ b, ...c, nearFold: foldDist < variance - tol - EPS });
  }

  const issues = [];
  for (const panel of ['back', 'spine', 'front']) {
    if (found[panel].length) issues.push(safeAreaIssue(specs, panel, found[panel], safe));
  }
  if (found.fold.length) issues.push(foldIssue(specs, found.fold, variance, clear));
  if (found.edge.length) issues.push(edgeIssue(specs, found.edge, variance, clear));
  return issues;
}

const closest = (list) => list.reduce((a, b) => (b.d < a.d ? b : a));
const quote = (b) => `"${b.str.trim().slice(0, 40)}"`;
const EDGE = {
  top: 'the top trim line', bottom: 'the bottom trim line', outside: 'the outside trim line', fold: 'the spine fold',
};

function safeAreaIssue(specs, panel, hits, safe) {
  const worst = closest(hits);
  const name = PANEL_NAME[panel];
  const where = worst.d < 0
    ? (worst.edge === 'fold'
      ? `runs ${inches(-worst.d)} past ${EDGE.fold}, onto the spine`
      : `runs ${inches(-worst.d)} past ${EDGE[worst.edge]}, so part of it will be cut off`)
    : `sits ${inches(worst.d)} from ${EDGE[worst.edge]}`;
  const lead = hits.length > 1
    ? `${hits.length} pieces of text on the ${name} are outside the safe area. The closest, ${quote(worst.b)}, ${where}.`
    : `Text ${quote(worst.b)} on the ${name} ${where}.`;
  const fold = hits.some((h) => h.nearFold)
    ? ' Some of it sits on the fold line, where the cover bends around the spine.' : '';
  return {
    id: 'cover-safe-area', checkId: 'coverSafeArea', severity: 'fail', page: 1,
    bbox: union(hits.map((h) => h.b)),
    measured: `${inches(worst.d)} from ${EDGE[worst.edge]}`,
    required: `text at least ${spec(safe)} inside the trim and fold lines`,
    message: `${lead} KDP needs text at least ${spec(safe)} inside the trim and the spine folds (the safe area), because cutting and folding can shift slightly.${fold}`,
    fix: `Move the text at least ${spec(safe)} in from the trim and fold lines, then export again. The template from the Cover calculator tab shows the safe area as a dashed blue line.`,
    fixId: 'move-into-safe-area',
    groupKey: `safe-area-${panel}`,
    accuracy: 'verified',
    source: sourceUrl(specs, specs.cover.safeArea),
  };
}

function foldIssue(specs, hits, variance, clear) {
  const worst = hits.reduce((a, b) => (b.d > a.d ? b : a));
  return {
    id: 'cover-fold-line', checkId: 'coverFold', severity: 'warn', page: 1,
    bbox: union(hits.map((h) => h.b)),
    measured: `${inches(worst.d)} past the fold`,
    required: `spine text at least ${spec(clear)} inside each fold`,
    message: `Spine text ${quote(worst.b)} crosses a fold line by ${inches(worst.d)}. The fold can shift by up to ${spec(variance)} either way when the book is bound, so this text may wrap onto the front or back cover.`,
    fix: `Make the spine text smaller or centre it on the spine, keeping at least ${spec(clear)} clear of each fold, then export again.`,
    fixId: 'center-spine-text',
    accuracy: 'verified',
    source: sourceUrl(specs, specs.cover.fold),
  };
}

function edgeIssue(specs, hits, variance, clear) {
  const worst = closest(hits);
  return {
    id: 'cover-spine-edge', checkId: 'coverSpineEdge', severity: 'warn', page: 1,
    bbox: union(hits.map((h) => h.b)),
    measured: `${inches(worst.d)} from the spine edge`,
    required: `at least ${spec(clear)} from each side of the spine`,
    message: `Spine text ${quote(worst.b)} sits ${inches(worst.d)} from the edge of the spine. KDP recommends keeping ${spec(clear)} clear on each side, because the fold can shift by up to ${spec(variance)}.`,
    fix: `Make the spine text smaller or centre it so it stays at least ${spec(clear)} from each side of the spine, then export again.`,
    fixId: 'center-spine-text',
    accuracy: 'verified',
    source: sourceUrl(specs, specs.cover.spineText),
  };
}

function union(boxes) {
  const x0 = Math.min(...boxes.map((b) => b.x));
  const y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.width));
  const y1 = Math.max(...boxes.map((b) => b.y + b.height));
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}
