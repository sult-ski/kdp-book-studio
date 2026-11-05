// Small text helpers shared by checks. No DOM.

/** 6 -> '6"', 6.125 -> '6.125"', 0.31000001 -> '0.31"' */
export function inches(n) {
  return `${Number((Math.round(n * 1000) / 1000).toFixed(3))}"`;
}

/** '6" x 9"' */
export function size(w, h) {
  return `${inches(w)} x ${inches(h)}`;
}
