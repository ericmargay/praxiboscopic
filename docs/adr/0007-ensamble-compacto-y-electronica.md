# ADR-0007 · Rodillos juntos, electrónica dentro y encima de la obra

**Contexto.** Eric revisó la escena el 2-nov-2026: los cilindros quedaban muy separados y en medio de una mesa enorme,
el motor no se veía, y la electrónica no tenía sitio. Pidió que toda la electrónica cupiera dentro y por encima de la
obra, que la caja del LED mostrara la protoboard con los transistores, los jumpers y el «Arduino», y poder seleccionar
cada pieza y ver sus propiedades como en Fusion 360 o Tinkercad.

**Decisión.**

- **Rodillos Ø103,1 mm** (9 fotogramas por vuelta, 160 rpm) en lugar de Ø91,67 mm. Con la película fija en 864 mm,
  rodillos más grandes cierran los huecos: 10 mm entre los del lado corto y 54 mm en el lado de la ventana, justo lo
  que pide la cabeza del LED (44 mm). La proporción sale de `aspectForShortGap`, no de un número a mano.
- **Base cerrada que abraza los rodillos** con 12 mm de margen (288 × 244 × 125 mm). Dentro, en el piso: fuente de
  24 V, DM542, dos LM2596 y el fusible. El motor cuelga bajo el rodillo motriz; el eje del motriz gira en dos 608 (uno
  en la cubierta y otro en un alojamiento impreso, del que cuelga el soporte del motor).
- **Caja de control de acrílico** a 80 mm sobre la cubierta, sobre cuatro separadores M3: protoboard de 830 puntos con
  IR2101, IRLZ44N, dos S8050, capacitores y resistencias, y el ESP32 en su placa de expansión. El ESP32 DevKitC tiene
  sus filas a 25,4 mm y en una protoboard deja un lado sin agujeros libres: por eso va en la placa de expansión.
- **Cabeza del LED** a la altura de la película, detrás de la ventana: LED de 10 W, disipador de 40 mm y condensador
  Ø40 mm. Los cables bajan desde la caja.
- **Sensor de horquilla colgado sobre el borde superior**, un paso antes de la ventana. La película va a 6 mm de la
  cubierta y una horquilla no cabe debajo. La marca de sincronía pasa al borde superior y mide 5 mm, para que el haz
  (a ~2,6 mm de la boca) caiga dentro.
- **La lente cuelga fuera de la base** en una cuna impresa: con Ø64 mm no cabe sobre la cubierta.
- Cada pieza real vive en un catálogo con sus medidas (`src/three/parts.ts`). La escena, la página de la lista de
  compras y las pruebas usan la misma geometría.

**Consecuencias.** `src/mech/assembly.ts` coloca todo y `assemblyProblems` detecta choques. Su prueba encontró que el
eje del tensor tocaba la caja a 70 mm, y por eso la caja sube a 80 mm. Hay medidas aproximadas, marcadas así en el
catálogo, que hay que confirmar con la pieza: fuente, resistencia de aluminio, placa de expansión y base del LED.
Los proyectos guardados con el diseño anterior conservan su animación y adoptan el diseño nuevo
(`adoptPrototypeDesign`). La correa con reducción ya no se dibuja: el modelo de transporte la sigue calculando.
