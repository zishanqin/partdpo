(() => {
  'use strict';
  document.documentElement.classList.add('js');

  // Original supplementary tables remain available without JavaScript.
  document.querySelectorAll('[data-dataset-switch]').forEach(group => {
    const buttons = [...group.querySelectorAll('[data-dataset]')];
    const panels = [...group.querySelectorAll('[data-dataset-panel]')];
    const select = key => {
      buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.dataset === key)));
      panels.forEach(panel => { panel.hidden = panel.dataset.datasetPanel !== key; });
    };
    buttons.forEach(button => button.addEventListener('click', () => select(button.dataset.dataset)));
    group.querySelector('.dataset-buttons').hidden = false;
    select('0');
  });

  // Figure lightbox (desktop). On phones the link opens the image itself, where pinch-zoom works.
  const dialog = document.querySelector('#figure-dialog');
  if (dialog && typeof dialog.showModal === 'function') {
    const image = dialog.querySelector('#figure-image');
    const caption = dialog.querySelector('#figure-caption');
    const narrow = window.matchMedia('(max-width: 768px)');
    let opener = null;
    document.querySelectorAll('[data-lightbox]').forEach(link => {
      link.addEventListener('click', e => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || narrow.matches) return;
        e.preventDefault();
        opener = link;
        image.src = link.getAttribute('href');
        image.alt = (link.querySelector('img') || {}).alt || '';
        caption.textContent = link.dataset.caption || '';
        dialog.showModal();
      });
    });
    dialog.querySelector('.close-dialog').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', e => {
      if (e.target !== dialog) return;
      const r = dialog.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close();
    });
    dialog.addEventListener('close', () => { if (opener) opener.focus(); });
  }

  // Interactive 3D comparison: loads assets/models/models.json, then model-viewer, only when the card nears the viewport.
  const viewer = document.querySelector("#viewer3d");
  if (viewer && window.fetch && "IntersectionObserver" in window) {
    fetch("assets/models/models.json").then(r => (r.ok ? r.json() : null)).then(data => {
      if (!data || !data.objects || !data.objects.length) return;
      viewer.hidden = false;
      const io = new IntersectionObserver(entries => {
        if (!entries.some(e => e.isIntersecting)) return;
        io.disconnect();
        loadModelViewer().then(() => initViewer(viewer, data)).catch(() => { viewer.hidden = true; });
      }, { rootMargin: "400px" });
      io.observe(viewer);
    }).catch(() => {});
  }

  // Copy BibTeX.
  const copy = document.querySelector('#copy-citation');
  if (copy && navigator.clipboard && navigator.clipboard.writeText) {
    copy.hidden = false;
    const status = document.querySelector('#copy-status');
    let resetTimer;
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(document.querySelector('#bibtex-code').textContent);
        copy.textContent = 'Copied';
        status.textContent = 'Citation copied.';
      } catch {
        status.textContent = 'Select the citation or use Download .bib.';
      }
      clearTimeout(resetTimer);
      resetTimer = setTimeout(() => { copy.textContent = 'Copy'; status.textContent = ''; }, 2500);
    });
  }
})();

// The homepage gallery and comparison viewer share one pinned renderer.
let modelViewerReady;
function loadModelViewer() {
  if (customElements.get('model-viewer')) return Promise.resolve();
  if (!modelViewerReady) modelViewerReady = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.type = 'module';
    script.src = 'https://ajax.googleapis.com/ajax/libs/model-viewer/3.3.0/model-viewer.min.js';
    const timeout = setTimeout(() => reject(new Error('3D renderer timed out')), 20000);
    script.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('3D renderer unavailable')); });
    customElements.whenDefined('model-viewer').then(() => { clearTimeout(timeout); resolve(); });
    document.head.appendChild(script);
  });
  return modelViewerReady;
}

function initViewer(root, data) {
  'use strict';
  const tabs = root.querySelector('.viewer-tabs');
  const input = root.querySelector('.viewer-input img');
  const toggle = root.querySelector('.viewer-toggle');
  const note = root.querySelector('.viewer-note');
  const mvs = {};
  root.querySelectorAll('.viewer-slot').forEach(slot => {
    const mv = document.createElement('model-viewer');
    mv.setAttribute('camera-controls', '');
    mv.setAttribute('disable-pan', '');
    mv.setAttribute('touch-action', 'pan-y');
    mv.setAttribute('interaction-prompt', 'none');
    mv.setAttribute('shadow-intensity', '0.6');
    mv.setAttribute('environment-image', 'neutral');
    mv.setAttribute('exposure', '1.05');
    mv.setAttribute('camera-orbit', '35deg 70deg auto');
    mv.setAttribute('interpolation-decay', '60');
    const error = document.createElement('p');
    error.className = 'viewer-error';
    error.textContent = '3D unavailable. See the paper renders above.';
    error.hidden = true;
    error.setAttribute('role', 'status');
    mv.addEventListener('load', () => { mv.dataset.ready = 'true'; error.hidden = true; });
    mv.addEventListener('error', () => { mv.dataset.ready = 'error'; error.hidden = false; });
    slot.append(mv, error);
    mvs[slot.dataset.method] = mv;
  });
  // Keep both cameras in step: whichever model the reader drags drives the other.
  let syncing = false;
  const pair = [mvs.baseline, mvs.ours];
  pair.forEach((mv, k) => {
    mv.addEventListener('camera-change', e => {
      if (syncing || e.detail.source !== 'user-interaction') return;
      const other = pair[1 - k];
      const o = mv.getCameraOrbit();
      syncing = true;
      other.cameraOrbit = `${o.theta}rad ${o.phi}rad ${o.radius}m`;
      other.fieldOfView = `${mv.getFieldOfView()}deg`;
      other.jumpCameraToGoal();
      syncing = false;
    });
  });
  let current = 0;
  let exploded = false;
  const show = () => {
    const obj = data.objects[current];
    const kind = exploded ? 'exploded' : 'assembled';
    input.setAttribute('src', obj.input);
    input.setAttribute('alt', `Input image: ${obj.name}`);
    for (const m of ['baseline', 'ours']) {
      const mv = mvs[m];
      if (mv.getAttribute('src') !== obj[m][kind]) mv.dataset.ready = 'loading';
      mv.setAttribute('src', obj[m][kind]);
      mv.setAttribute('alt', `${obj.name} generated by ${m === 'ours' ? 'our method' : 'PartCrafter'}, ${obj[m].parts} requested parts${exploded ? ', exploded view' : ''}`);
    }
    note.textContent = `${obj.ours.parts} parts · same input for both methods`;
    [...tabs.children].forEach((b, k) => b.setAttribute('aria-pressed', String(k === current)));
    toggle.setAttribute('aria-pressed', String(exploded));
    toggle.textContent = exploded ? 'Assemble parts' : 'Explode parts';
  };
  data.objects.forEach((obj, k) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = obj.name;
    b.addEventListener('click', () => {
      current = k;
      pair.forEach(mv => { mv.cameraOrbit = '35deg 70deg auto'; mv.fieldOfView = 'auto'; mv.jumpCameraToGoal(); });
      show();
    });
    tabs.appendChild(b);
  });
  toggle.addEventListener('click', () => { exploded = !exploded; show(); });
  show();
}
