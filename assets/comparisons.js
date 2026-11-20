(() => {
  'use strict';
  const root = document.querySelector('#paper-comparisons');
  if (!root) return;
  const strip = root.querySelector('.comparison-strip');
  const cards = [...strip.querySelectorAll('.full-comparison')];
  const controls = root.querySelector('.comparison-controls');
  const pause = controls.querySelector('[data-comparison="pause"]');
  const count = controls.querySelector('.comparison-count');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const compact = window.matchMedia('(max-width: 640px)');
  const speed = 32; // CSS pixels/second, independent of display refresh rate.
  let paused = reducedMotion.matches;
  let hovered = false;
  let visible = !('IntersectionObserver' in window);
  let frame = 0;
  let previousTime = null;
  let edgeTime = 0;
  let position = strip.scrollLeft;
  let holdTime = 0;
  let transition = null;
  let activeIndex = 0;

  const positions = () => cards.map(card => card.offsetLeft - cards[0].offsetLeft);
  const currentIndex = () => {
    const left = strip.scrollLeft + 2;
    const offsets = positions();
    // A narrow screen can inspect every view within the same wide figure.
    let index = 0;
    offsets.forEach((offset, i) => { if (offset <= left) index = i; });
    if (strip.scrollLeft >= strip.scrollWidth - strip.clientWidth - 2) index = cards.length - 1;
    return index;
  };
  const updateCount = () => {
    activeIndex = currentIndex();
    count.textContent = `${activeIndex + 1} / ${cards.length}`;
  };
  const canPlay = () => !paused && !hovered && visible && !document.hidden;
  function tick(time) {
    frame = 0;
    if (!canPlay()) return;
    const delta = previousTime === null ? 0 : Math.min(time - previousTime, 50);
    previousTime = time;
    const max = strip.scrollWidth - strip.clientWidth;
    if (max > 0 && compact.matches) {
      // Phones show one complete four-view figure, held still before the next slide.
      if (transition) {
        transition.elapsed += delta;
        const progress = Math.min(1, transition.elapsed / 600);
        const ease = (1 - Math.cos(Math.PI * progress)) / 2;
        position = transition.from + (transition.to - transition.from) * ease;
        if (progress === 1) { transition = null; holdTime = 0; }
      } else {
        holdTime += delta;
        if (holdTime >= 5000) {
          const offsets = positions();
          const next = offsets.find(offset => offset > position + 3);
          if (next === undefined) { position = 0; holdTime = 0; }
          else transition = {from: position, to: Math.min(max, next), elapsed: 0};
        }
      }
      strip.scrollLeft = position;
    } else if (max > 0) {
      // Pause at the two ends, then restart in reading order (no duplicate slides).
      if (position >= max - 0.5) {
        edgeTime += delta;
        if (edgeTime >= 2500) { position = 0; edgeTime = -1500; }
      } else if (edgeTime < 0) {
        edgeTime = Math.min(0, edgeTime + delta);
      } else {
        position = Math.min(max, position + speed * delta / 1000);
      }
      strip.scrollLeft = position;
    }
    frame = requestAnimationFrame(tick);
  }
  function refresh() {
    cancelAnimationFrame(frame);
    frame = 0;
    previousTime = null;
    position = strip.scrollLeft;
    pause.textContent = paused ? 'Play' : 'Pause';
    pause.setAttribute('aria-pressed', String(paused));
    pause.setAttribute('aria-label', paused ? 'Play comparison autoplay' : 'Pause comparison autoplay');
    if (canPlay()) frame = requestAnimationFrame(tick);
  }
  function stopForReading() {
    paused = true;
    edgeTime = 0;
    holdTime = 0;
    transition = null;
    refresh();
  }
  function move(direction) {
    stopForReading();
    const offsets = positions();
    const left = strip.scrollLeft;
    let target;
    if (direction > 0) target = left >= strip.scrollWidth - strip.clientWidth - 2 ? 0 : (offsets.find(offset => offset > left + 3) ?? 0);
    else target = offsets.filter(offset => offset < left - 3).pop() ?? offsets[offsets.length - 1];
    strip.scrollTo({left: target, behavior: reducedMotion.matches ? 'instant' : 'smooth'});
  }

  controls.hidden = false;
  const updateHelp = () => {
    root.querySelector('#comparison-help').textContent = compact.matches
      ? 'One example at a time. Auto-advances every 5 seconds; tap to enlarge.'
      : 'Auto-scrolls left to right. Hover to pause; swipe or select an image to explore.';
  };
  updateHelp();
  pause.addEventListener('click', () => {
    paused = !paused;
    edgeTime = 0;
    holdTime = 0;
    transition = null;
    if (!paused && compact.matches) {
      const nearest = positions().reduce((best, value) => Math.abs(value - strip.scrollLeft) < Math.abs(best - strip.scrollLeft) ? value : best);
      strip.scrollLeft = nearest;
    }
    refresh();
  });
  controls.querySelector('[data-comparison="previous"]').addEventListener('click', () => move(-1));
  controls.querySelector('[data-comparison="next"]').addEventListener('click', () => move(1));
  strip.addEventListener('scroll', updateCount, {passive: true});
  strip.addEventListener('pointerenter', event => {
    if (event.pointerType === 'mouse') { hovered = true; refresh(); }
  });
  strip.addEventListener('pointerleave', () => { hovered = false; refresh(); });
  // Manual interaction never fights the autoplay; Play explicitly resumes it.
  strip.addEventListener('pointerdown', stopForReading, {passive: true});
  strip.addEventListener('wheel', event => {
    if (Math.abs(event.deltaX) > 0 || event.shiftKey) stopForReading();
  }, {passive: true});
  strip.addEventListener('focusin', stopForReading);
  strip.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End', ' '].includes(event.key)) return;
    stopForReading();
    if (event.target !== strip) return;
    event.preventDefault();
    const max = strip.scrollWidth - strip.clientWidth;
    const left = event.key === 'Home' ? 0 : event.key === 'End' ? max
      : strip.scrollLeft + (event.key === 'ArrowLeft' ? -80 : event.key === 'ArrowRight' ? 80 : 0);
    strip.scrollTo({left, behavior: 'instant'});
  });
  document.addEventListener('visibilitychange', refresh);
  reducedMotion.addEventListener('change', () => {
    if (reducedMotion.matches) paused = true;
    refresh();
  });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting;
      refresh();
    }, {threshold: 0.15}).observe(strip);
  }
  window.addEventListener('resize', () => {
    strip.scrollLeft = Math.min(positions()[activeIndex], strip.scrollWidth - strip.clientWidth);
    edgeTime = 0;
    holdTime = 0;
    transition = null;
    updateHelp();
    updateCount();
    refresh();
  });
  updateCount();
  refresh();
})();
