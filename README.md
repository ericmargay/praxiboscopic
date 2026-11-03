# Praxiboscopic · estudio de animación y simulador de cine mecánico

Diseña una animación, produce sus fotogramas, conviértelos en una **película transparente** en loop y estudia por
completo su **proyección mecánica** (película sobre rodillos, estroboscopio de tambor o LED, linterna con lente,
pantalla) antes de fabricar. Obra del estudio construida sobre [`@aminoacid/omega`](../omega) (Three.js + TypeScript
+ Vite), con textos de interfaz en español e identificadores en inglés, como OMEGA.

```
Crear animación → Diseñar movimiento → Generar fotogramas → Distribuir en película → Simular transporte físico
→ Sincronizar estroboscopio → Proyectar → Exportar película para impresión (y lista de compras de la instalación)
```

## Arranque

```bash
npm install           # enlaza ../omega con file:
npm run dev           # http://localhost:5174
npm test              # 72 pruebas (vitest + @napi-rs/canvas)
npm run build         # tsc + vite build → dist/
npm run captura       # capturas/*.png + report.json con Chrome headless (verificación visual)
node scripts/bom.mjs  # docs/COMPRAS.md y fabricacion/BOM.csv de la demostración
npm run publicar      # compila y sube dist/ a la rama gh-pages (GitHub Pages)
```

**En línea:** https://ericmargay.github.io/praxiboscopic/ y la lista de compras en
https://ericmargay.github.io/praxiboscopic/compras.html. Se compila en local porque OMEGA es privado (`file:../omega`).

Parámetros de URL: `?demo=1` ignora el proyecto guardado en `localStorage` y arranca con la demostración;
`?section=mechanical|laboratory|studio&tab=editor|frames|film|export`; `?play=0` arranca en pausa; `?sel=motor` o
`?bom=driver-dm542` seleccionan una pieza en la escena 3D.

**Lista de compras:** http://localhost:5174/compras.html (botón «Lista de compras ↗» arriba). Sale del mismo proyecto
que el simulador, con cada pieza en 3D, precios en UNIT, Amazon y MercadoLibre y qué revisar antes de pagar.

## Las tres secciones

| Sección | Qué hace |
|---|---|
| **Animation Studio** | Editor 2D (formas, Bézier, texto, imágenes PNG/SVG, modelos glTF), capas, keyframes con easing, expresiones periódicas, onion skin, edición por fotograma, biblioteca de cinco animaciones paramétricas, texto → animación (motor procedural, adaptador de IA). Pestañas **Fotogramas** (ajustes y hoja de contactos), **Película** (tira física y coherencia con el recorrido) y **Exportar** (impresión, medios, PDF, SVG, PNG, calibración, lista de compras). |
| **Mechanical Simulation** | Visor 3D a escala real, como un CAD: la obra con la electrónica dentro y encima, la película con los fotogramas reales, la ventana, el LED, el sensor, la lente y la pantalla. Selección de piezas con propiedades y precio, árbol de piezas, ocultar, aislar, medir y vistas estándar. Control de transporte, recorrido, estroboscopio, óptica y sincronía con errores deliberados. |
| **Projection Laboratory** | Tres paneles sincronizados: A animación digital perfecta, B película en movimiento por la ventana, C proyección simulada (solo transporte + destellos + óptica). Comparación entre película ideal e impresa. |

El estado es un único `Project` en una tienda reactiva: se pasa de una sección a otra sin perder nada y la
simulación sigue corriendo (la película no se detiene al cambiar de pestaña). Se guarda en `localStorage` y se
exporta/importa como JSON.

## La demostración integral

`demoProject()` (`src/core/project.ts`) es también la propuesta del primer prototipo:

1. Pelota rebotando en loop: 24 fotogramas a 24 FPS, imagen de 32 × 20 mm.
2. Tira de 40 × 864 mm sin perforar, paso de 36 mm, con una marca de sincronía por fotograma.
3. Cuatro rodillos Ø103,1 mm juntos (10 mm entre los del lado corto, 54 mm en la ventana): uno motriz tras la ventana,
   uno tensor con resorte y dos libres.
4. Un NEMA 17 17HS8401 a 160 rpm con acoplamiento directo, sin bandas, y driver DM542 a 24 V, dentro de la base.
5. LED de 10 W pulsado 120 µs, disparado por el sensor sobre la marca de cada fotograma. Caja de control encima, con
   protoboard y ESP32 (ADR-0007).
6. Lente de 50 mm f/1.8 a 1 m, imagen de unos 60 cm.
7. Exportaciones: PNG, spritesheet, SVG, tira PNG/SVG, PDF por segmentos y lista de compras.

La compra de electrónica por tienda está en [docs/COMPRAS-ELECTRONICA.md](docs/COMPRAS-ELECTRONICA.md).

Ver [docs/DEMO.md](docs/DEMO.md) para el recorrido paso a paso y [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) para
el diseño. El estado del proyecto está en [docs/STATUS.md](docs/STATUS.md) y las decisiones en `docs/adr/`.

## Verificación

- `npm test`: 61 pruebas sobre cantidad de fotogramas, dimensiones y resolución, continuidad del loop (geométrica y
  de píxeles), orden, longitud de la tira y posición de cada fotograma, coincidencia fotograma ↔ destello con
  resolución de microsegundos, regeneración incremental al editar, integridad de ZIP/PNG/PDF/SVG y correspondencia
  entre la película simulada y las imágenes exportadas.
- `npm run captura`: construye, sirve y fotografía las secciones (editor, fotogramas, película, exportar, 3D
  general / ventana / pantalla, laboratorio con LED y con tambor); falla si hay errores de consola.
