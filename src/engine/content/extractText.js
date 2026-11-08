// Deep content check: reads each page's text and link URLs with pdf.js. No DOM.
// Text inside images, or text converted to outlines, has no text layer and can't be read.

/**
 * @param {object} doc pdf.js document
 * @param {number} pageNumber 1-based
 * @returns {Promise<{ page:number, text:string, urls:string[] }>}
 */
export async function extractPageText(doc, pageNumber) {
  const page = await doc.getPage(pageNumber);
  try {
    const [content, annotations] = await Promise.all([page.getTextContent(), page.getAnnotations()]);
    const urls = annotations.filter((a) => a.subtype === 'Link' && a.url).map((a) => a.url);
    return { page: pageNumber, text: joinItems(content.items), urls };
  } finally {
    page.cleanup();
  }
}

/** Joins pdf.js text items into lines, adding the spaces and line breaks the PDF only implies by position. */
export function joinItems(items) {
  let out = '';
  let prev = null;
  for (const it of items) {
    if (typeof it.str !== 'string') continue; // marked-content markers
    if (prev && !prev.hasEOL && it.str) {
      const size = Math.hypot(it.transform[2], it.transform[3]) || 10;
      const sameLine = Math.abs(it.transform[5] - prev.transform[5]) < size * 0.5;
      if (!sameLine) out += '\n';
      else if (it.transform[4] - (prev.transform[4] + prev.width) > size * 0.15 && !/\s$/.test(out) && !/^\s/.test(it.str)) out += ' ';
    }
    out += it.str;
    if (it.hasEOL) out += '\n';
    if (it.str || it.hasEOL) prev = it;
  }
  return normalize(out);
}

/** Same characters for the same words: ligatures, curly quotes, words hyphenated across a line break. */
export function normalize(text) {
  return text.normalize('NFKC')
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[­]/g, '')
    .replace(/(\p{Ll})-\n(?=\p{Ll})/gu, '$1');
}
