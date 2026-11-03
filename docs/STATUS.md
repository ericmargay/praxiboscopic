# Estado de Praxiboscopic

Actualizado: 2/11/2026. Puente entre sesiones: la siguiente arranca leyendo este archivo.

## Qué funciona (verificado)

| Área | Estado | Evidencia |
|---|---|---|
| Documento de animación, evaluación, render 2D, SVG | Implementado: capas, 9 tipos de elemento (círculo, rect, polígono, línea, Bézier, imagen, texto, grupo, modelo 3D), pistas numéricas (keyframes con 16 easings + Bézier CSS; expresiones periódicas), pistas de puntos (morph), deformaciones (squash, bend, taper, onda), ediciones y reemplazos por fotograma | `src/animation/*`, `animation.test.ts` |
| Cinco generadores paramétricos + texto → animación + adaptador de IA | Implementado; los cinco cierran el loop (prueba geométrica y de píxeles) | `src/animation/procedural/*` |
| Seamless loop: análisis y correcciones | Implementado: muestreo semiabierto, comparación de cierre con asignación húngara por conjuntos (elementos reciclados), corrección de pistas | `src/animation/loop.ts` |
| Generador de fotogramas con caché incremental | Implementado: hash por fotograma; 1 repintado al editar un fotograma, N al cambiar la animación | `src/frames/*`, `frames.test.ts` |
| Película física | Implementado: paso, márgenes, repeticiones, perforaciones, registro, sincronía, empalme, longitud, superficie transparente, coherencia con el recorrido y propuestas | `src/film/layout.ts`, `film.test.ts` |
| Vista desplegada + SVG + impresión | Implementado: canvas a px/mm, SVG en mm con fotogramas vectoriales, plan de páginas que corta entre fotogramas, compatibilidad medio ↔ ruta | `src/film/strip2d.ts`, `src/film/print.ts` |
| Mecánica | Implementado: recorrido de rodillos (correa sobre polígono convexo), diseño automático del rectángulo, transporte con motores de OMEGA (rpm, par, avisos), tambor y LED, sincronía, motor temporal analítico (µs) | `src/mech/*`, `mech.test.ts` |
| Óptica | Implementado: lente delgada, aumento, desenfoque por foco, brillo (lux, cd/m², contraste con ambiente) con la fotometría de OMEGA; medios transmisivos (ideal, inkjet, láser, laboratorio, fotolito); cartas de calibración; compositor de exposición (submuestras, perfil del destello, medio, inversión, desenfoque, persistencia normalizada) | `src/optics/*`, `optics.test.ts` |
| Exportaciones | Implementado: ZIP store, PDF con mm reales e imágenes JPEG/RGB, secuencia PNG + manifest, spritesheet, SVG, tira PNG/SVG, PDF por segmentos, BOM Markdown/CSV | `src/export/*`, `src/fabricate/bom.ts` |
| Interfaz | Implementado: shell con tres secciones y cuatro pestañas de estudio, editor completo, hoja de contactos, película, exportar, simulación 3D, laboratorio de tres paneles; estado único y persistente | `src/ui/*`, `capturas/*.png` |
| Escena three.js como visor de CAD | Implementado a escala 1:1 en mm: base con fuente, DM542, LM2596 y fusible dentro; motor NEMA 17 bajo el motriz con soporte, cople y dos 608; rodillos impresos que giran con φ/R; cinta con los fotogramas reales; ventana; cabeza del LED; sensor F249 sobre el borde; lente en su cuna; caja de control con protoboard, ESP32 en su placa de expansión, IR2101, IRLZ44N, S8050, capacitores, resistencias y jumpers; cables. Selección con clic o en el árbol, propiedades (medidas de catálogo y del modelo, especificaciones, conexiones, compra), ocultar, aislar, encuadrar, medir, rótulos, vista ortográfica, base transparente y vistas estándar. Tema claro sin focos ni niebla; ~370–610 draw calls | `src/three/mechScene.ts`, `src/three/parts.ts`, `capturas/mechanical-*.png` |
| Ensamble físico | Implementado: posiciones de todas las piezas y detección de choques; pruebas de que todo cabe, de que el motor cuelga del motriz y de que el haz del sensor cae en la marca | `src/mech/assembly.ts`, `assembly.test.ts` |
| Lista de compras en su página | Implementado (`compras.html`): totales por proveedor, renglones por tipo con miniatura 3D, detalle con la pieza en 3D a escala, precios en UNIT, Amazon y MercadoLibre, qué revisar antes de pagar, renglones fuera de la compra y comprados guardados en el navegador, CSV e impresión. Enlaza al simulador (`?bom=`) y el simulador a ella | `src/compras/*`, `capturas/compras.png` |
| Espacio interior del loop | Implementado: `interiorClearance` mide fondo y ancho reales dentro del loop y `deriveProject` marca error si la linterna o el tambor no caben | `src/mech/path.ts`, `project.test.ts` |
| Pruebas y capturas | 72 pruebas en verde; `npm run captura` produce las vistas sin errores de consola | `npm test`, `capturas/report.json` |

## Decisiones tomadas (ADR en docs/adr)

**Primer prototipo (2-nov-2026, decidido con Eric):** LED, un motor, sin bandas, sin perforaciones. Ver `docs/COMPRAS-ELECTRONICA.md`. El tambor de referencia no es de ranuras; parece el de espejos y aún no está modelado.

**Ensamble (2-nov-2026, ADR-0007):** rodillos Ø103,1 mm juntos a 160 rpm, base cerrada con la potencia dentro, caja de control encima con protoboard y ESP32, sensor colgado sobre el borde superior. Tema claro en toda la app.

0001 obra sobre OMEGA · 0002 convención física de la banda (imagen derecha, s = φ − σ) · 0003 muestreo semiabierto y
loop · 0004 caché incremental por hash · 0005 modelo de exposición · 0006 LED por defecto, tambor como alternativa ·
0007 ensamble compacto y electrónica dentro y encima de la obra.

## Qué está a medias

- **Editor**: la selección múltiple y la transformación de grupos completos no existen (un elemento a la vez); los
  trazados Bézier se crean pero no se editan vértice a vértice después; no hay deshacer/rehacer (el proyecto se guarda
  en `localStorage` y se puede exportar).
- **Vista 3D del estudio**: los elementos `model3d` se renderizan en los fotogramas, pero no hay un viewport 3D
  navegable dentro del estudio (sí lo hay en Mechanical Simulation).
- **Perfiles de color**: se declaran (nombre ICC) pero el navegador no gestiona color al exportar; los PDF salen en
  sRGB sin perfil embebido.
- **Tambor**: la fotometría usa la ranura como fracción de la periferia (sin difracción ni penumbra). El motor del
  tambor es independiente (NEMA 17 pancake) y gira al ritmo del tambor; no se modela aún una transmisión común con el
  motor de transporte (engranes o correa con relación fija), que eliminaría la deriva por diseño.
- **Correa GT2**: con reducción ≠ 1 el transporte la calcula, pero la escena ya no la dibuja (solo acoplamiento directo).
- **Visor de CAD**: no se pueden mover piezas con el ratón (no hay gizmo de transformación ni restricciones), no hay vista
  explosionada ni cortes. Los cables siguen rutas aproximadas y el brazo tensor es esquemático.
- **Medidas aproximadas** (marcadas en el catálogo): fuente de 24 V, resistencia de aluminio, placa de expansión, base del LED,
  sensor F249. Confirmarlas con la pieza en mano.
- **BOM**: los precios 🟢 de UNIT vienen de capturas o del buscador; los de placa de expansión, kit de protoboard, jumpers,
  disipador, separadores y cable son 🟡 estimados (la tienda bloquea el acceso automático).

## Qué falta

- Importar escenas 3D completas (solo modelos glTF individuales por elemento).
- Un servicio de IA real detrás de `RemoteAiEngine` (la interfaz, la configuración y la validación del documento
  devuelto ya existen).
- Tambor de espejos del Théâtre Optique, la referencia real del dispositivo.
- Medir en banco: flujo del LED pulsado, fricción de los 608, disparo del sensor con la tinta real y parpadeo a 24 Hz.
- Captura de vídeo (WebM) de la proyección.
- Planos de las piezas de taller (SVG/DXF de la base, la ventana y el tambor con `@aminoacid/omega/fabricate`): la
  BOM ya marca qué piezas van a láser e impresión 3D.
