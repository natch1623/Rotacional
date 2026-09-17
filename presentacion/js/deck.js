/* ============================================================
   deck.js — motor de la presentación
   Escenario fijo 1600x900 escalado al viewport (16:9 exacto).
   ============================================================ */

(function () {
  'use strict';

  var stage = document.getElementById('stage');
  var slides = Array.prototype.slice.call(stage.querySelectorAll('.slide'));
  var total = slides.length;

  var elProgress = document.getElementById('progress');
  var elCurrent = document.getElementById('cur');
  var elTotal = document.getElementById('tot');
  var elSection = document.getElementById('section-label');
  var elNotes = document.getElementById('notes');
  var elNotesBody = document.getElementById('notes-body');
  var elNotesWho = document.getElementById('notes-who');
  var elNotesTitle = document.getElementById('notes-title');
  var elTimer = document.getElementById('timer');
  var elOverview = document.getElementById('overview');
  var elOverviewGrid = document.getElementById('overview-grid');
  var elHelp = document.getElementById('help');
  var btnNotes = document.getElementById('btn-notes');
  var btnOverview = document.getElementById('btn-overview');

  var index = 0;
  var notesOpen = false;
  var overviewOpen = false;
  var helpOpen = false;
  var overviewBuilt = false;

  elTotal.textContent = String(total);

  /* ---------- escalado 16:9 ---------- */

  function fitStage() {
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var scale = Math.min(vw / 1600, vh / 900);
    stage.style.setProperty('--scale', scale);
    window.__stageScale = scale;
  }

  /* ---------- navegación ---------- */

  function go(n, opts) {
    n = Math.max(0, Math.min(total - 1, n));
    if (n === index && !(opts && opts.force)) return;

    var dir = n >= index ? 'fwd' : 'back';
    stage.dataset.dir = dir;

    /* --dir invierte el eje de la transición: la diapositiva que sale
       se va en sentido contrario al de la que entra */
    var leaving = slides[index];
    leaving.style.setProperty('--dir', dir === 'fwd' ? '-1' : '1');
    leaving.classList.remove('is-active');
    leaving.setAttribute('aria-hidden', 'true');

    index = n;

    var slide = slides[index];
    slide.style.setProperty('--dir', dir === 'fwd' ? '1' : '-1');
    void slide.offsetWidth; /* forzar recálculo para que la transición arranque desde ahí */
    slide.classList.add('is-active');
    slide.setAttribute('aria-hidden', 'false');

    runFx(slide);
    syncSteppers(slide);

    elCurrent.textContent = String(index + 1);
    elProgress.style.width = (total > 1 ? (index / (total - 1)) * 100 : 100) + '%';
    elSection.textContent = slide.dataset.section || '';
    stage.dataset.bg = slide.dataset.bg || 'quiet';

    syncNotes();
    syncMedia();
    if (window.FieldViz) window.FieldViz.setActive(slide);
    if (overviewOpen) syncOverviewCurrent();

    if (history.replaceState) history.replaceState(null, '', '#' + (index + 1));
    startTimer();
  }

  var next = function () { go(index + 1); };
  var prev = function () { go(index - 1); };

  /* ---------- barrido HUD de las divisorias ---------- */

  var elFx = document.getElementById('stage-fx');
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  function runFx(slide) {
    if (!elFx) return;
    elFx.classList.remove('is-scanning');
    if (slide.dataset.fx !== 'scan' || reduced.matches) return;
    void elFx.offsetWidth; /* reiniciar la animación aunque se pulse rápido */
    elFx.classList.add('is-scanning');
  }

  if (elFx) {
    elFx.addEventListener('animationend', function () {
      elFx.classList.remove('is-scanning');
    });
  }

  /* ---------- recorridos paso a paso ----------
     Diapositiva 11: la expansión por cofactores del determinante.
     Diapositiva 12: cada término de la fórmula con su tarjeta.
     Misma mecánica en las dos, para que el gesto del expositor sea
     el mismo: arranca sola cuando la diapositiva ya entró, y un
     clic toma el control manual. En clase hace falta poder quedarse
     parado en la componente j, que es donde está el signo. */

  function makeStepper(el, opts) {
    var timer = null, delay = null, step = 0;
    var steps = (opts && opts.steps) || 3;
    var period = (opts && opts.period) || 2600;
    var lead = (opts && opts.lead) || 1500;

    var items = el.querySelectorAll('[data-t]');

    function set(n) {
      step = n;
      el.dataset.step = String(n);
      /* marcar el elemento activo con una clase evita tener que enumerar
         cada pareja paso/elemento en el CSS */
      for (var i = 0; i < items.length; i++) {
        items[i].classList.toggle('is-on', n !== 0 && items[i].dataset.t === String(n));
      }
    }

    function clear() {
      if (timer) { clearInterval(timer); timer = null; }
      if (delay) { clearTimeout(delay); delay = null; }
    }

    function stop() { clear(); set(0); }

    function start() {
      stop();
      if (reduced.matches) return;   /* sin ciclo automático; el clic sigue disponible */
      delay = setTimeout(function () {
        delay = null;
        /* por si se cambió de diapositiva mientras esperábamos */
        if (!slides[index].contains(el)) return;
        set(1);
        timer = setInterval(function () { set(step % steps + 1); }, period);
      }, lead);
    }

    function manual(e) {
      e.preventDefault();
      clear();                       /* el clic manda: se acabó el ciclo */
      set(step % steps + 1);
    }

    el.addEventListener('click', manual);
    el.addEventListener('keydown', function (e) {
      /* el espacio pasa de diapositiva: aquí no debe hacerlo */
      if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); manual(e); }
    });

    return { el: el, start: start, stop: stop };
  }

  var steppers = [];
  Array.prototype.forEach.call(stage.querySelectorAll('[data-steps]'), function (el) {
    steppers.push(makeStepper(el, {
      steps: parseInt(el.dataset.steps, 10) || 3,
      period: parseInt(el.dataset.period, 10) || 2600
    }));
  });

  function syncSteppers(slide) {
    for (var i = 0; i < steppers.length; i++) {
      if (slide.contains(steppers[i].el)) steppers[i].start();
      else steppers[i].stop();
    }
  }

  /* ---------- guion del expositor ---------- */

  function syncNotes() {
    var slide = slides[index];
    var src = slide.querySelector('.slide-notes');
    elNotesBody.innerHTML = src ? src.innerHTML : '<p>Sin guion para esta diapositiva.</p>';
    elNotesWho.textContent = slide.dataset.who || '—';
    elNotesTitle.textContent = slide.dataset.title || '';
    elNotes.scrollTop = 0;
  }

  function toggleNotes(force) {
    notesOpen = typeof force === 'boolean' ? force : !notesOpen;
    elNotes.classList.toggle('is-open', notesOpen);
    elNotes.setAttribute('aria-hidden', String(!notesOpen));
    btnNotes.setAttribute('aria-pressed', String(notesOpen));
  }

  /* ---------- multimedia ---------- */

  function syncMedia() {
    var vids = stage.querySelectorAll('video');
    for (var i = 0; i < vids.length; i++) {
      var v = vids[i];
      if (slides[index].contains(v)) {
        var p = v.play();
        if (p && p.catch) p.catch(function () {});
      } else {
        v.pause();
        v.currentTime = 0;
      }
    }
  }

  /* ---------- vista general ---------- */

  function buildOverview() {
    if (overviewBuilt) return;
    var frag = document.createDocumentFragment();

    slides.forEach(function (slide, i) {
      var btn = document.createElement('button');
      btn.className = 'ov-item';
      btn.type = 'button';
      btn.dataset.index = String(i);

      var thumb = document.createElement('div');
      thumb.className = 'ov-thumb';

      var inner = document.createElement('div');
      inner.className = 'ov-thumb-inner';

      var clone = slide.cloneNode(true);
      clone.classList.add('is-active');
      clone.removeAttribute('id');
      clone.removeAttribute('aria-hidden');
      Array.prototype.forEach.call(clone.querySelectorAll('[id]'), function (n) { n.removeAttribute('id'); });
      Array.prototype.forEach.call(clone.querySelectorAll('video'), function (n) { n.removeAttribute('autoplay'); n.pause && n.pause(); });
      Array.prototype.forEach.call(clone.querySelectorAll('.slide-notes'), function (n) { n.remove(); });
      /* la miniatura muestra el determinante completo, no un paso a medias */
      Array.prototype.forEach.call(clone.querySelectorAll('[data-step]'), function (n) { n.dataset.step = '0'; });

      /* un canvas clonado nace en blanco: copiamos el mapa de bits del original */
      var srcCanvas = slide.querySelectorAll('canvas');
      var dstCanvas = clone.querySelectorAll('canvas');
      for (var c = 0; c < dstCanvas.length && c < srcCanvas.length; c++) {
        if (!srcCanvas[c].width || !srcCanvas[c].height) continue;
        dstCanvas[c].width = srcCanvas[c].width;
        dstCanvas[c].height = srcCanvas[c].height;
        try { dstCanvas[c].getContext('2d').drawImage(srcCanvas[c], 0, 0); } catch (err) {}
      }

      clone.style.transition = 'none';
      inner.appendChild(clone);
      thumb.appendChild(inner);

      var meta = document.createElement('div');
      meta.className = 'ov-meta';
      meta.innerHTML = '<span class="n">' + String(i + 1).padStart(2, '0') + '</span><span class="t"></span>';
      meta.querySelector('.t').textContent = slide.dataset.title || '';

      btn.appendChild(thumb);
      btn.appendChild(meta);
      btn.addEventListener('click', function () {
        go(parseInt(this.dataset.index, 10));
        toggleOverview(false);
      });
      frag.appendChild(btn);
    });

    elOverviewGrid.appendChild(frag);
    overviewBuilt = true;
    scaleThumbs();
  }

  function scaleThumbs() {
    var items = elOverviewGrid.querySelectorAll('.ov-thumb');
    for (var i = 0; i < items.length; i++) {
      var w = items[i].clientWidth;
      if (!w) continue;
      items[i].querySelector('.ov-thumb-inner').style.transform = 'scale(' + (w / 1600) + ')';
    }
  }

  function syncOverviewCurrent() {
    var items = elOverviewGrid.querySelectorAll('.ov-item');
    for (var i = 0; i < items.length; i++) {
      items[i].setAttribute('aria-current', String(i === index));
    }
  }

  function toggleOverview(force) {
    overviewOpen = typeof force === 'boolean' ? force : !overviewOpen;
    if (overviewOpen) {
      buildOverview();
      scaleThumbs();
      syncOverviewCurrent();
    }
    elOverview.classList.toggle('is-open', overviewOpen);
    elOverview.setAttribute('aria-hidden', String(!overviewOpen));
    btnOverview.setAttribute('aria-pressed', String(overviewOpen));
  }

  /* ---------- ayuda ---------- */

  function toggleHelp(force) {
    helpOpen = typeof force === 'boolean' ? force : !helpOpen;
    elHelp.classList.toggle('is-open', helpOpen);
    elHelp.setAttribute('aria-hidden', String(!helpOpen));
  }

  /* ---------- cronómetro ---------- */

  var t0 = null;
  var tick = null;

  function startTimer() {
    if (t0 !== null) return;
    t0 = Date.now();
    tick = setInterval(renderTimer, 1000);
    renderTimer();
  }

  function renderTimer() {
    if (t0 === null) { elTimer.textContent = '00:00'; return; }
    var s = Math.floor((Date.now() - t0) / 1000);
    elTimer.textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }

  function resetTimer() {
    t0 = Date.now();
    renderTimer();
  }

  /* ---------- pantalla completa ---------- */

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      var p = document.documentElement.requestFullscreen();
      if (p && p.catch) p.catch(function () {});
    } else {
      document.exitFullscreen();
    }
  }

  /* ---------- teclado ---------- */

  var digits = '';
  var digitTimer = null;

  document.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var k = e.key;

    if (k === 'Escape') {
      if (overviewOpen) { toggleOverview(false); e.preventDefault(); return; }
      if (helpOpen) { toggleHelp(false); e.preventDefault(); return; }
      if (notesOpen) { toggleNotes(false); e.preventDefault(); return; }
      return;
    }

    if (k >= '0' && k <= '9') {
      digits += k;
      clearTimeout(digitTimer);
      digitTimer = setTimeout(function () {
        var n = parseInt(digits, 10);
        digits = '';
        if (!isNaN(n) && n >= 1 && n <= total) go(n - 1);
      }, 550);
      e.preventDefault();
      return;
    }

    switch (k) {
      case 'ArrowRight': case 'PageDown': case ' ': case 'Enter':
        next(); e.preventDefault(); break;
      case 'ArrowLeft': case 'PageUp': case 'Backspace':
        prev(); e.preventDefault(); break;
      case 'ArrowDown': next(); e.preventDefault(); break;
      case 'ArrowUp': prev(); e.preventDefault(); break;
      case 'Home': go(0); e.preventDefault(); break;
      case 'End': go(total - 1); e.preventDefault(); break;
      case 'n': case 'N': toggleNotes(); e.preventDefault(); break;
      case 'o': case 'O': toggleOverview(); e.preventDefault(); break;
      case 'f': case 'F': toggleFullscreen(); e.preventDefault(); break;
      case 'r': case 'R': resetTimer(); e.preventDefault(); break;
      case '?': toggleHelp(); e.preventDefault(); break;
      default: break;
    }
  });

  /* ---------- puntero / táctil ---------- */

  document.getElementById('btn-prev').addEventListener('click', prev);
  document.getElementById('btn-next').addEventListener('click', next);
  btnNotes.addEventListener('click', function () { toggleNotes(); });
  btnOverview.addEventListener('click', function () { toggleOverview(); });
  document.getElementById('btn-full').addEventListener('click', toggleFullscreen);
  document.getElementById('btn-help').addEventListener('click', function () { toggleHelp(); });
  document.getElementById('overview-close').addEventListener('click', function () { toggleOverview(false); });

  var tx = 0, ty = 0;
  document.addEventListener('touchstart', function (e) {
    tx = e.changedTouches[0].clientX;
    ty = e.changedTouches[0].clientY;
  }, { passive: true });

  document.addEventListener('touchend', function (e) {
    var dx = e.changedTouches[0].clientX - tx;
    var dy = e.changedTouches[0].clientY - ty;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0) next(); else prev();
    }
  }, { passive: true });

  /* ---------- ciclo de vida ---------- */

  var resizeRaf = 0;
  window.addEventListener('resize', function () {
    if (resizeRaf) cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(function () {
      fitStage();
      if (window.Backdrop) window.Backdrop.resize();
      if (window.FieldViz) window.FieldViz.resizeAll();
      if (overviewBuilt) scaleThumbs();
      if (window.FieldViz) window.FieldViz.setActive(slides[index]);
      if (window.Backdrop) window.Backdrop.start();
    });
  });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      if (window.FieldViz) window.FieldViz.stopAll();
      if (window.Backdrop) window.Backdrop.stop();
    } else {
      if (window.FieldViz) window.FieldViz.setActive(slides[index]);
      if (window.Backdrop) window.Backdrop.start();
    }
  });

  fitStage();

  function boot() {
    if (window.Backdrop) {
      window.Backdrop.init(document.getElementById('bg-canvas'));
      window.Backdrop.start();
    }
    if (window.FieldViz) window.FieldViz.init(stage);
    var start = parseInt((location.hash || '').replace('#', ''), 10);
    index = 0;
    slides.forEach(function (s) {
      s.classList.remove('is-active');
      s.setAttribute('aria-hidden', 'true');
    });
    go(!isNaN(start) && start >= 1 && start <= total ? start - 1 : 0, { force: true });
    t0 = null;
    elTimer.textContent = '00:00';
  }

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(boot);
  } else {
    boot();
  }
})();
