/* ============================================================
   backdrop.js — líneas de campo de fondo

   No es una textura decorativa: son streamlines reales de un
   campo vectorial con rotacional, integradas con Runge-Kutta 4
   sobre una superposición de vórtices de signo alterno. Las
   curvas que se ven son las trayectorias que seguiría una
   partícula soltada en ese campo.

   Coste: una integración por fotograma (rotando el índice), así
   que el campo se deforma de forma continua sin recalcular las
   56 líneas cada vez.
   ============================================================ */

(function (global) {
  'use strict';

  var REDUCED = global.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var LINES = 56;      // número de líneas de campo
  var STEPS = 104;     // puntos por línea
  var STEP = 0.030;    // paso de integración (longitud de arco normalizada)
  var SOFT = 0.055;    // suavizado del núcleo: evita la singularidad en r = 0
  var DRIFT = 0.10;    // flujo uniforme de fondo

  /* Vórtices de signo alterno: unos giran a favor del reloj y otros
     en contra, así el fondo muestra rotacional positivo y negativo. */
  var CORES = [
    { ox: -0.92, oy:  0.20, g:  0.115, r: 0.10, s: 0.055, ph: 0.0 },
    { ox:  0.05, oy: -0.34, g: -0.095, r: 0.13, s: 0.041, ph: 1.9 },
    { ox:  0.98, oy:  0.28, g:  0.105, r: 0.11, s: 0.049, ph: 3.4 },
    { ox: -0.38, oy: -0.62, g: -0.070, r: 0.09, s: 0.063, ph: 5.1 },
    { ox:  0.62, oy:  0.66, g:  0.078, r: 0.12, s: 0.036, ph: 2.6 }
  ];

  var TINTS = [
    [122, 226, 255],  // cian
    [122, 226, 255],
    [122, 226, 255],
    [162, 140, 255],  // violeta
    [162, 140, 255],
    [255, 130, 240]   // magenta
  ];

  function Backdrop(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.lines = [];
    this.cursor = 0;
    this.t = 0;
    this.raf = 0;
    this.running = false;
    this.last = 0;
    this.resize();
  }

  Backdrop.prototype.resize = function () {
    var w = this.canvas.clientWidth;
    var h = this.canvas.clientHeight;
    if (!w || !h) return;
    var q = Math.min(2, (global.devicePixelRatio || 1) * (global.__stageScale || 1));
    this.w = w;
    this.h = h;
    this.canvas.width = Math.round(w * q);
    this.canvas.height = Math.round(h * q);
    this.ctx.setTransform(q, 0, 0, q, 0, 0);
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ax = w / h;               // semiancho del dominio
    this.build();
    this.paint();
  };

  /* posición de los núcleos en el instante t (órbitas muy lentas) */
  Backdrop.prototype.cores = function () {
    var out = [];
    for (var i = 0; i < CORES.length; i++) {
      var c = CORES[i];
      out.push({
        x: c.ox + Math.cos(this.t * c.s + c.ph) * c.r,
        y: c.oy + Math.sin(this.t * c.s * 0.82 + c.ph) * c.r * 0.7,
        g: c.g
      });
    }
    return out;
  };

  /* campo: flujo uniforme + suma de vórtices puntuales */
  Backdrop.prototype.field = function (x, y, cores) {
    var u = DRIFT, v = 0;
    for (var i = 0; i < cores.length; i++) {
      var c = cores[i];
      var dx = x - c.x, dy = y - c.y;
      var r2 = dx * dx + dy * dy + SOFT;
      u += -c.g * dy / r2;
      v += c.g * dx / r2;
    }
    return [u, v];
  };

  /* un paso RK4 sobre el campo normalizado: puntos equiespaciados */
  Backdrop.prototype.step = function (x, y, h, cores) {
    var self = this;
    function dir(px, py) {
      var f = self.field(px, py, cores);
      var m = Math.hypot(f[0], f[1]) || 1e-6;
      return [f[0] / m, f[1] / m];
    }
    var k1 = dir(x, y);
    var k2 = dir(x + k1[0] * h / 2, y + k1[1] * h / 2);
    var k3 = dir(x + k2[0] * h / 2, y + k2[1] * h / 2);
    var k4 = dir(x + k3[0] * h, y + k3[1] * h);
    return [
      x + h * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]) / 6,
      y + h * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]) / 6
    ];
  };

  /* integra una línea hacia atrás y hacia delante desde su semilla */
  Backdrop.prototype.trace = function (line, cores) {
    var lim = this.ax + 0.45;
    var pts = [];
    var x, y, p, i;

    x = line.sx; y = line.sy;
    for (i = 0; i < STEPS / 2; i++) {
      p = this.step(x, y, -STEP, cores);
      x = p[0]; y = p[1];
      if (x < -lim || x > lim || y < -1.5 || y > 1.5) break;
      pts.unshift([x, y]);
    }
    x = line.sx; y = line.sy;
    pts.push([x, y]);
    for (i = 0; i < STEPS / 2; i++) {
      p = this.step(x, y, STEP, cores);
      x = p[0]; y = p[1];
      if (x < -lim || x > lim || y < -1.5 || y > 1.5) break;
      pts.push([x, y]);
    }
    line.pts = pts;
  };

  Backdrop.prototype.build = function () {
    var cores = this.cores();
    this.lines.length = 0;
    /* Semillas en rejilla con desorden: cobertura uniforme sin patrón
       visible. La rejilla se estira un poco más allá del encuadre para
       que no queden esquinas vacías cuando el flujo arrastra las líneas. */
    var cols = 8, rows = Math.ceil(LINES / 8);
    for (var i = 0; i < LINES; i++) {
      var c = i % cols, r = Math.floor(i / cols);
      var line = {
        sx: -this.ax * 1.06 + ((c + 0.5) / cols) * (this.ax * 2.12) + (Math.random() - 0.5) * 0.26,
        sy: -1.06 + ((r + 0.5) / rows) * 2.12 + (Math.random() - 0.5) * 0.24,
        ph: Math.random(),
        sp: 0.055 + Math.random() * 0.075,
        tint: TINTS[i % TINTS.length],
        pts: []
      };
      this.trace(line, cores);
      this.lines.push(line);
    }
  };

  Backdrop.prototype.px = function (x, y) {
    return [(x / this.ax) * (this.w / 2) + this.w / 2, this.h / 2 - y * (this.h / 2)];
  };

  Backdrop.prototype.paint = function () {
    var g = this.ctx, i, j, l, p;
    g.clearRect(0, 0, this.w, this.h);

    /* Capa 1 — todas las líneas de campo en un solo trazo */
    g.beginPath();
    for (i = 0; i < this.lines.length; i++) {
      l = this.lines[i];
      if (l.pts.length < 2) continue;
      p = this.px(l.pts[0][0], l.pts[0][1]);
      g.moveTo(p[0], p[1]);
      for (j = 1; j < l.pts.length; j++) {
        p = this.px(l.pts[j][0], l.pts[j][1]);
        g.lineTo(p[0], p[1]);
      }
    }
    g.strokeStyle = 'rgba(126, 186, 232, 0.085)';
    g.lineWidth = 1;
    g.stroke();

    if (REDUCED) return;

    /* Capa 2 — el destello que recorre cada línea, marcando el sentido del
       flujo. La cola se dibuja en 4 tramos de alfa creciente en vez de
       segmento a segmento: a esta escala se lee igual de suave y baja de
       ~1900 llamadas de trazo por fotograma a 448. */
    var CHUNKS = 4;
    var ALPHA = [0.05, 0.13, 0.24, 0.38];   /* cola → cabeza */

    for (i = 0; i < this.lines.length; i++) {
      l = this.lines[i];
      var n = l.pts.length;
      if (n < 14) continue;
      var head = Math.floor(l.ph * n);
      var len = Math.max(8, Math.round(n * 0.20));
      var t = l.tint;
      var rgb = t[0] + ',' + t[1] + ',' + t[2] + ',';

      for (var pass = 0; pass < 2; pass++) {
        g.lineWidth = pass === 0 ? 5.5 : 1.6;
        var scale = pass === 0 ? 0.16 : 1;   /* el halo, mucho más tenue */
        for (var ch = 0; ch < CHUNKS; ch++) {
          var from = head - len + Math.floor((ch / CHUNKS) * len);
          var to = head - len + Math.floor(((ch + 1) / CHUNKS) * len);
          if (to <= 0 || from >= n) continue;
          if (from < 0) from = 0;
          if (to > n - 1) to = n - 1;
          if (to - from < 1) continue;
          g.strokeStyle = 'rgba(' + rgb + (ALPHA[ch] * scale).toFixed(3) + ')';
          g.beginPath();
          var q = this.px(l.pts[from][0], l.pts[from][1]);
          g.moveTo(q[0], q[1]);
          for (var m = from + 1; m <= to; m++) {
            q = this.px(l.pts[m][0], l.pts[m][1]);
            g.lineTo(q[0], q[1]);
          }
          g.stroke();
        }
      }
    }
  };

  Backdrop.prototype.tick = function (dt) {
    this.t += dt;
    for (var i = 0; i < this.lines.length; i++) {
      this.lines[i].ph += this.lines[i].sp * dt;
      if (this.lines[i].ph > 1) this.lines[i].ph -= 1;
    }
    /* una línea por fotograma: el campo entero se renueva cada ~1 s */
    var cores = this.cores();
    this.trace(this.lines[this.cursor], cores);
    this.cursor = (this.cursor + 1) % this.lines.length;
    this.paint();
  };

  Backdrop.prototype.start = function () {
    if (this.running || REDUCED) return;
    this.running = true;
    this.last = performance.now();
    var self = this;
    (function loop(now) {
      if (!self.running) return;
      var dt = Math.min(0.05, (now - self.last) / 1000);
      self.last = now;
      self.tick(dt);
      self.raf = requestAnimationFrame(loop);
    })(performance.now());
  };

  Backdrop.prototype.stop = function () {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  };

  var instance = null;

  global.Backdrop = {
    init: function (canvas) {
      if (!canvas) return;
      instance = new Backdrop(canvas);
      return instance;
    },
    start: function () { if (instance) instance.start(); },
    stop: function () { if (instance) instance.stop(); },
    resize: function () { if (instance) instance.resize(); }
  };
})(window);
