# Arquitectura de Praxiboscopic

Simulador de cine mecánico (película transparente en loop sobre rodillos, estroboscopio de tambor o LED, linterna
con lente y pantalla) con un **Animation Studio** integrado que produce los fotogramas, los coloca sobre la película
física y los proyecta a través del modelo mecánico y óptico. Obra construida sobre `@aminoacid/omega` (OMEGA, ver
`docs/LIBRARY.md` de OMEGA): se reutilizan el catálogo de motores (`@aminoacid/omega/mech`), la fotometría
(`@aminoacid/omega/render`) y las convenciones de fabricación (capas láser de `fabricate`).

## Flujo

```
Animation Studio ──► evaluate(doc, t) ──► FrameGenerator (caché por fotograma) ──► FrameSet
                                                                                     │
      FilmSpec ──► buildFilmLayout ──► FilmLayout (posiciones, marcas, longitud) ◄───┘
                        │                      │
      PathSpec ──► buildPath / designRectangle │  checkCoherence (película ↔ recorrido)
                        │                      │
  TransportSpec + StrobeSpec ──► syncState ──► TimeEngine.advance(dt) ──► ExposureEvent[]
                                                                               │
  OpticsSpec + MediumProfile ──► ProjectionCompositor.expose ──► pantalla (Panel C)
```

Un solo objeto `Project` (`src/core/project.ts`) vive en una tienda reactiva (`src/core/store.ts`). Toda la interfaz
lee de ahí y escribe ahí; `deriveProject` recalcula lo deducible (película, recorrido, sincronía, avisos) y
`AppContext` (`src/app/context.ts`) memoiza fotogramas ideales e impresos. Cambiar la animación invalida los
fotogramas cuyo hash cambió (y solo esos), lo que a su vez actualiza la película (misma `FilmLayout`, nuevas
imágenes), la malla 3D y la proyección.

## Paquetes

| Carpeta | Qué | Depende de |
|---|---|---|
| `src/core` | tienda, hash, matemáticas, `Project` y derivaciones | zod |
| `src/animation` | documento (`model.ts`), easing, evaluación a lista de dibujo (`evaluate.ts`), render Canvas 2D, SVG, generadores procedurales, motor texto→animación con adaptador de IA, análisis del loop | — (puro; render necesita un contexto 2D) |
| `src/frames` | ajustes (FPS, resolución, mm, color, orientación, dirección, numeración), generador con caché | animation |
| `src/film` | layout físico (paso, márgenes, perforaciones, marcas, longitud, coherencia), vista 2D y SVG de la tira, impresión (PPI, páginas, rutas, compatibilidad) | optics/medium |
| `src/mech` | recorrido de rodillos, transporte (motores de OMEGA), estroboscopios, sincronía, motor temporal | @aminoacid/omega/mech |
| `src/optics` | lente delgada y brillo (fotometría de OMEGA), perfiles de medio transmisivo, patrones de calibración, compositor de exposición | @aminoacid/omega/render |
| `src/export` | ZIP (store), PDF con dimensiones reales | — |
| `src/host` | canvas del navegador, carga de imágenes, render 3D de elementos glTF | three |
| `src/three` | escena mecánica en three.js | three, mech, film |
| `src/ui` | shell, controles, Animation Studio, Mechanical Simulation, Projection Laboratory | todo lo anterior |

Regla (como en OMEGA): identificadores en inglés, textos de interfaz y comentarios en español. Los módulos de
`core`, `animation` (salvo render2d en canvas), `frames/settings`, `film/layout`, `mech`, `optics/projector`,
`optics/medium` y `export` corren en Node y se prueban con vitest; lo que pinta se prueba con `@napi-rs/canvas`.

## Las tres frecuencias

- **FPS del material** (`animation.fps`): muestras por segundo de la animación. Con `fpsMode = keep-duration`, N =
  round(fps · duración); con `keep-count`, N fijo y la duración = N / fps.
- **Frecuencia de transporte**: fotogramas por segundo que pasan por la ventana = velocidad de cinta / paso.
- **Frecuencia de proyección**: destellos por segundo (ranuras × rpm / 60 en el tambor; Hz del LED).

`syncState` las calcula, mide el batido entre transporte y proyección (deriva en fotogramas) y el desenfoque por
movimiento (velocidad × duración del destello).

## Seamless loop

Muestreo semiabierto: t_i = i·T/N, i = 0…N−1. Las pistas de keyframes envuelven (último → primero) y las expresiones
periódicas tienen ciclos enteros por loop. `analyzeLoop` compara el salto de cierre con la mediana de los saltos
internos (geométrico, puro) y `analyzeLoopPixels` lo hace sobre los píxeles pintados.

## Modelo de exposición

Para cada destello de duración τ con la cinta a velocidad v: K submuestras de la ventana en φ + v·τ·u, pesadas por el
perfil del destello (rectangular en LED, trapezoidal en tambor), acumuladas de forma aditiva; luego el medio
(transmitancia, Dmax, punto, velo), la lente (inversión, espejo, desenfoque por desenfoque de foco) y la persistencia
retiniana (decaimiento exponencial). Si el motor se para, φ no avanza; si hay batido, el fotograma centrado en cada
destello cambia y la imagen se desplaza, se mezcla o se parte.
