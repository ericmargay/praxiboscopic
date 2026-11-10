<!-- Generado por scripts/fabricar.mjs (ADR-0012); vuelve a generarlo tras cambiar la mesa: node scripts/fabricar.mjs [--mdf=5.5] -->

# Mesa de dos tambores · paquete para los talleres

10/11/2026 · piso y cubierta de MDF de 5,5 mm, paredes de acrílico transparente de 3 mm · 41 piezas de corte láser y 28 impresas en 3D. Armado a mano, sin tornillos: las paredes quedan atrapadas en ranuras del piso y de la cubierta, la tapa trasera lleva dos cuñas, las tapas se abrochan y lo demás se pega donde se indica. El único tornillo es el prisionero del cople de cada motor.

## Qué hay aquí

- `laser/`: 9 archivos. Cada hoja en DXF R12 y SVG, y un PDF a escala 1:1 por material. Las piezas van acomodadas en hojas de 90 × 60 cm (87 × 57 útiles), con el kerf ya compensado.
- `impresion-3d/`: 16 STL, uno por pieza, ya orientados para imprimir.
- `mesa-tambores-taller.zip`: todo lo anterior y este README, para mandarlo de una vez.

## Texto para el taller de corte láser

```text
Hola, buen día. Quiero cotizar un corte láser CO2 con material incluido, para recoger en CDMX.

1) MDF de 5,5 mm (el que venden como «de 6»): 20 piezas (piso, cubierta en dos capas y piezas interiores) en 1 hoja de 90 × 60 cm, unos 16 m de corte. Archivo mesa-tambores-mdf-5.5mm-hoja-1.
2) Acrílico transparente de 3 mm: 18 piezas en 1 hoja de 90 × 60 cm, unos 11 m de corte: las cuatro paredes de la caja (con dientes, van a la vista), dos tapas de Ø170 y bridas de Ø130, Ø64 y Ø44. Archivo mesa-tambores-acrilico-transparente-3mm-hoja-1.
3) Acrílico negro de 3 mm: 3 piezas chicas (una placa de 60 × 70 mm con ventana y dos tiras de 60 × 3 mm) en un retazo de 20 × 30 cm. Archivo mesa-tambores-acrilico-negro-3mm-hoja-1.

Detalles:
- Archivos a escala real en milímetros: DXF R12 (abre en AutoCAD 2010/2013, CorelDRAW y LightBurn), y los mismos en SVG y PDF. Rojo = corte, azul = marcado vectorial ligero, negro = rótulo grabado (opcional).
- Las piezas encajan a presión por dientes y ranuras, sin tornillos. Los archivos ya traen compensado un kerf de 0,2 mm en MDF y 0,15 mm en acrílico: si el de su máquina es distinto, avísenme y se los mando ajustados.
- Antes de cortar todo, por favor midan con vernier el espesor real del MDF y del acrílico, y corten primero las piezas de prueba E10 y E11 (MDF) y A10 y A11 (acrílico). Si la ranura que entra justa no es la del centro (5,5 mm de MDF y 3 mm de acrílico), les mando los archivos con el espesor que midan; se regeneran en un minuto.
- El acrílico con su película protectora por las dos caras: las paredes van a la vista y no deben rayarse. No hace falta pulir cantos.
- Por favor cotícenme por separado material y minutos de corte, y el tiempo de entrega.

Gracias.
```

## Texto para el servicio de impresión 3D

```text
Hola, buen día. Quiero cotizar la impresión 3D en PETG de 16 piezas distintas (28 en total), para recoger en CDMX.

- I01-nucleo-tambor.stl × 2
- I02-cuerpo-guia.stl × 2
- I03-cuerpo-rodillo-tensor.stl × 1
- I04-brazo-tensor.stl × 1
- I05-copa-pivote.stl × 1
- I06-tapa-iman.stl × 1
- I07-tapon-eje.stl × 3
- I08-poste-tapa.stl × 4
- I09-poste-hueco.stl × 2
- I10-capuchon-sensor.stl × 2
- I11-cabeza-led.stl × 1
- I12-tubo-condensador.stl × 1
- I13-cuna-lente.stl × 1
- I14-brazo-sensor-marcas.stl × 1
- I15-ancla-resorte.stl × 1
- I16-espiga.stl × 4

Detalles:
- STL en milímetros, ya orientados para imprimir (z hacia arriba) y revisados: son sólidos cerrados y no necesitan soportes.
- Material: PETG, no PLA: varias piezas llevan broches que se flexionan y otras van pegadas a ejes de acero. Color gris oscuro o negro; los núcleos y los rodillos pueden ir en blanco o natural.
- Ajustes: boquilla de 0,4 mm, capa de 0,2 mm, 3 perímetros y 20 % de relleno (4 perímetros en los postes con broche).
- Tolerancias que importan: los asientos de rodamiento miden Ø22,05 mm para un 608ZZ a presión y los barrenos de eje Ø7,9 (a presión) u Ø8,2 mm (holgado). Si su máquina saca los barrenos más chicos, díganme cuánto y los ajusto.
- Peso estimado: unos 373 g; unas 16 h de máquina a velocidad normal.
- Por favor cotícenme el total y el tiempo de entrega; si cobran por minuto, el tiempo que les da su laminador.

Gracias.
```

## Piezas de corte láser

Cada pieza lleva su código grabado en la cara que no se ve con la mesa armada. Las de prueba (E10, E11, A10 y A11) se cortan primero.

| Código | Pieza | Cant. | Material | mm | Paso | Qué hace |
|---|---|---|---|---|---|---|
| E01 | Piso | 1 | MDF 5,5 mm | 394 × 268 | 1 | Base de todo: en sus ranuras entran las paredes de acrílico, las torres de los motores, el marco y los topes de la fuente; los cinchos de los drivers y de las tarjetas pasan por sus ranuras chicas. Sobresale 8 mm de las paredes al frente y a los lados |
| E02 | Cubierta (capa de arriba) | 1 | MDF 5,5 mm | 394 × 282 | 5 | Lleva los dos 608 de los tambores, los ejes de las guías y el hueco donde gira el brazo tensor; todo lo de arriba se posiciona con ella · Cola blanca en toda la cara de abajo, con los 608 ya puestos: queda pegada a la contracubierta |
| E03 | Contracubierta (capa de abajo) | 1 | MDF 5,5 mm | 394 × 282 | 5 | Le hace tope a los 608 de la capa de arriba, lleva el 608 de arriba del pivote y recibe las pestañas de las paredes, las torres y el marco de la fuente |
| E04 | Costado de torre | 4 | MDF 5,5 mm | 54 × 120 | 1 | Cuatro iguales: dos por motor. Abajo entran en el piso, arriba en la contracubierta; sostienen el collar del motor y la placa del segundo 608. La muesca de abajo deja salir el conector del motor |
| E05 | Collar del motor | 2 | MDF 5,5 mm | 68 × 54 | 1 | El cuerpo del motor entra en su hueco cuadrado de 42,6 mm: no gira ni se mueve. Forrar el hueco con cinta de espuma si queda juego |
| E06 | Placa del segundo 608 | 2 | MDF 5,5 mm | 68 × 54 | 2 | Lleva el segundo 608 del eje del tambor, 25 mm abajo del de la cubierta: el tambor no cabecea |
| E07 | Marco de la fuente | 1 | MDF 5,5 mm | 116 × 120 | 1 | La fuente se para detrás de él, contra la tapa trasera; por la ventana se ven sus bornes |
| E08 | Tope de la fuente | 2 | MDF 5,5 mm | 30 × 26 | 1 | Dos: no dejan que la fuente se corra de lado |
| E09 | Cuña | 4 | MDF 5,5 mm | 16 × 46 | 12 | Dos (y dos de repuesto): entran por las ventanas de los dientes de la cubierta y aprietan la tapa trasera. Se sacan jalando de la cabeza |
| E10 | Pieza de prueba (ranuras, 608 y eje) | 1 | MDF 5,5 mm | 100 × 82 | prueba | Se corta primero. La llave E11 (MDF) va de canto en la fila de abajo y la A11 (acrílico) en la de en medio: se elige la ranura que entra justa. Con un 608 se prueba el barreno del rodamiento y con el eje el de 8 mm. Si la buena no es la del centro (5,5 y 3 mm, 22,0 y 7,9 mm), se regeneran los archivos con lo medido |
| E11 | Llave de prueba (MDF) | 1 | MDF 5,5 mm | 30 × 12 | prueba | Tira del mismo MDF: se mete de canto en las ranuras de abajo de la E10 |
| A01 | Frente | 1 | Acrílico transparente 3 mm | 378 × 125 | 4 | Pared del lado de la lente. Transparente para que se vea la electrónica. Sus pestañas entran en ranuras cerradas del piso y de la cubierta, que la atrapan: no lleva tornillos ni pegamento. Con las otras paredes encaja con 0,1 mm de holgura (el acrílico a presión se estrella) |
| A02 | Costado izquierdo | 1 | Acrílico transparente 3 mm | 260 × 125 | 4 | Pared del lado del tambor 1. Transparente para que se vea la electrónica. Sus pestañas entran en ranuras cerradas del piso y de la cubierta, que la atrapan: no lleva tornillos ni pegamento. Con las otras paredes encaja con 0,1 mm de holgura (el acrílico a presión se estrella) |
| A03 | Costado derecho | 1 | Acrílico transparente 3 mm | 260 × 125 | 4 | Pared del lado del tambor 2 y del brazo tensor. Transparente para que se vea la electrónica. Sus pestañas entran en ranuras cerradas del piso y de la cubierta, que la atrapan: no lleva tornillos ni pegamento. Con las otras paredes encaja con 0,1 mm de holgura (el acrílico a presión se estrella) |
| A04 | Tapa trasera | 1 | Acrílico transparente 3 mm | 378 × 125 | 12 | Transparente y removible: entra en los dientes del piso, de los costados y de la cubierta, y la sujetan dos cuñas. Se quita para llegar a la electrónica |
| A05 | Tapa del tambor | 2 | Acrílico transparente 3 mm | 170 × 170 | 10 | Dos iguales: la del tambor 2 va volteada. Encajan a presión en los broches de sus tres postes; el capuchón del sensor y su canal se abrochan encima |
| A06 | Brida de abajo del tambor | 2 | Acrílico transparente 3 mm | 130 × 130 | 6 | Entra en el cubo del núcleo impreso y se pega a su orilla con cemento de acrílico o cianoacrilato |
| A07 | Brida de arriba del tambor | 2 | Acrílico transparente 3 mm | 130 × 130 | 6 | La centra el eje de 8 mm; se pega a la orilla del núcleo |
| A08 | Brida de guía | 4 | Acrílico transparente 3 mm | 64 × 64 | 7 | Cuatro: dos por guía. El 608 atraviesa su barreno y la centra |
| A09 | Brida del rodillo tensor | 2 | Acrílico transparente 3 mm | 44 × 44 | 7 | Dos: igual que las de las guías |
| A10 | Pieza de prueba de acrílico | 1 | Acrílico transparente 3 mm | 90 × 40 | prueba | Barrenos de los broches de los postes (6,4 y 11,4) y del 608 (22,1) con ±0,2 mm: se prueba con las piezas impresas antes de cortar las tapas |
| A11 | Llave de prueba (acrílico) | 1 | Acrílico transparente 3 mm | 30 × 12 | prueba | Tira del mismo acrílico: se mete de canto en la fila de en medio de la E10 para elegir la ranura de las paredes |
| N01 | Placa de la ventana | 1 | Acrílico negro 3 mm | 60 × 69 | 8 | Máscara del fotograma de 32 × 20 mm, del lado de la lámpara. Su diente entra 12 mm en la ranura de la cubierta |
| N02 | Guía de la ventana | 2 | Acrílico negro 3 mm | 60 × 3 | 8 | Dos tiras de 60 × 3 × 3 mm pegadas a la placa: tocan el dorso de la película solo por los márgenes y la dejan plana en el plano de foco. La cara de fábrica (lisa) hacia la película y las puntas redondeadas con lija fina; si rayan, se forran con cinta de PTFE (ADR-0013) · Cemento para acrílico (cloroformo) o cianoacrilato |

## Piezas impresas

PETG (1.27 g/cm³), boquilla de 0,4 mm, capa de 0,2 mm, 3 perímetros y 20 % de relleno.

| Código | Archivo | Pieza | Cant. | g c/u | Caja (mm) | Cómo imprimir |
|---|---|---|---|---|---|---|
| I01 | `I01-nucleo-tambor.stl` | Núcleo del tambor | 2 | 63 | 103 × 103 × 46 | Boca abajo (el alma de 3 mm sobre la cama). Sin soportes. 3 perímetros, 20 % de relleno: el anillo de 2 mm sale macizo |
| I02 | `I02-cuerpo-guia.stl` | Cuerpo de guía | 2 | 38 | 60 × 60 × 42 | De pie, con el alma sobre la cama. Sin soportes. El asiento de abajo termina en cono de 45° |
| I03 | `I03-cuerpo-rodillo-tensor.stl` | Cuerpo del rodillo tensor | 1 | 26 | 40 × 40 × 42 | De pie. Sin soportes: la cavidad interior cierra con conos de 45° |
| I04 | `I04-brazo-tensor.stl` | Brazo del tensor | 1 | 4 | 58 × 16 × 6 | Plano, sobre la cama. Sin soportes |
| I05 | `I05-copa-pivote.stl` | Copa del pivote | 1 | 11 | 31 × 31 × 42 | De pie, con la base cuadrada sobre la cama y las espigas hacia arriba. Sin soportes (la ranura del sensor es un puente de 23 mm) |
| I06 | `I06-tapa-iman.stl` | Tapa del imán | 1 | 1 | 14 × 14 × 8 | De pie, con la cara del imán sobre la cama. Sin soportes |
| I07 | `I07-tapon-eje.stl` | Tapón de eje | 3 | 1 | 14 × 14 × 7 | Boca abajo (cara de arriba sobre la cama). Sin soportes |
| I08 | `I08-poste-tapa.stl` | Poste de tapa | 4 | 7 | 12 × 12 × 74 | De pie, espiga abajo. Sin soportes. El broche necesita PETG (el PLA se rompe) |
| I09 | `I09-poste-hueco.stl` | Poste hueco | 2 | 7 | 14 × 14 × 73 | De pie, tubo abajo. Sin soportes |
| I10 | `I10-capuchon-sensor.stl` | Capuchón del sensor con canal | 2 | 8 | 102 × 34 × 12 | Boca abajo (techo sobre la cama): sin soportes ni puentes |
| I11 | `I11-cabeza-led.stl` | Cabeza del LED | 1 | 16 | 52 × 54 × 30 | Con la base sobre la cama. Sin soportes |
| I12 | `I12-tubo-condensador.stl` | Tubo del condensador | 1 | 7 | 44 × 44 × 20 | De pie. Sin soportes (el reborde tiene conos de 45°) |
| I13 | `I13-cuna-lente.stl` | Cuna de la lente | 1 | 38 | 114 × 80 × 80 | De lado (el costado de 80 mm sobre la cama): todo es extrusión salvo las cunas, que cierran a 45° |
| I14 | `I14-brazo-sensor-marcas.stl` | Brazo del sensor de marcas | 1 | 6 | 70 × 34 × 8 | De lado (perfil en L sobre la cama). Sin soportes |
| I15 | `I15-ancla-resorte.stl` | Ancla del resorte | 1 | 0 | 8 × 8 × 10 | Cabeza abajo. Sin soportes |
| I16 | `I16-espiga.stl` | Espiga Ø5,8 × 18 | 4 | 1 | 6 × 6 × 18 | De pie. Varias a la vez |

Revisión de los STL (OMEGA `checkPrint`):

- I01 Núcleo del tambor: estanca, 56.2 cm³, 67.3 g y 103 min cada una en una Bambu A1 · pared mínima de 0.10 mm (1 de 1217 caras muestreadas) por debajo de 0.80 mm = 2 × boquilla
- I02 Cuerpo de guía: estanca, 34.3 cm³, 40 g y 64 min cada una en una Bambu A1
- I03 Cuerpo del rodillo tensor: estanca, 29.3 cm³, 20.8 g y 37 min cada una en una Bambu A1 · voladizos de más de 45°: 0.6 cm² (0.6 % de la superficie): soportes u otra orientación
- I04 Brazo del tensor: estanca, 3.7 cm³, 3.9 g y 7 min cada una en una Bambu A1
- I05 Copa del pivote: estanca, 10.9 cm³, 12.9 g y 25 min cada una en una Bambu A1 · voladizos de más de 45°: 3 cm² (3.6 % de la superficie): soportes u otra orientación
- I06 Tapa del imán: estanca, 0.9 cm³, 1.1 g y 3 min cada una en una Bambu A1 · voladizos de más de 45°: 0.3 cm² (3.8 % de la superficie): soportes u otra orientación
- I07 Tapón de eje: estanca, 0.7 cm³, 0.9 g y 2 min cada una en una Bambu A1
- I08 Poste de tapa: estanca, 7.1 cm³, 5.3 g y 20 min cada una en una Bambu A1 · voladizos de más de 45°: 0.1 cm² (0.4 % de la superficie): soportes u otra orientación
- I09 Poste hueco: estanca, 5.9 cm³, 7.5 g y 23 min cada una en una Bambu A1 · voladizos de más de 45°: 0.2 cm² (0.4 % de la superficie): soportes u otra orientación
- I10 Capuchón del sensor con canal: estanca, 8.1 cm³, 10.3 g y 17 min cada una en una Bambu A1 · voladizos de más de 45°: 0.1 cm² (0.1 % de la superficie): soportes u otra orientación
- I11 Cabeza del LED: estanca, 22.4 cm³, 21.3 g y 35 min cada una en una Bambu A1 · voladizos de más de 45°: 0 cm² (0 % de la superficie): soportes u otra orientación
- I12 Tubo del condensador: estanca, 5.3 cm³, 6.8 g y 13 min cada una en una Bambu A1
- I13 Cuna de la lente: estanca, 56.9 cm³, 52.8 g y 88 min cada una en una Bambu A1 · voladizos de más de 45°: 8.7 cm² (2.8 % de la superficie): soportes u otra orientación
- I14 Brazo del sensor de marcas: estanca, 5.2 cm³, 5.1 g y 9 min cada una en una Bambu A1 · voladizos de más de 45°: 0.6 cm² (2.1 % de la superficie): soportes u otra orientación
- I15 Ancla del resorte: estanca, 0.3 cm³, 0.3 g y 2 min cada una en una Bambu A1 · voladizos de más de 45°: 0.3 cm² (9.1 % de la superficie): soportes u otra orientación
- I16 Espiga Ø5,8 × 18: estanca, 0.5 cm³, 0.6 g y 4 min cada una en una Bambu A1

## Cómo se arma

Los mismos pasos que muestra *Mechanical Simulation → Ensamble sin tornillos* (`?demo=tambores&ensamble=1`).

**1. Piso, torres y marco de la fuente**
   - Cortar primero las piezas de prueba (E10, E11, A10 y A11) y ajustar si hace falta.
   - Armar cada torre: dos costados E04 con su collar E05 en las ranuras de abajo.
   - Encajar las dos torres, el marco E07 y los dos topes E08 en las ranuras del piso E01.
   - Entran: E01, E04, E05, E07, E08

**2. Motores, coples y segundo 608**
   - Bajar cada motor por el collar hasta el piso, con el conector hacia la muesca del costado.
   - Poner el cople en el eje del motor (13 mm de eje dentro del cople) y apretar su prisionero.
   - Meter un 608 a presión en cada placa E06 y encajarla en las ranuras de arriba de la torre: los costados se abren un poco.
   - Entran: motor-17hs8401, coupling-5-8, E06, bearing-608

**3. Electrónica en el piso**
   - La fuente de pie detrás del marco E07, entre los topes.
   - Cada DM542 delante de su motor con dos cinchos; la placa de expansión con el ESP32, los reguladores y la resistencia con un cincho cada uno.
   - La protoboard con su adhesivo. Cablear potencia y señales (ver la vista Electrónica): con las paredes de acrílico todo queda a la vista, así que conviene peinar los cables.
   - Entran: psu-24v-5a, driver-dm542, esp32-expansion, esp32, buck-lm2596, led-resistor, breadboard-kit, cable-ties

**4. Paredes de acrílico**
   - Quitar la película protectora de la cara de adentro de cada pared; la de afuera, al final.
   - Encajar el frente A01 y los costados A02 y A03 en las ranuras del piso: las esquinas entran holgadas, no se fuerzan ni se pegan.
   - Entran: A01, A02, A03

**5. Cubierta doble**
   - Pegar la copa impresa del pivote (I05) bajo la contracubierta E03 con sus tres espigas y epóxico.
   - Bajar la E03 sobre las pestañas de las paredes, las torres y el marco de la fuente: cada una entra en su ranura y las paredes quedan atrapadas.
   - Meter a presión los dos 608 de los tambores en la cubierta E02, poner cola blanca en su cara de abajo y bajarla sobre la E03 con los ejes de las guías como guía; prensar con peso una hora. Las pestañas de acrílico quedan al ras.
   - Meter el 608 de arriba del pivote desde el hueco: apoya en la copa.
   - Entran: E02, E03, I05, bearing-608, glue-wood

**6. Tambores**
   - Pegar con epóxico cada núcleo impreso (I01) a su eje de 100 mm, con 2 mm de eje arriba.
   - Pegar la brida de abajo A06 (barreno de 11,7) y la de arriba A07 (8,2) a las orillas del núcleo.
   - Bajar cada tambor por su 608 de la cubierta y el de la torre hasta el cople y apretar el prisionero: el cubo apoya en la pista interior del 608.
   - Entran: I01, A06, A07, shaft-8mm, epoxy

**7. Guías y brazo tensor**
   - Pegar con epóxico los ejes de 70 mm de las guías en la cubierta, a plomo.
   - Rondana M8, guía (I02 con dos 608 y sus bridas A08) y tapón I07.
   - Brazo I04 pegado al eje del pivote, eje del rodillo en su casquillo, rodillo I03 con sus 608 y bridas A09, tapón I07.
   - Resorte del brazo a la mitad del brazo y al ancla I15; tapa del imán (I06) en la punta de abajo del eje y el AS5600 en la ranura de la copa.
   - Entran: I02, I03, I04, I06, I07, I15, A08, A09, washers-m8, dancer-spring, as5600

**8. Ventana, LED, sensor de marcas y lente**
   - Pegar las dos guías N02 a la placa N01 y encajarla en su ranura.
   - Cabeza del LED (I11) con el disipador, el LED y el tubo del condensador (I12); brazo del sensor de marcas (I14) con el F249.
   - Cuna de la lente (I13) en sus dos ranuras del frente: se corre ±3 mm para enfocar.
   - Entran: N01, N02, I11, I12, I13, I14, led-10w, led-heatsink, condenser, sensor-f249, lens-50mm

**9. Postes**
   - Pegar con epóxico las espigas de los cuatro postes (I08) y los dos postes huecos (I09) en la cubierta.
   - Pasar el bus I2C de cada sensor por su poste hueco.
   - Entran: I08, I09, jumpers-hh

**10. Tapas y sensores de mano**
   - Abrochar cada tapa A05 en sus tres postes (la del tambor 2, volteada).
   - Poner cada VL53L4CD con su tira de pines en ángulo y cubrirlo con su capuchón con canal (I10): el canal tapa los cables hasta el poste hueco.
   - Entran: A05, I10, hand-sensor, pin-headers

**11. Película**
   - Meter la punta de la cola del tambor 1 en la ranura de su núcleo y enrollarla; pasar la película por la guía 1, la ventana, la guía 2 y el rodillo tensor hasta el tambor 2.
   - Con el programa en banco, tensar a 1,5 N y probar las dos manos.
   - Entran: film

**12. Tapa trasera y cuñas**
   - Empujar la tapa trasera A04 sobre los dientes del piso, de los costados y de la cubierta.
   - Bajar las dos cuñas E09 por las ventanas de los dientes de la cubierta hasta que aprieten. Quitar la película protectora de afuera de las paredes.
   - Entran: A04, E09

## Si el MDF o el acrílico no miden lo que dicen

Mide el espesor con vernier en tres puntos de cada hoja y regenera todo con esos valores: `node scripts/fabricar.mjs --mdf=5.7 --acrilico=2.8`. Dientes, ranuras, alturas y la lista de compras se recalculan.
