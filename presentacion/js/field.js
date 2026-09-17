/* ============================================================
   field.js — visualizaciones de campo vectorial

   Tres modos, elegidos con data-mode en el <canvas>:

     flow    rejilla de flechas + partículas siguiendo las líneas
             de flujo. Opcional: rueda de paletas, silueta, fondo
             escalar.
     tracer  una mancha circular de trazadores con una cruz de
             material. Es LA visualización del rotacional: en un
             campo irrotacional la cruz se deforma pero no gira;
             en uno con rotación gira como un sólido rígido.
     rotor   rejilla de marcadores que giran a ω = ½·rot F medido
             en su propio punto. Muestra que el rotacional puede
             cambiar de magnitud y de signo de un punto a otro.

   Todo se detiene cuando su diapositiva no está en pantalla.
   ============================================================ */

(function (global) {
  'use strict';

  var REDUCED = global.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ============================================================
     CAMPOS
     f(x,y)    → [P, Q]
     curl(x,y) → componente k del rotacional (analítica)
     ============================================================ */

  var FIELDS = {
    /* flujo laminar uniforme: F = (1, 0) → rot F = 0 */
    laminar: { f: function () { return [1, 0]; }, curl: function () { return 0; }, hue: 'cyan', scale: 0.34 },

    /* remolino rígido: F = (−y, x) → rot F = (0, 0, 2) */
    vortex: { f: function (x, y) { return [-y, x]; }, curl: function () { return 2; }, hue: 'magenta', scale: 0.34 },

    /* campo gradiente f = xy → F = (y, x), rot F = 0.
       Es el corte en z = 1 del ejemplo 1: F = (yz, xz, xy). */
    gradient: { f: function (x, y) { return [y, x]; }, curl: function () { return 0; }, hue: 'cyan', scale: 0.34 },

    /* gradiente de un cerro f = exp(−1.4 r²) → apunta a la cima */
    hill: {
      f: function (x, y) {
        var e = Math.exp(-1.4 * (x * x + y * y));
        return [-2.8 * x * e, -2.8 * y * e];
      },
      curl: function () { return 0; },
      hue: 'violet',
      scale: 0.9
    },

    /* fuente radial: divergencia positiva, rotacional nulo */
    source: {
      f: function (x, y) {
        var r = Math.hypot(x, y) + 0.22;
        return [x / r, y / r];
      },
      curl: function () { return 0; },
      hue: 'cyan',
      scale: 0.42
    },

    /* líneas de campo magnético alrededor de un conductor */
    ampere: {
      f: function (x, y) {
        var r2 = x * x + y * y + 0.035;
        return [-y / r2 * 0.22, x / r2 * 0.22];
      },
      curl: function () { return 1.4; },
      hue: 'violet',
      scale: 0.5
    },

    /* corte z = 1 del ejemplo 3: F = (x²y, −x) */
    general: {
      f: function (x, y) { return [x * x * y * 1.6, -x * 1.1]; },
      curl: function (x) { return -1 - x * x; },
      hue: 'magenta',
      scale: 0.42
    },

    /* varios vórtices de signo alterno: vorticidad repartida */
    turbulence: {
      f: function (x, y) {
        var cores = [[-0.85, 0.30, 0.30], [0.10, -0.42, -0.26], [0.95, 0.34, 0.24], [-0.25, -0.75, 0.18], [0.66, 0.78, -0.20]];
        var u = 0.18, v = 0;
        for (var i = 0; i < cores.length; i++) {
          var dx = x - cores[i][0], dy = y - cores[i][1];
          var r2 = dx * dx + dy * dy + 0.07;
          u += -cores[i][2] * dy / r2;
          v += cores[i][2] * dx / r2;
        }
        return [u, v];
      },
      curl: function () { return 1.1; },
      hue: 'magenta',
      scale: 0.42
    },

    /* Flujo uniforme + dipolo (abre el flujo alrededor del cuerpo) +
       vórtice ligado (la circulación). El vórtice acelera el aire por
       encima del perfil y lo frena por debajo, y deja estela descendente
       detrás: es el mecanismo que explica la sustentación. */
    airfoil: {
      f: function (x, y) {
        var s = 1.15;                       /* extensión espacial del perfil */
        var dx = x / s, dy = (y * 1.5) / s;
        var r2 = dx * dx + dy * dy + 0.16;
        var r4 = r2 * r2;
        var u = 1, v = 0;
        u += 0.30 * (dy * dy - dx * dx) / r4;   /* dipolo */
        v += -0.60 * dx * dy / r4;
        u += 0.42 * dy / r2;                     /* circulación */
        v += -0.42 * dx / r2;
        return [u, v];
      },
      curl: function () { return 0.9; },
      hue: 'cyan',
      scale: 1.1
    }
  };

  /* rotacional en función del punto, para el modo rotor.
     Ejemplo 3: componente k = −z − x², con y haciendo de z. */
  var CURLMAPS = {
    ex3: function (x, y) { return -y - x * x; },
    vortex: function () { return 2; }
  };

  var PALETTE = {
    cyan: { arrow: 'rgba(0, 225, 255, ', particle: 'rgba(120, 245, 255, ', solid: '#00ffff', rgb: '0,225,255' },
    magenta: { arrow: 'rgba(255, 90, 235, ', particle: 'rgba(255, 150, 245, ', solid: '#ff00ff', rgb: '255,90,235' },
    violet: { arrow: 'rgba(150, 125, 255, ', particle: 'rgba(185, 165, 255, ', solid: '#7b61ff', rgb: '150,125,255' }
  };

  /* ============================================================
     INSTANCIA
     ============================================================ */

  function Viz(canvas) {
    var d = canvas.dataset;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.mode = d.mode || 'flow';
    this.spec = FIELDS[d.field] || FIELDS.vortex;
    this.pal = PALETTE[d.hue || this.spec.hue];
    this.showWheel = d.wheel === 'true';
    this.shape = d.shape || null;
    this.scalar = d.scalar || null;
    this.curlMap = CURLMAPS[d.curlmap] || null;
    this.density = parseInt(d.density || '26', 10);
    this.particles = [];
    this.raf = 0;
    this.running = false;
    this.wheelAngle = 0;
    this.t = 0;
    this.last = 0;
    this.resize();
  }

  Viz.prototype.resize = function () {
    var w = this.canvas.clientWidth;
    var h = this.canvas.clientHeight;
    if (!w || !h) return;
    var q = Math.min(3, (global.devicePixelRatio || 1) * (global.__stageScale || 1));
    this.w = w;
    this.h = h;
    this.canvas.width = Math.round(w * q);
    this.canvas.height = Math.round(h * q);
    this.ctx.setTransform(q, 0, 0, q, 0, 0);
    this.u = Math.min(w, h) / 2.05;
    this.cx = w / 2;
    this.cy = h / 2;
    if (this.mode === 'flow') { this.seed(); this.drawStatic(); }
    if (this.mode === 'tracer') { this.drawStatic(); this.resetBlob(); }
    this.paint(0);
  };

  Viz.prototype.toPx = function (x, y) { return [this.cx + x * this.u, this.cy - y * this.u]; };
  Viz.prototype.toMath = function (px, py) { return [(px - this.cx) / this.u, (this.cy - py) / this.u]; };

  /* ---------- capa estática de flechas ---------- */

  Viz.prototype.drawStatic = function () {
    var c = document.createElement('canvas');
    var q = Math.min(3, (global.devicePixelRatio || 1) * (global.__stageScale || 1));
    c.width = this.canvas.width;
    c.height = this.canvas.height;
    var g = c.getContext('2d');
    g.setTransform(q, 0, 0, q, 0, 0);

    var faint = this.mode === 'tracer';
    var step = Math.max(34, Math.min(this.w, this.h) / (this.density / 3.2));
    var arrowLen = step * 0.46;
    var maxMag = 1e-4, pts = [], i, j;

    for (i = step / 2; i < this.w; i += step) {
      for (j = step / 2; j < this.h; j += step) {
        var mm = this.toMath(i, j);
        var v = this.spec.f(mm[0], mm[1]);
        var m = Math.hypot(v[0], v[1]);
        if (m > maxMag) maxMag = m;
        pts.push([i, j, v[0], v[1], m]);
      }
    }

    for (i = 0; i < pts.length; i++) {
      var p = pts[i];
      var norm = p[4] / maxMag;
      if (norm < 0.035) continue;
      var ux = p[2] / (p[4] || 1);
      var uy = -p[3] / (p[4] || 1);
      var L = arrowLen * (0.42 + 0.58 * Math.min(1, norm));
      var a = (0.18 + 0.42 * Math.min(1, norm)) * (faint ? 0.5 : 1);
      this.arrow(g, p[0] - ux * L / 2, p[1] - uy * L / 2, ux, uy, L, this.pal.arrow + a.toFixed(3) + ')');
    }
    this.staticLayer = c;
  };

  Viz.prototype.arrow = function (g, x, y, ux, uy, L, color) {
    var ex = x + ux * L, ey = y + uy * L;
    g.strokeStyle = color;
    g.fillStyle = color;
    g.lineWidth = 1.15;
    g.lineCap = 'round';
    g.beginPath(); g.moveTo(x, y); g.lineTo(ex, ey); g.stroke();
    var hs = Math.max(3.2, L * 0.3);
    g.beginPath();
    g.moveTo(ex, ey);
    g.lineTo(ex - ux * hs + uy * hs * 0.5, ey - uy * hs - ux * hs * 0.5);
    g.lineTo(ex - ux * hs - uy * hs * 0.5, ey - uy * hs + ux * hs * 0.5);
    g.closePath(); g.fill();
  };

  /* ============================================================
     MODO FLOW
     ============================================================ */

  Viz.prototype.seed = function () {
    var n = Math.max(40, Math.min(220, Math.round((this.w * this.h) / 2600)));
    this.particles.length = 0;
    for (var i = 0; i < n; i++) this.particles.push(this.spawn(true));
  };

  Viz.prototype.spawn = function (anywhere) {
    var ax = this.w / this.u / 2, ay = this.h / this.u / 2;
    return {
      x: (Math.random() * 2 - 1) * ax,
      y: (Math.random() * 2 - 1) * ay,
      life: anywhere ? Math.random() : 0,
      span: 2.4 + Math.random() * 2.6
    };
  };

  Viz.prototype.paintFlow = function (g, dt) {
    var ax = this.w / this.u / 2 + 0.25, ay = this.h / this.u / 2 + 0.25;
    g.lineCap = 'round';
    for (var i = 0; i < this.particles.length; i++) {
      var p = this.particles[i];
      var v = this.spec.f(p.x, p.y);
      var s = this.spec.scale;
      var nx = p.x + v[0] * s * dt, ny = p.y + v[1] * s * dt;
      p.life += dt;
      if (p.life > p.span || nx < -ax || nx > ax || ny < -ay || ny > ay) { this.particles[i] = this.spawn(false); continue; }
      var a = this.toPx(p.x, p.y), b = this.toPx(nx, ny);
      var fade = Math.min(1, p.life * 2.2) * Math.min(1, (p.span - p.life) * 1.6);
      g.strokeStyle = this.pal.particle + (0.55 * fade).toFixed(3) + ')';
      g.lineWidth = 1.8;
      g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
      g.fillStyle = this.pal.particle + (0.9 * fade).toFixed(3) + ')';
      g.beginPath(); g.arc(b[0], b[1], 1.7, 0, Math.PI * 2); g.fill();
      p.x = nx; p.y = ny;
    }
  };

  /* rueda de paletas: gira a ω = ½ · rot F */
  Viz.prototype.drawWheel = function (g) {
    var R = Math.min(this.w, this.h) * 0.13, blades = 6, b;
    g.save();
    g.translate(this.cx, this.cy);
    g.rotate(this.wheelAngle);
    g.strokeStyle = this.pal.solid;
    g.lineWidth = 2;
    for (b = 0; b < blades; b++) {
      g.save(); g.rotate((b / blades) * Math.PI * 2);
      g.beginPath(); g.moveTo(0, 0); g.lineTo(R, 0); g.stroke();
      g.beginPath(); g.moveTo(R * 0.62, -R * 0.2); g.lineTo(R, 0); g.lineTo(R * 0.62, R * 0.2); g.closePath();
      g.globalAlpha = 0.28; g.fillStyle = this.pal.solid; g.fill(); g.globalAlpha = 1;
      g.restore();
    }
    g.beginPath(); g.arc(0, 0, R * 0.14, 0, Math.PI * 2); g.fillStyle = this.pal.solid; g.fill();
    g.restore();
    g.globalAlpha = 0.35; g.strokeStyle = this.pal.solid; g.lineWidth = 1;
    g.setLineDash([4, 5]);
    g.beginPath(); g.arc(this.cx, this.cy, R * 1.22, 0, Math.PI * 2); g.stroke();
    g.setLineDash([]); g.globalAlpha = 1;
  };

  /* silueta de perfil alar (Joukowski simplificado) */
  Viz.prototype.drawAirfoil = function (g) {
    /* cuerda proporcional al alto del marco, no a su lado menor: en un
       marco ancho y bajo el perfil se quedaba diminuto */
    var s = Math.min(this.w * 0.30, this.h * 1.25), i, x, yt, yc, a;
    g.beginPath();
    for (i = 0; i <= 40; i++) {
      a = i / 40; x = a;
      yt = 0.17 * (1.4845 * Math.sqrt(x) - 0.63 * x - 1.758 * x * x + 1.4215 * x * x * x - 0.5075 * Math.pow(x, 4));
      yc = 0.09 * (2 * x - x * x);
      g.lineTo(this.cx + (x - 0.5) * s, this.cy - (yc + yt) * s);
    }
    for (i = 40; i >= 0; i--) {
      a = i / 40; x = a;
      yt = 0.17 * (1.4845 * Math.sqrt(x) - 0.63 * x - 1.758 * x * x + 1.4215 * x * x * x - 0.5075 * Math.pow(x, 4));
      yc = 0.09 * (2 * x - x * x);
      g.lineTo(this.cx + (x - 0.5) * s, this.cy - (yc - yt) * s);
    }
    g.closePath();
    g.fillStyle = 'rgba(8, 12, 24, 0.92)';
    g.fill();
    g.strokeStyle = 'rgba(180, 230, 255, 0.75)';
    g.lineWidth = 1.4;
    g.stroke();
  };

  /* fondo escalar: el "cerro" cuyo gradiente se está dibujando */
  Viz.prototype.drawScalar = function (g) {
    var r = Math.min(this.w, this.h) * 0.52;
    var grd = g.createRadialGradient(this.cx, this.cy, 0, this.cx, this.cy, r);
    grd.addColorStop(0, 'rgba(150, 125, 255, 0.34)');
    grd.addColorStop(0.45, 'rgba(150, 125, 255, 0.12)');
    grd.addColorStop(1, 'rgba(150, 125, 255, 0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, this.w, this.h);
    g.strokeStyle = 'rgba(180, 160, 255, 0.16)';
    g.lineWidth = 1;
    for (var k = 1; k <= 4; k++) {
      g.beginPath(); g.arc(this.cx, this.cy, r * k / 5, 0, Math.PI * 2); g.stroke();
    }
  };

  /* ============================================================
     MODO TRACER — deformación frente a rotación
     ============================================================ */

  var BLOB_N = 64;
  var BLOB_R = 0.34;
  var BLOB_T = 3.6;   // segundos de advección
  var BLOB_FADE = 0.7; // segundos de desvanecido antes de reiniciar

  Viz.prototype.resetBlob = function () {
    this.blob = [];
    for (var i = 0; i < BLOB_N; i++) {
      var a = (i / BLOB_N) * Math.PI * 2;
      this.blob.push([Math.cos(a) * BLOB_R, Math.sin(a) * BLOB_R]);
    }
    /* cruz de material: dos brazos inicialmente perpendiculares */
    this.armA = [BLOB_R, 0];
    this.armB = [0, BLOB_R];
    this.blobT = 0;
  };

  /* un paso de punto medio sobre el campo */
  Viz.prototype.advect = function (p, dt) {
    var s = this.spec.scale;
    var v1 = this.spec.f(p[0], p[1]);
    var mx = p[0] + v1[0] * s * dt * 0.5, my = p[1] + v1[1] * s * dt * 0.5;
    var v2 = this.spec.f(mx, my);
    return [p[0] + v2[0] * s * dt, p[1] + v2[1] * s * dt];
  };

  Viz.prototype.paintTracer = function (g, dt) {
    var i, p, alpha = 1;

    if (!REDUCED) {
      this.blobT += dt;
      if (this.blobT > BLOB_T + BLOB_FADE) this.resetBlob();
      if (this.blobT < BLOB_T) {
        for (i = 0; i < this.blob.length; i++) this.blob[i] = this.advect(this.blob[i], dt);
        this.armA = this.advect(this.armA, dt);
        this.armB = this.advect(this.armB, dt);
      } else {
        alpha = 1 - (this.blobT - BLOB_T) / BLOB_FADE;
      }
      alpha *= Math.min(1, this.blobT * 4);   /* entrada suave */
    }

    /* círculo de referencia: la forma inicial, para comparar */
    var c = this.toPx(0, 0);
    g.setLineDash([3, 5]);
    g.strokeStyle = 'rgba(255,255,255,0.16)';
    g.lineWidth = 1;
    g.beginPath(); g.arc(c[0], c[1], BLOB_R * this.u, 0, Math.PI * 2); g.stroke();
    g.setLineDash([]);

    /* la mancha deformada */
    g.beginPath();
    for (i = 0; i < this.blob.length; i++) {
      p = this.toPx(this.blob[i][0], this.blob[i][1]);
      if (i === 0) g.moveTo(p[0], p[1]); else g.lineTo(p[0], p[1]);
    }
    g.closePath();
    g.fillStyle = 'rgba(' + this.pal.rgb + ',' + (0.13 * alpha).toFixed(3) + ')';
    g.fill();
    g.strokeStyle = 'rgba(' + this.pal.rgb + ',' + (0.85 * alpha).toFixed(3) + ')';
    g.lineWidth = 1.8;
    g.stroke();

    /* la cruz de material: es la que delata si hay rotación o no */
    var arms = [[this.armA, '#ffffff'], [this.armB, this.pal.solid]];
    for (i = 0; i < arms.length; i++) {
      var e = this.toPx(arms[i][0][0], arms[i][0][1]);
      g.strokeStyle = arms[i][1];
      g.globalAlpha = 0.9 * alpha;
      g.lineWidth = 2.2;
      g.lineCap = 'round';
      g.beginPath(); g.moveTo(c[0], c[1]); g.lineTo(e[0], e[1]); g.stroke();
      g.beginPath(); g.arc(e[0], e[1], 3.4, 0, Math.PI * 2);
      g.fillStyle = arms[i][1]; g.fill();
      g.globalAlpha = 1;
    }
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.beginPath(); g.arc(c[0], c[1], 2.6, 0, Math.PI * 2); g.fill();
  };

  /* ============================================================
     MODO ROTOR — el rotacional punto por punto
     ============================================================ */

  Viz.prototype.paintRotor = function (g, dt) {
    if (!REDUCED) this.t += dt;
    var cols = 7, rows = 5;
    var maxAbs = 0.001, vals = [], i, j;

    for (i = 0; i < cols; i++) {
      for (j = 0; j < rows; j++) {
        var px = (i + 0.5) / cols * this.w;
        var py = (j + 0.5) / rows * this.h;
        var m = this.toMath(px, py);
        var k = this.curlMap(m[0], m[1]);
        if (Math.abs(k) > maxAbs) maxAbs = Math.abs(k);
        vals.push([px, py, k]);
      }
    }

    for (i = 0; i < vals.length; i++) {
      var x = vals[i][0], y = vals[i][1], k = vals[i][2];
      var norm = Math.abs(k) / maxAbs;
      var R = Math.min(this.w, this.h) * (0.030 + 0.048 * norm);
      var rgb = k >= 0 ? '0,225,255' : '255,90,235';

      /* disco tenue: magnitud del rotacional en ese punto */
      var grd = g.createRadialGradient(x, y, 0, x, y, R * 2.1);
      grd.addColorStop(0, 'rgba(' + rgb + ',' + (0.17 * norm).toFixed(3) + ')');
      grd.addColorStop(1, 'rgba(' + rgb + ',0)');
      g.fillStyle = grd;
      g.beginPath(); g.arc(x, y, R * 2.1, 0, Math.PI * 2); g.fill();

      /* marcador girando a ω = ½·rot F, en el sentido que marca el signo */
      var ang = this.t * 0.5 * k * 0.9;
      g.save();
      g.translate(x, y);
      g.rotate(k >= 0 ? ang : ang);
      g.strokeStyle = 'rgba(' + rgb + ',' + (0.35 + 0.5 * norm).toFixed(3) + ')';
      g.lineWidth = 1.7;
      g.lineCap = 'round';
      var dir = k >= 0 ? 1 : -1;
      g.beginPath();
      g.arc(0, 0, R, -0.35 * Math.PI, 0.95 * Math.PI, dir < 0);
      g.stroke();
      /* punta de flecha para que el sentido de giro sea inequívoco */
      var ea = dir > 0 ? 0.95 * Math.PI : -0.35 * Math.PI;
      var ex = Math.cos(ea) * R, ey = Math.sin(ea) * R;
      var tx = -Math.sin(ea) * dir, ty = Math.cos(ea) * dir;
      var hs = R * 0.48;
      g.fillStyle = 'rgba(' + rgb + ',' + (0.45 + 0.5 * norm).toFixed(3) + ')';
      g.beginPath();
      g.moveTo(ex + tx * hs, ey + ty * hs);
      g.lineTo(ex - tx * hs * 0.25 + Math.cos(ea) * hs * 0.55, ey - ty * hs * 0.25 + Math.sin(ea) * hs * 0.55);
      g.lineTo(ex - tx * hs * 0.25 - Math.cos(ea) * hs * 0.55, ey - ty * hs * 0.25 - Math.sin(ea) * hs * 0.55);
      g.closePath(); g.fill();
      g.restore();
    }
  };

  /* ============================================================
     PINTADO Y BUCLE
     ============================================================ */

  Viz.prototype.paint = function (dt) {
    var g = this.ctx;
    if (!this.w) return;
    g.clearRect(0, 0, this.w, this.h);

    if (this.scalar) this.drawScalar(g);

    if (this.staticLayer) {
      g.save();
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.drawImage(this.staticLayer, 0, 0);
      g.restore();
    }

    if (this.mode === 'flow') {
      if (!REDUCED) this.paintFlow(g, dt);
      if (this.shape === 'airfoil') this.drawAirfoil(g);
      if (this.showWheel) {
        if (!REDUCED) this.wheelAngle += 0.5 * this.spec.curl(0, 0) * dt * 0.75;
        this.drawWheel(g);
      }
    } else if (this.mode === 'tracer') {
      this.paintTracer(g, dt);
    } else if (this.mode === 'rotor') {
      this.paintRotor(g, dt);
    }
  };

  Viz.prototype.start = function () {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    var self = this;
    (function loop(t) {
      if (!self.running) return;
      var dt = Math.min(0.05, (t - self.last) / 1000);
      self.last = t;
      self.paint(dt);
      self.raf = requestAnimationFrame(loop);
    })(performance.now());
  };

  Viz.prototype.stop = function () {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  };

  /* ---------- registro ---------- */

  var registry = [];

  global.FieldViz = {
    init: function (root) {
      var nodes = (root || document).querySelectorAll('canvas[data-field], canvas[data-curlmap]');
      for (var i = 0; i < nodes.length; i++) {
        var v = new Viz(nodes[i]);
        nodes[i].__field = v;
        registry.push(v);
      }
    },
    resizeAll: function () { for (var i = 0; i < registry.length; i++) registry[i].resize(); },
    setActive: function (slideEl) {
      for (var i = 0; i < registry.length; i++) {
        var v = registry[i];
        if (slideEl && slideEl.contains(v.canvas)) {
          if (!v.w) v.resize();
          if (v.mode === 'tracer') v.resetBlob();   /* el experimento arranca de cero */
          v.start();
        } else {
          v.stop();
        }
      }
    },
    stopAll: function () { for (var i = 0; i < registry.length; i++) registry[i].stop(); }
  };
})(window);
