# ADR-0012 · La mesa de dos tambores se corta con láser y se arma sin tornillos, con paredes de acrílico

**Contexto.** El 5-nov-2026 Eric pidió tres cosas:

- **Armado de la estructura:** el simulador no mostraba cómo armarla. Propuso un ensamble a mano sin tornillos, con ranuras de unión entre piezas cortadas con láser.
- **Textos y archivos para los talleres:** qué pedirle a quien corte y a quien imprima, más los archivos de impresión.
- **Precios aproximados:** para lo que no tenía precio, y así saber qué tan lejos quedan las cotizaciones reales.

Ese mismo día Eric pidió que la caja no fuera toda de MDF: piso y cubierta de MDF y paredes transparentes, para que se vean los circuitos, encajadas sin tornillos.

**Decisión.** Toda la estructura sale de `buildReelsStructure` (`src/mech/structure.ts`), que lee las posiciones de `buildReelsAssembly`.

- **Piso y cubierta de MDF, paredes de acrílico.**
  - Las cuatro paredes (frente A01, costados A02 y A03 y tapa trasera A04) son de acrílico transparente de 3 mm.
  - Piso y cubierta sobresalen 8 mm de las paredes al frente y a los lados. Así sus ranuras quedan cerradas: las pestañas de las paredes entran en ellas y las paredes no pueden salirse, sin tornillos ni pegamento. En la cubierta las pestañas quedan al ras, como rayas transparentes.
  - Entre dos piezas de acrílico, los dientes llevan 0,1 mm de holgura, porque el acrílico a presión se estrella. En el MDF entran justos.
  - La mesa queda en 394 × 268 × 125 mm.

- **MDF de 5,5 mm.** En México el MDF «de 6» mide 5,5 mm (Trupan, Arauco), y el acrílico «de 3» varía unas décimas.
  - Ranuras, dientes y alturas se dibujan con los espesores reales.
  - Si se miden otros valores: `node scripts/fabricar.mjs --mdf=5.7 --acrilico=2.8`. Las piezas de prueba (E10 y E11 en MDF, A10 y A11 en acrílico) se cortan primero.
- **Caja con dientes en sus doce aristas** (ranuras cerradas en el piso y la cubierta).
  - Cada arista se divide en tramos de unos 25 mm, siempre en número impar.
  - Los tramos pares, incluidos los de las puntas, son de la cara de más prioridad: cubierta > piso > frente > tapa trasera > costados. Así ninguna esquina queda suelta.
  - Las esquinas donde se juntan tres caras son de la de más prioridad.
  - Una prueba recorre las aristas: cada punto es de una sola cara.
- **Cubierta doble.** Dos capas de MDF pegadas con cola blanca.
  - Arriba: los 608 de los tambores, que sobresalen 1,5 mm (el cubo del tambor apoya en su pista interior), los ejes de las guías y el hueco del brazo tensor.
  - Abajo: el tope de esos 608, el 608 de arriba del pivote y los dientes de las torres y del marco de la fuente, que entran sin verse.
- **Tapa trasera removible**, de acrílico. Encaja en sus dientes. Dos dientes de la cubierta la atraviesan y salen 14 mm con una ventana; ahí bajan las cuñas E09, que la aprietan.
- **Torre de cada motor.**
  - Dos costados E04, el collar E05 (hueco de 42,6 mm) y la placa E06 con el segundo 608 del tambor, 25 mm abajo del de la cubierta.
  - El motor se para en el piso dentro del collar: ya no hay soporte de acero.
  - El cople toma 13 mm del eje del motor y 10 del eje del tambor.
- **Electrónica sin tornillos.**
  - La fuente va de pie detrás del marco E07, entre los topes E08 y contra la tapa trasera.
  - Drivers, placa de expansión, reguladores y resistencia van con cinchos que pasan por ranuras del piso. La protoboard va con su adhesivo.
- **Brazo tensor dentro de un hueco de la capa de arriba.**
  - El brazo impreso gira sobre el 608 del pivote y asoma 1,5 mm sobre la cubierta, bajo la brida del rodillo.
  - El resorte va de la mitad del brazo al ancla I15 y se ajusta desde arriba.
  - Abajo, la copa impresa I05, pegada con tres espigas, sostiene ese 608. También lleva el segundo 608 y la ranura del AS5600, a 1,5 mm del imán.
  - **Mesa más ancha:** el 608 del pivote necesita 3 mm de MDF antes de la ranura de la pared.
- **Tapas, ventana y rodillos.**
  - Tapas de acrílico transparente de Ø170 sobre tres postes impresos con broche: dos atrás y uno al frente. Del lado de afuera de cada tambor no hay poste, porque por ahí sale la película. El poste hueco lleva el bus I2C.
  - El sensor queda bajo un capuchón impreso con un canal hasta el poste hueco.
  - La ventana es de acrílico negro de 3 mm con dos guías pegadas que tocan el dorso solo por los márgenes. Con el LED en destellos no hay calor que pida aluminio.
  - Tambores, guías y rodillo tensor son cuerpos de PETG entre bridas de acrílico, para ver la película enrollada.
- **Tornillos.** Los únicos son los prisioneros de los coples. El resto encaja, se abrocha o se pega (cola blanca, epóxico, cianoacrilato).
- **16 piezas impresas**, 28 en total (`src/fabricate/printed.ts`).
  - Se modelan con manifold-3d 3.2.1, la versión sin dependencias, solo en Node.
  - Salen orientadas para imprimir sin soportes y revisadas con `checkPrint` de OMEGA.
  - En el navegador el módulo solo da nombres, medidas y el volumen estimado.
- **Paquete para los talleres** (`npm run fabricar` → `public/fabricacion/tambores/`):
  - DXF R12, SVG y PDF 1:1 por hoja de 90 × 60 cm (87 × 57 útiles). Usa el acomodo y el kerf de OMEGA y graba el código de cada pieza.
  - Los STL, un README con los textos para cotizar y un ZIP. El ZIP no va en git; `npm run publicar` lo arma si falta.
  - El README se copia a `docs/FABRICACION-TAMBORES.md`.
- **Cantidades públicas, costos privados.** `src/fabricate/quantities.ts` da lo que también dicen los textos para los talleres: metros de corte, hojas, piezas, gramos y horas de impresión. El 9-nov-2026 Eric pidió que los proveedores no vean lo que estimamos que cobran: el modelo de costos (tarifas de CDMX del 5-nov-2026) vive en `private/costos/`, que no va a git ni al sitio, y los estimados están en una página privada para comparar las cotizaciones.
- **Simulador.**
  - La escena extruye los mismos contornos que van al taller.
  - *Ensamble sin tornillos* tiene 12 pasos (`assemblySteps`): las piezas de cada paso llegan desde afuera y hay un control de explosión.
  - `?ensamble=5&explosion=0.4` abre directo en ese paso.
- **Compras.** La pestaña *Taller: láser e impresión 3D* trae los archivos y los dos textos para copiar. Los trabajos de taller y la película van «por cotizar», sin precio.

**Consecuencias.**

- **Lista de compras.** En `docs/COMPRAS-TAMBORES.md` los cuatro trabajos de taller, la base de la película y el laminado van por cotizar; lo demás tiene precio de catálogo.
  - **Salen:**
    - Los soportes de acero de los motores y el kit de tornillos M2–M5.
    - Los renglones sueltos de tambores, guías, brazo, tapas, caja, placa de aluminio y soportes impresos.
    - Los seis ejes sueltos.
  - **Entran:**
    - Cuatro trabajos de taller.
    - Cinchos, rondanas M8, cola blanca, epóxico y cianoacrilato.
    - Un eje de 8 × 500 mm que se corta en seis tramos.
  - **Precios:** el fusible (Steren) y la tira de pines en ángulo (UNIT) ya tienen precio.
- **Trabajo de taller:**
  - MDF: 16 m de corte en una hoja.
  - Acrílico transparente: 11 m de corte en una hoja, con las paredes, las tapas y las bridas.
  - Acrílico negro: dos piezas chicas.
  - Impresión: unos 373 g y 16 h; los núcleos de los tambores son un tercio.
- **Por medir en banco:**
  - El espesor real del MDF y del acrílico.
  - El ajuste de los 608 en MDF (Ø22,0) y en PETG (Ø22,05).
  - Que las pestañas de acrílico entren justas en el MDF sin estrellarse.
  - Que el collar sujete el motor sin juego; si no, cinta de espuma.
  - Que el epóxico aguante el par del tambor: hacen falta 9,7 N·cm.
  - Que los dientes de la tapa trasera no se aflojen tras varias aperturas.
- **Sin modelar:**
  - La holgura real de los broches.
  - La deformación de la impresión.
  - El juego de las cuñas.
- **El loop no cambia:** sigue con su caja base y su soporte de motor.
