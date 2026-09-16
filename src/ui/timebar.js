// The time bar: the one control. Drag or click between the first snowfall and the end of the record.
export class TimeBar {
  constructor(el, onChange) {
    this.el = el;
    this.fill = el.querySelector('.fill');
    this.knob = el.querySelector('.knob');
    this.date = el.querySelector('.date');
    this.onChange = onChange;
    this.min = 0; this.max = 1; this.index = 0; this.times = [];
    this.dragging = false;
    el.addEventListener('pointerdown', (e) => { this.dragging = true; el.setPointerCapture(e.pointerId); this.setFromEvent(e); });
    el.addEventListener('pointermove', (e) => { if (this.dragging) this.setFromEvent(e); });
    el.addEventListener('pointerup', () => { this.dragging = false; });
    el.addEventListener('pointercancel', () => { this.dragging = false; });
    window.addEventListener('keydown', (e) => {
      if (!this.times.length || /^(SELECT|INPUT|TEXTAREA)$/.test(e.target?.tagName)) return;
      if (e.key === 'ArrowLeft') this.set(this.index - (e.shiftKey ? 24 : 1));
      if (e.key === 'ArrowRight') this.set(this.index + (e.shiftKey ? 24 : 1));
    });
  }

  /** Configure for a record: hour timestamps, first selectable index, initial index. */
  configure(times, min, index) {
    this.times = times; this.min = min; this.max = times.length - 1;
    for (const t of this.el.querySelectorAll('.tick, .obs')) t.remove();
    // a tick at the first hour of each month inside the range
    let lastMonth = null;
    for (let i = min; i <= this.max; i++) {
      const d = new Date(times[i]);
      const m = d.toLocaleDateString('en-AU', { timeZone: 'Australia/Sydney', month: 'short' });
      const day = d.toLocaleDateString('en-AU', { timeZone: 'Australia/Sydney', day: 'numeric' });
      if (m !== lastMonth) {
        if (lastMonth !== null && day === '1') {
          const tick = document.createElement('div');
          tick.className = 'tick'; tick.style.left = `${this.frac(i) * 100}%`;
          tick.innerHTML = `<span>${m}</span>`;
          this.el.appendChild(tick);
        }
        lastMonth = m;
      }
    }
    this.set(index, false);
    this.el.classList.add('on');
  }

  frac(i) { return this.max > this.min ? (i - this.min) / (this.max - this.min) : 1; }

  /** Mark days (YYYY-MM-DD in Sydney time) that have a human observation. */
  markDays(dates) {
    for (const t of this.el.querySelectorAll('.obs')) t.remove();
    const want = new Set(dates);
    for (let i = this.min; i <= this.max; i++) {
      const d = new Date(this.times[i]);
      if (d.toLocaleString('en-AU', { timeZone: 'Australia/Sydney', hour: '2-digit', hour12: false }).slice(0, 2) !== '12') continue;
      const key = d.toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' });
      if (!want.has(key)) continue;
      const dot = document.createElement('div');
      dot.className = 'obs'; dot.style.left = `${this.frac(i) * 100}%`;
      this.el.appendChild(dot);
    }
  }

  setFromEvent(e) {
    const r = this.el.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    this.set(Math.round(this.min + f * (this.max - this.min)));
  }

  set(i, notify = true) {
    if (!this.times.length) return; // nothing loaded yet: a click on the (still invisible) bar must not fire
    i = Math.max(this.min, Math.min(this.max, i));
    const changed = i !== this.index;
    this.index = i;
    const pct = `${this.frac(i) * 100}%`;
    this.knob.style.left = pct; this.date.style.left = pct; this.fill.style.width = pct;
    const d = new Date(this.times[i]);
    this.date.textContent = d.toLocaleString('en-AU', { timeZone: 'Australia/Sydney', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', hour12: true }).replace(',', '');
    if (changed && notify) this.onChange(i);
  }
}
