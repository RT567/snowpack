// The tiny season picker, top left.
export function createSeasonPicker(el, years, current, onChange) {
  el.innerHTML = '';
  for (const y of years) {
    const o = document.createElement('option');
    o.value = y; o.textContent = `winter ${y}`;
    el.appendChild(o);
  }
  el.value = current;
  el.addEventListener('change', () => onChange(Number(el.value)));
}
