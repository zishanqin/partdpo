(() => {
  'use strict';
  const root = document.querySelector('#paper-comparisons');
  if (!root) return;
  const strip = root.querySelector('.comparison-strip');
  const stage = root.querySelector('.comparison-stage');
  const cards = [...strip.querySelectorAll('.full-comparison')];
  const controls = root.querySelector('.comparison-controls');
  const pause = controls.querySelector('[data-comparison="pause"]');
  const count = controls.querySelector('.comparison-count');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let paused = reducedMotion.matches;
  let hovered = false;
  let visible = !('IntersectionObserver' in window);
  let frame = 0;
  let previousTime = null;
  let position = strip.scrollLeft;
  let holdTime = 0;
  let transition = null;
  let activeIndex = 0;
  let manualUntil = 0;
  let keyboardFocus = false;

  const positions = () => cards.map(card => card.offsetLeft - cards[0].offsetLeft);
  const currentIndex = () => {
    const left = strip.scrollLeft + 2;
    const offsets = positions();
    let index = 0;
    offsets.forEach((offset, i) => { if (offset <= left) index = i; });
    if (strip.scrollLeft >= strip.scrollWidth - strip.clientWidth - 2) index = cards.length - 1;
    return index;
  };
  const updateCount = () => {
    activeIndex = currentIndex();
    count.textContent = `${activeIndex + 1} / ${cards.length}`;
  };
  const canPlay = () => !paused && !hovered && !keyboardFocus && visible && !document.hidden;
  function tick(time) {
    frame = 0;
    if (!canPlay()) return;
    const delta = previousTime === null ? 0 : Math.min(time - previousTime, 50);
    previousTime = time;
    if (time < manualUntil) {
      position = strip.scrollLeft;
      frame = requestAnimationFrame(tick);
      return;
    }
    const max = strip.scrollWidth - strip.clientWidth;
    if (max > 0) {
      // Hold a complete four-view figure before sliding to the next example.
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
    manualUntil = performance.now() + 6500;
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
  pause.addEventListener('click', () => {
    paused = !paused;
    manualUntil = 0;
    holdTime = 0;
    transition = null;
    if (!paused) {
      const nearest = positions().reduce((best, value) => Math.abs(value - strip.scrollLeft) < Math.abs(best - strip.scrollLeft) ? value : best);
      strip.scrollLeft = nearest;
    }
    refresh();
  });
  controls.querySelector('[data-comparison="previous"]').addEventListener('click', () => move(-1));
  controls.querySelector('[data-comparison="next"]').addEventListener('click', () => move(1));
  strip.addEventListener('scroll', updateCount, {passive: true});
  stage.addEventListener('pointerenter', event => {
    if (event.pointerType === 'mouse') { hovered = true; refresh(); }
  });
  stage.addEventListener('pointerleave', () => { hovered = false; refresh(); });
  // Let manual navigation settle before autoplay resumes; keyboard focus pauses it.
  strip.addEventListener('pointerdown', stopForReading, {passive: true});
  strip.addEventListener('wheel', event => {
    if (Math.abs(event.deltaX) > 0 || event.shiftKey) stopForReading();
  }, {passive: true});
  stage.addEventListener('focusin', event => {
    keyboardFocus = event.target.matches(':focus-visible');
    refresh();
  });
  stage.addEventListener('focusout', event => {
    if (!stage.contains(event.relatedTarget)) { keyboardFocus = false; refresh(); }
  });
  strip.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End', ' '].includes(event.key)) return;
    if (event.target !== strip) return;
    event.preventDefault();
    if (event.key === ' ') {
      paused = !paused;
      keyboardFocus = false;
      manualUntil = 0;
      refresh();
      return;
    }
    stopForReading();
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      move(event.key === 'ArrowLeft' ? -1 : 1);
      return;
    }
    const max = strip.scrollWidth - strip.clientWidth;
    const left = event.key === 'Home' ? 0 : max;
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
    holdTime = 0;
    transition = null;
    updateCount();
    refresh();
  });
  updateCount();
  refresh();
})();
