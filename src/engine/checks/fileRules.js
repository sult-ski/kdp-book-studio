// File rules: encryption, file size, comments/annotations, links, form fields, scripts, bookmarks.
import { sourceUrl } from '../specs.js';

// Annotations that are not comments/markup. Popups belong to a comment and are counted with it.
const LINK = 'Link';
const NOT_COMMENTS = new Set([LINK, 'Widget', 'Popup']);

/**
 * @param {object} specs
 * @param {{ sizeBytes:number, encrypted:boolean, file:object|null }} pdf
 * @returns {Array<object>} issues
 */
export function checkFileRules(specs, pdf) {
  const source = sourceUrl(specs, specs.file);
  const issues = [];
  const add = (issue) => issues.push({ checkId: 'fileRules', page: null, accuracy: 'verified', source, ...issue });

  if (specs.file.noEncryption && pdf.encrypted) {
    add({
      id: 'file-encrypted', severity: 'fail',
      measured: 'encrypted', required: 'not locked or encrypted',
      message: 'This PDF is locked or encrypted (it has security settings). KDP says not to lock or encrypt files.',
      fix: 'Export the PDF again with no password or security settings In LibreOffice: File → Export as PDF → Security tab, leave both passwords unset. In Acrobat: File → Properties → Security → "No Security".',
    });
  }

  // KDP says "650MB"; we use decimal megabytes (650,000,000 bytes), the stricter reading.
  const sizeMB = pdf.sizeBytes / 1e6;
  if (sizeMB > specs.file.maxSizeMB) {
    add({
      id: 'file-too-big', severity: 'fail',
      measured: `${sizeMB.toFixed(0)} MB`, required: `${specs.file.maxSizeMB} MB or less`,
      message: `This file is ${sizeMB.toFixed(0)} MB. KDP's limit is ${specs.file.maxSizeMB} MB; larger files fail to upload.`,
      fix: 'Reduce the file size: export images at 300 DPI (KDP recommends no more than 600 DPI), In LibreOffice: File → Export as PDF → General tab, tick "Reduce image resolution" and choose 300 DPI.',
    });
  }

  const f = pdf.file;
  if (!f) {
    add({
      id: 'file-unreadable', severity: 'warn', accuracy: 'best-effort',
      measured: 'file structure could not be read', required: 'no comments, annotations or bookmarks',
      message: "We couldn't read this PDF's structure, so we can't check for comments, annotations, forms or bookmarks.",
      fix: 'Re-export the PDF from your writing app, then check again.',
    });
    return issues;
  }

  // Comments and other markup: one issue per page, so the report shows where they are.
  const commentsByPage = new Map();
  for (const a of f.annotations) {
    if (NOT_COMMENTS.has(a.subtype)) continue;
    if (!commentsByPage.has(a.page)) commentsByPage.set(a.page, []);
    commentsByPage.get(a.page).push(a.subtype);
  }
  for (const [page, kinds] of commentsByPage) {
    add({
      id: `file-comments-p${page}`, severity: 'warn', page,
      measured: kinds.join(', '), required: 'no comments or annotations',
      message: 'This page has comments, markup or other annotations. KDP says files should not contain them, and they may be removed or cause problems in review.',
      fix: 'Remove them and re-export the PDF. In LibreOffice: File → Export as PDF → General tab, untick "Comments as PDF annotations" (and accept or reject tracked changes under Edit → Track Changes). In Word: Review → Delete → Delete All Comments.',
      fixId: 'remove-annotations',
    });
  }

  // Links: a note on each page that has them (they usually pass KDP review).
  const linkPages = [...new Set(f.annotations.filter((a) => a.subtype === LINK).map((a) => a.page))];
  for (const page of linkPages) {
    add({
      id: `file-links-p${page}`, severity: 'info', page,
      measured: 'links', required: 'no annotations (guideline)',
      message: "This page has clickable links. They don't do anything in print. KDP's guidelines ask for no annotations (PDF links count as one), but links usually pass review.",
      fix: 'Nothing to do. To remove them anyway: in LibreOffice, right-click the link → Remove Hyperlink, then export again.',
      fixId: 'remove-annotations',
    });
  }

  if (f.hasFormFields) {
    add({
      id: 'file-forms', severity: 'warn',
      measured: 'form fields', required: 'no forms',
      message: 'This PDF has fillable form fields. KDP says forms may be removed during review, so anything shown in them might not print.',
      fix: 'Export without form fields. In LibreOffice: File → Export as PDF → General tab, untick "Create PDF form". In Acrobat: Print → "Adobe PDF" to flatten the form.',
      fixId: 'flatten',
    });
  }

  if (f.hasBookmarks) {
    add({
      id: 'file-bookmarks', severity: 'info',
      measured: 'bookmarks', required: 'no bookmarks (guideline)',
      message: "This PDF has bookmarks (the clickable outline in a PDF viewer). KDP's guidelines say files shouldn't contain bookmarks, but they usually pass review.",
      fix: 'Optional: turn off "Create bookmarks" when exporting to PDF. In LibreOffice: File → Export as PDF → General tab, untick "Export outlines".',
      fixId: 'remove-bookmarks',
    });
  }

  if (f.hasJavaScript) {
    add({
      id: 'file-javascript', severity: 'warn',
      measured: 'JavaScript', required: 'no scripts (our recommendation)',
      message: "This PDF contains JavaScript (code that runs in PDF viewers). KDP's guidelines don't mention scripts, but a print file has no use for them, so we recommend removing them. This is our advice, not a KDP rule.",
      fix: 'Export a fresh PDF straight from your writing app (for example LibreOffice: File → Export as PDF), without editing it in a PDF tool that adds scripts or actions.',
    });
  }

  return issues;
}
