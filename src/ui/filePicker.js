// Drop-zone file picker: the native file input covers the whole zone (invisible), so tap, keyboard and
// drag-and-drop all work natively. This only shows which file was chosen and highlights drag-over.
import { esc } from './report.js';

const MB = 1e6;

/** @param {{ input:HTMLInputElement, zone:HTMLElement, status:HTMLElement }} els */
export function initFilePicker({ input, zone, status }) {
  const empty = status.innerHTML;
  input.addEventListener('change', () => {
    const file = input.files[0];
    zone.classList.toggle('has-file', Boolean(file));
    status.innerHTML = file
      ? `<span class="drop__main">${esc(file.name)}</span><span class="drop__sub">${(file.size / MB).toFixed(1)} MB. Tap to choose a different file.</span>`
      : empty;
  });
  for (const [type, on] of [['dragenter', true], ['dragleave', false], ['drop', false]]) {
    zone.addEventListener(type, () => zone.classList.toggle('is-dragging', on));
  }
}
