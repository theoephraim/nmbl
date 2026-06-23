// Behaviour for the flip-to-output toggle. Loaded once globally (BaseLayout),
// so it drives both CodeToggle.astro instances (homepage) and the markup the
// remark-nmbl-toggle build plugin emits for guide ```nmbl fences. Styles live
// in src/styles/code-toggle.css.

const easeInOut = (p: number) =>
  p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;

function initCodeToggles() {
  document.querySelectorAll<HTMLElement>('.code-toggle').forEach((root) => {
    if (root.dataset.ctReady) return;
    root.dataset.ctReady = '1';

    const stage = root.querySelector<HTMLElement>('.ct-stage');
    const front = root.querySelector<HTMLElement>('.ct-front');
    const back = root.querySelector<HTMLElement>('.ct-back');
    const bars = Array.from(root.querySelectorAll<HTMLElement>('.ct-bar'));
    const btn = root.querySelector<HTMLButtonElement>('.ct-flip-btn');
    if (!stage || !front || !back || !btn || !bars.length) return;

    const COLS = bars.length;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const STRIDE = 75; // per-column stagger (ms)
    const COL_DUR = 460; // time one column takes to wipe in (ms)
    const TOTAL = COL_DUR + (COLS - 1) * STRIDE;
    let busy = false;

    const activeFace = () =>
      root.classList.contains('is-flipped') ? back : front;
    const setHeight = () => {
      stage.style.height = `${activeFace().offsetHeight}px`;
    };

    setHeight();
    if (document.fonts?.ready) document.fonts.ready.then(setHeight);
    window.addEventListener('resize', setHeight);

    // Staircase reveal: each column's depth is its own eased progress, offset by
    // the stagger — a polygon whose stepped bottom edge marches down.
    const colW = 100 / COLS;
    const polygonAt = (ms: number) => {
      const d = bars.map((_, i) =>
        easeInOut(Math.min(1, Math.max(0, (ms - i * STRIDE) / COL_DUR))) * 100,
      );
      const pts = ['0% 0%', '100% 0%', `100% ${d[COLS - 1].toFixed(2)}%`];
      for (let i = COLS - 1; i > 0; i--) {
        const x = (i * colW).toFixed(2);
        pts.push(`${x}% ${d[i].toFixed(2)}%`, `${x}% ${d[i - 1].toFixed(2)}%`);
      }
      pts.push(`0% ${d[0].toFixed(2)}%`);
      return `polygon(${pts.join(', ')})`;
    };

    btn.addEventListener('click', () => {
      if (busy) return;
      const toBack = !root.classList.contains('is-flipped');
      const incoming = toBack ? back : front;
      const h = incoming.offsetHeight;

      btn.setAttribute('aria-label', toBack ? 'Reveal nmbl source' : 'Reveal compiled output');
      btn.setAttribute('title', toBack ? 'Reveal nmbl source' : 'Reveal compiled output');

      if (reduceMotion) {
        root.classList.toggle('is-flipped', toBack);
        stage.style.height = `${h}px`;
        return;
      }

      busy = true;
      // Flip state immediately: the brackets slide and the surface panel opens
      // to the new height at once. The incoming face is held on top (z3) so it
      // wipes in over the outgoing one during the cascade.
      root.classList.toggle('is-flipped', toBack);
      incoming.style.zIndex = '3';
      stage.style.height = `${h}px`;

      const barH = bars[0].offsetHeight || 120;

      // Incoming face wipes in via the staggered staircase clip.
      const STEPS = 20;
      const frames = Array.from({ length: STEPS + 1 }, (_, s) => ({
        offset: s / STEPS,
        clipPath: polygonAt((s / STEPS) * TOTAL),
      }));
      const reveal = incoming.animate(frames, { duration: TOTAL, easing: 'linear', fill: 'backwards' });

      // Each rainbow bar falls down its column, leading its reveal.
      bars.forEach((bar, i) => {
        bar.animate(
          [
            { transform: `translateY(${-barH}px)`, opacity: 0 },
            { opacity: 1, offset: 0.18 },
            { opacity: 1, offset: 0.7 },
            { transform: `translateY(${h}px)`, opacity: 0 },
          ],
          { duration: COL_DUR + 110, delay: i * STRIDE, easing: 'cubic-bezier(0.45, 0.05, 0.25, 1)', fill: 'backwards' },
        );
      });

      const settle = () => {
        if (!busy) return;
        incoming.style.zIndex = '';
        busy = false;
      };
      reveal.onfinish = settle;
      window.setTimeout(settle, TOTAL + 150);
    });
  });
}

initCodeToggles();
document.addEventListener('astro:after-swap', initCodeToggles);
