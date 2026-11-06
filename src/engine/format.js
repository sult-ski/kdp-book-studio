// Small text helpers shared by checks. No DOM.

/** 6 -> '6"', 6.125 -> '6.125"', 0.31000001 -> '0.31"' */
export function inches(n) {
  return `${Number((Math.round(n * 1000) / 1000).toFixed(3))}"`;
}

/** '6" x 9"' */
export function size(w, h) {
  return `${inches(w)} x ${inches(h)}`;
}

/** '140 x 215.9 mm' from inches (1 decimal, trailing .0 dropped) */
export function sizeMm(w, h) {
  const mm = (n) => Number((n * 25.4).toFixed(1));
  return `${mm(w)} x ${mm(h)} mm`;
}

/** '6" x 9" (152.4 x 228.6 mm)' */
export function sizeBoth(w, h) {
  return `${size(w, h)} (${sizeMm(w, h)})`;
}

/** Always 3 decimals, rounded half up: 0.141876 -> '0.142"', 11.4075 -> '11.408"'.
 * The epsilon stops float noise (11.4075 is stored as 11.40749…) from rounding down. Matches KDP's calculator. */
export function inches3(n) {
  return `${(Math.round(n * 1000 + 1e-6) / 1000).toFixed(3)}"`;
}
