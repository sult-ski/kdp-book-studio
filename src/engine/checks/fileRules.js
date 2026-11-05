// File rules: encryption, file size, comments/annotations, links, form fields, scripts, bookmarks.
import { sourceUrl } from '../specs.js';
import { formatPageList } from '../summarize.js';

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
      fix: 'Export the PDF again with no password or security settings (in Acrobat: File → Properties → Security → "No Security").',
    });
  }

  // KDP says "650MB"; we use decimal megabytes (650,000,000 bytes), the stricter reading.
  const sizeMB = pdf.sizeBytes / 1e6;
  if (sizeMB > specs.file.maxSizeMB) {
    add({
      id: 'file-too-big', severity: 'fail',
      measured: `${sizeMB.toFixed(0)} MB`, required: `${specs.file.maxSizeMB} MB or less`,
      message: `This file is ${sizeMB.toFixed(0)} MB. KDP's limit is ${specs.file.maxSizeMB} MB; larger files fail to upload.`,
      fix: 'Reduce the file size: export images at 300 DPI (KDP recommends no more than 600 DPI), or use your PDF tool\'s "Reduce file size" option.',
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
      id: `file-comments-p${page}`, severity: 'fail', page,
      measured: kinds.join(', '), required: 'no comments or annotations',
      message: 'This page has comments, markup or other annotations. KDP says files should not contain comments or annotations.',
      fix: 'Delete the comments or markup (in Word: Review → Delete → Delete All Comments; also accept or reject tracked changes), then re-export the PDF.',
      fixId: 'remove-annotations',
    });
  }

  const linkPages = [...new Set(f.annotations.filter((a) => a.subtype === LINK).map((a) => a.page))];
  if (linkPages.length) {
    add({
      id: 'file-links', severity: 'warn',
      measured: `links on ${linkPages.length} page${linkPages.length === 1 ? '' : 's'}`, required: 'no annotations',
      message: `Links found on page${linkPages.length === 1 ? '' : 's'} ${formatPageList(linkPages)}. Links don't work in print, and PDF links count as annotations, which KDP says files should not contain.`,
      fix: 'To be safe, export without links: remove hyperlinks in your document (or turn off "create links/hyperlinks" in your export settings) and re-export.',
      fixId: 'remove-annotations',
    });
  }

  if (f.hasFormFields) {
    add({
      id: 'file-forms', severity: 'warn',
      measured: 'form fields', required: 'no forms',
      message: 'This PDF has fillable form fields. KDP says forms may be removed during review, so anything shown in them might not print.',
      fix: 'Flatten the form so its content becomes part of the page (in Acrobat: Print → "Adobe PDF", or use a "Flatten" tool), then upload the flattened PDF.',
      fixId: 'flatten',
    });
  }

  if (f.hasBookmarks) {
    add({
      id: 'file-bookmarks', severity: 'warn',
      measured: 'bookmarks', required: 'no bookmarks',
      message: 'This PDF has bookmarks (the clickable outline in a PDF viewer). KDP says files should not contain bookmarks and lists them as a common reason files fail.',
      fix: 'Turn off "Create bookmarks" when exporting to PDF, then upload the new file.',
      fixId: 'remove-bookmarks',
    });
  }

  if (f.hasJavaScript) {
    add({
      id: 'file-javascript', severity: 'warn',
      measured: 'JavaScript', required: 'no scripts (our recommendation)',
      message: "This PDF contains JavaScript (code that runs in PDF viewers). KDP's guidelines don't mention scripts, but a print file has no use for them, so we recommend removing them. This is our advice, not a KDP rule.",
      fix: 'Export a fresh PDF straight from your writing app, without editing it in a PDF tool that adds scripts or actions.',
    });
  }

  return issues;
}
