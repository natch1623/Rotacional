# El Rotacional de un Campo Vectorial — presentación web

Presentación tipo PowerPoint hecha íntegramente en web. Escenario fijo de **1600 × 900 (16:9 exacto)** que se escala al tamaño de la pantalla, así que se ve idéntica en cualquier proyector o monitor.

## Cómo abrirla

Doble clic en `index.html`. Funciona **sin internet**: las tipografías están auto-hospedadas en `assets/fonts/` y no hay ninguna librería externa.

Si el navegador bloquea el video de la diapositiva 19 por la política de archivos locales, levanta un servidor:

```bash
python -m http.server 5173 --directory presentacion
```

y abre `http://localhost:5173`.

## Atajos de teclado

| Tecla | Acción |
|---|---|
| `→` `␣` `↓` | Siguiente diapositiva |
| `←` `↑` `⌫` | Diapositiva anterior |
| `1`…`28` | Ir directo a una diapositiva |
| `Inicio` / `Fin` | Primera / última |
| `N` | **Guion del expositor** (el texto del PDF, diapositiva por diapositiva) |
| `O` | Vista general con miniaturas reales |
| `F` | Pantalla completa |
| `R` | Reiniciar el cronómetro |
| `Esc` | Cerrar el panel abierto |

También funciona con clic en los controles de abajo y con deslizamiento lateral en pantallas táctiles.

## El guion del expositor

Cada diapositiva lleva el texto que le corresponde decir a su integrante, tomado del PDF original. Se abre con `N` y trae arriba a la derecha un cronómetro para controlar el tiempo de cada bloque. **El panel solo lo ve quien presenta si se usa pantalla extendida**; en pantalla espejada lo verá todo el público, así que conviene ensayar con él y cerrarlo antes de proyectar.

## Estructura

```
presentacion/
├── index.html          28 diapositivas + guion incrustado
├── css/
│   ├── fonts.css       IBM Plex Sans + JetBrains Mono (auto-hospedadas)
│   ├── deck.css        tokens, escenario 16:9, navegación, paneles
│   └── slides.css      componentes: tarjetas, determinante, fracciones, ecuaciones
├── js/
│   ├── backdrop.js     líneas de campo de fondo (streamlines RK4)
│   ├── field.js        campos vectoriales animados en canvas
│   └── deck.js         navegación, guion, vista general, cronómetro
├── media/
│   └── vorticidad.mp4   único archivo multimedia del deck
├── assets/fonts/
└── README.md
```

Salvo ese video, **todas las visualizaciones se calculan en el navegador**: no hay imágenes ni ningún otro archivo multimedia que cargar.

## El fondo: líneas de campo

`backdrop.js` dibuja el fondo de todo el deck, y no es una textura decorativa: son **streamlines reales**, integradas con **Runge-Kutta 4** sobre una superposición de cinco vórtices puntuales de signo alterno más un flujo uniforme débil. Cada curva es la trayectoria que seguiría una partícula soltada en ese campo, y como los vórtices alternan signo, el fondo muestra a la vez rotacional positivo y negativo.

- Los **destellos que recorren las líneas** marcan el sentido del flujo.
- Los núcleos **orbitan muy despacio** y se reintegra una línea por fotograma, así que el campo se deforma de forma continua sin recalcular las 56 curvas cada vez. El campo entero se renueva cada segundo aproximadamente.
- El centro se atenúa con una máscara radial: el texto siempre cae sobre la zona más tranquila.

**La intensidad respira con la charla.** Cada diapositiva la declara con `data-bg`, y cambia al mismo ritmo que la transición:

| `data-bg` | Opacidad | Dónde |
|---|---|---|
| `full` | 0.92 | Portada y cierre |
| `strong` | 0.58 | Las 7 divisorias de bloque |
| `quiet` | 0.30 | Las 19 diapositivas de contenido |

Coste medido: **2–4 ms por fotograma** incluso con lienzo de 2560×1440, muy por debajo de los 16,7 ms de un fotograma a 60 fps. Se detiene solo cuando la pestaña pasa a segundo plano, y con `prefers-reduced-motion` dibuja las líneas estáticas sin destellos ni bucle.

## Las animaciones de campo vectorial

`field.js` dibuja los campos concretos de cada diapositiva: **todo se calcula en el navegador** a partir de la función del campo, sin imágenes ni texturas. Hay tres modos, que se eligen con `data-mode` en el `<canvas>`:

### `flow` — rejilla de flechas + partículas

Las partículas siguen las líneas de flujo reales del campo. Admite extras: `data-wheel` (rueda de paletas girando a ω = ½·rot F), `data-shape="airfoil"` (silueta del perfil) y `data-scalar="hill"` (fondo escalar cuyo gradiente se dibuja).

| Campo | Fórmula | Rotacional | Diapositiva |
|---|---|---|---|
| `hill` | ∇(cerro gaussiano) | 0 | 4 · gradiente |
| `source` | F = (x, y)/r | 0 | 4 · divergencia |
| `vortex` | F = (−y, x) | (0, 0, 2) | 4, 7, 8, 22 |
| `laminar` | F = (1, 0) | 0 | 7 |
| `gradient` | F = (y, x) | 0 | 22 |
| `ampere` | B ∝ (−y, x)/r² | — | 18 |
| `turbulence` | 5 vórtices de signo alterno | ≠ 0 | 19 · junto al video |
| `airfoil` | uniforme + dipolo + vórtice ligado | ≠ 0 | 20 |
| `general` | corte del ejemplo 3 | ≠ 0 | disponible |

### `tracer` — deformación frente a rotación

**Es la visualización que de verdad explica el rotacional**, y la que enlaza los ejemplos 1 y 2: el mismo experimento, resultado opuesto. Una mancha circular de trazadores se deja llevar por el campo, con una **cruz de material** de dos brazos inicialmente perpendiculares.

| | Brazo A | Brazo B | Rotación neta | Ángulo entre brazos |
|---|---|---|---|---|
| **Ejemplo 1** · F = (y, x) · rot F = 0 | +40,3° | −40,3° | **0,00** | 90° → 9,4° |
| **Ejemplo 2** · F = (−y, x) · rot F = 2 | +71,4° | +71,4° | **71,43°** | 90° → 90° |

En el campo irrotacional los brazos giran en **sentidos opuestos** y se cierran uno contra otro: hay deformación pura, rotación cero. En el vórtice giran **en el mismo sentido** conservando su ángulo recto: rotación de sólido rígido. Los 71,4° son exactamente ω·t = ½·2·0,34·3,67 s — la animación no ilustra la teoría, la cumple.

## Los recorridos paso a paso

**12 diapositivas se explican solas**, recorriendo su contenido elemento a elemento: se atenúa todo salvo lo que toca en ese momento. Siempre el mismo gesto, para que el expositor no tenga que aprender nada distinto en cada una.

| Diapositiva | Recorre | Pasos |
|---|---|---|
| 4 · Operadores | gradiente → divergencia → rotacional | 3 |
| 9 · Clasificación | irrotacional → con rotación | 2 |
| **11 · Determinante** | la expansión por cofactores | 3 |
| **12 · Fórmula** | cada término **con su tarjeta** | 3 |
| 13 · Errores | los tres errores típicos | 3 |
| 15 · Interpretación | la cadena de implicaciones | 4 |
| 16 · Propiedades | las tres propiedades | 3 |
| 20 · Aerodinámica | circulación → sustentación → regla | 3 |
| 24, 25, 26 · Ejemplos | componente i → j → k del cálculo | 3 |
| 27 · Cierre | se calcula → se interpreta → se verifica | 3 |

**Arranca solo** 1,5 s después de que la diapositiva termina de entrar y cambia cada 2,1–2,6 s. **Un clic toma el control manual** y detiene el ciclo: en clase hace falta poder quedarse parado en la componente j, que es donde está el error del signo. También responde a `Enter` y espacio con el teclado — y ahí el espacio **no** pasa de diapositiva, que es lo que haría normalmente.

Con `prefers-reduced-motion` no arranca el ciclo automático, pero el clic sigue funcionando.

### La expansión por cofactores (diapositiva 11)

El determinante no solo entra fila por fila: después **se resuelve a la vista**. En cada paso tacha la fila 1 y una columna, dejando iluminado el menor 2×2 que produce esa componente.

| Paso | Vector | Menor 2×2 que queda |
|---|---|---|
| 1 | **i** | `∂/∂y ∂/∂z` · `Q R` |
| 2 | **j** | `∂/∂x ∂/∂z` · `P R` — con el distintivo **signo del cofactor** |
| 3 | **k** | `∂/∂x ∂/∂y` · `P Q` |

La 12 continúa donde la deja la 11: enciende cada término de la fórmula **a la vez que su tarjeta**, con el mismo color, para que se vea de dónde sale cada componente.

### Cómo añadir uno

Se marca el contenedor y sus elementos, sin tocar CSS ni JS:

```html
<div class="grid-3" data-steps="3" data-step="0" role="button" tabindex="0">
  <article class="card" data-t="1">…</article>
  <article class="card is-magenta" data-t="2">…</article>
  <article class="card is-violet" data-t="3">…</article>
</div>
```

`data-period` ajusta el ritmo en milisegundos. El JS los descubre solo al arrancar y marca el activo con `.is-on`; el énfasis lo pone cada tipo de elemento (las tarjetas se levantan, los términos de una fórmula se iluminan).

### `rotor` — el rotacional punto por punto

Rejilla de marcadores, cada uno girando a **ω = ½·rot F medido en su propia posición**, con el color marcando el signo (cian positivo, magenta negativo) y el tamaño la magnitud. Es la diapositiva del ejemplo 3, donde la componente k vale −z − x²: el fondo pasa de magenta arriba a cian abajo, dejando ver que el rotacional **cambia de magnitud y de signo según el punto**.

Se alimenta de `data-curlmap`, que apunta a la función analítica del rotacional, no del campo.

La rueda de paletas gira a velocidad **ω = ½ · rot F**, así que su giro no es decorativo: es el valor que se calcula en el ejemplo 2.

Las animaciones se detienen solas cuando su diapositiva no está en pantalla o la pestaña pasa a segundo plano, y respetan `prefers-reduced-motion` (dibujan el campo estático, sin partículas).

## Decisiones de diseño

- **Sistema visual:** generado con la skill `ui-ux-pro-max` (`--design-system`, variance 7 / motion 8 / density 4) → patrón *Immersive/Interactive Experience*, estilo *HUD / Sci-Fi FUI*, paleta cian + violeta + magenta sobre casi negro.
- **Tipografía:** par *Developer Mono* de la misma base — **IBM Plex Sans** para texto, **JetBrains Mono** para matemáticas, etiquetas y cifras. Se eligió sobre la recomendación por defecto (Orbitron) porque un deck de cálculo necesita una tipografía técnica legible, no una de videojuego.
- **Color con significado:** cian = el operador y los resultados nulos; violeta = el campo y la teoría; magenta = rotación distinta de cero. En el determinante, cada fila tiene su color, tal como pide el guion del integrante 6.
- **Matemáticas sin dependencias:** las fracciones, el determinante y las ecuaciones son HTML y CSS. Sin KaTeX ni MathJax, así que no hay nada que cargar ni que pueda fallar sin internet.
- **Movimiento** (criterios de la skill `animate`): solo `transform`, `opacity` y `clip-path`, curva `cubic-bezier(0.23, 1, 0.32, 1)`, y la diapositiva que sale se va en sentido contrario a la que entra.

## Las transiciones

Cada diapositiva tiene una **combinación única** de dos cosas, y ninguna se repite en las 28:

- `data-transition` — cómo entra la diapositiva completa.
- `data-anim-style` — cómo entra su contenido, escalonado cada 55 ms.

No son adornos intercambiables: la transición está elegida por lo que dice la diapositiva.

| Diapositiva | Transición | Por qué esa |
|---|---|---|
| 1 · Portada | `iris` | ∇ × F se abre desde el centro como un diafragma |
| 8 · Rueda de paletas | `spin` | la diapositiva **gira**, igual que la rueda |
| 11 · Determinante | `blade` | cae desde arriba y las tres filas se escriben una a una |
| 15 · Interpretación | `rise` + cadena | los cuatro eslabones caen en el orden en que se razonan |
| 18 · Maxwell | `iris` | el campo florece desde el conductor |
| 19 · Vorticidad | `spin` | **gira**, como el remolino |
| 20 · Aerodinámica | `wipe-up` | barre hacia arriba: sustentación |
| 25 · Ejemplo 2 | `spin` | es el campo que rota, rot F = (0, 0, 2) |
| 26 · Ejemplo 3 | `tilt` | gira en 3D sobre su eje izquierdo, como una página |
| 28 · Preguntas | `iris` | cierra el arco visual que abrió la portada |

El resto usa `push`, `zoom`, `recede`, `drop`, `unfold` y `wipe` combinadas con `rise`, `fall`, `left`, `right`, `pop`, `flip` y `fan`.

El escenario lleva `perspective: 2400px`, así que `tilt` y `blade` giran con **profundidad real**, no con una deformación plana.

**Barrido HUD:** las 7 divisorias de bloque disparan una línea de luz cian que cruza la pantalla (1,25 s). Solo ahí — aparece 7 veces en toda la charla, que es lo que lo mantiene siendo un efecto y no un tic.

### Tiempos

| | Duración |
|---|---|
| Entrada de la diapositiva | **950 ms** |
| Salida: recorrido | 520 ms |
| Salida: desvanecido | 300 ms |
| Entrada del contenido | 760 ms |
| Escalonado entre elementos | 95 ms |

Asimétrico a propósito. La que sale **se desvanece en 300 ms aunque siga moviéndose otros 220 ms**: nunca hay dos diapositivas legibles a la vez, pero el movimiento de salida se completa con calma. La atención va siempre a lo que llega.

Con `prefers-reduced-motion` todo se reduce a un fundido de 200 ms, sin desplazamientos, giros, recortes ni barridos.

**Si en la sala resultan demasiado lentas**, se ajustan en un solo sitio — las variables al principio de `css/deck.css`:

```css
--dur-in: 950ms;   /* entrada de la diapositiva */
--dur-out: 520ms;  /* recorrido de salida */
```

### Cambiar una transición

Se edita el atributo en el `<section>` correspondiente de `index.html`:

```html
<section class="slide" data-transition="spin" data-anim-style="pop" data-fx="scan">
```

Los catálogos completos están en `css/deck.css`, en las secciones *CATÁLOGO DE TRANSICIONES* y *ENTRADA DEL CONTENIDO*. Añadir una transición nueva es definir un bloque con sus variables (`--txb`, `--tyb`, `--tsb`, `--trb`, `--clip-a`, `--clip-b`, `--to`); el motor se encarga del resto, incluida la inversión al navegar hacia atrás.
