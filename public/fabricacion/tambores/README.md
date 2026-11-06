<!-- Generado por scripts/fabricar.mjs (ADR-0012); vuelve a generarlo tras cambiar la mesa: node scripts/fabricar.mjs [--mdf=5.5] -->

# Mesa de dos tambores · paquete para los talleres

5/11/2026 · MDF de 5,5 mm · 40 piezas de corte láser y 28 impresas en 3D. Armado a mano, sin tornillos: dientes y ranuras, dos cuñas en la tapa trasera, broches en las tapas y pegamento donde se indica. El único tornillo es el prisionero del cople de cada motor.

## Qué hay aquí

- `laser/`: 11 archivos. Cada hoja en DXF R12 y SVG, y un PDF a escala 1:1 por material. Las piezas van acomodadas en hojas de 87 × 57 cm (la cama de FIC), con el kerf ya compensado.
- `impresion-3d/`: 16 STL, uno por pieza, ya orientados para imprimir.
- `mesa-tambores-taller.zip`: todo lo anterior y este README, para mandarlo de una vez.

## Texto para el taller de corte láser

```text
Hola, buen día. Quiero cotizar un corte láser CO2 con material incluido, para recoger en CDMX.

1) MDF de 5,5 mm (el que venden como «de 6»): 24 piezas en 2 hojas de 90 × 60 cm, unos 19 m de corte. Archivos mesa-tambores-mdf-5.5mm-hoja-1 y -hoja-2.
2) Acrílico transparente de 3 mm: 13 piezas, casi todas redondas (tapas de Ø170 y bridas de Ø130, Ø64 y Ø44), unos 5 m de corte. Caben en media hoja de 90 × 60. Archivo mesa-tambores-acrilico-transparente-3mm-hoja-1.
3) Acrílico negro de 3 mm: 3 piezas chicas (una placa de 60 × 70 mm con ventana y dos tiras de 60 × 3 mm) en un retazo de 20 × 30 cm. Archivo mesa-tambores-acrilico-negro-3mm-hoja-1.

Detalles:
- Archivos a escala real en milímetros: DXF R12 (abre en AutoCAD 2010/2013, CorelDRAW y LightBurn), y los mismos en SVG y PDF. Rojo = corte, azul = marcado vectorial ligero, negro = rótulo grabado (opcional).
- Las piezas encajan a presión por dientes y ranuras, sin tornillos. Los archivos ya traen compensado un kerf de 0,2 mm en MDF y 0,15 mm en acrílico: si el de su máquina es distinto, avísenme y se los mando ajustados.
- Antes de cortar todo, por favor midan con vernier el espesor real del MDF y corten primero las piezas de prueba E14 y E15 (y la A06 en acrílico). Si la ranura que entra justa no es la del centro (5,5 mm), les mando los archivos con el espesor que midan; se regeneran en un minuto.
- El acrílico con su película protectora; no hace falta pulir cantos.
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

## Cuánto debería costar

Estimado con las tarifas publicadas en CDMX el 5-nov-2026: corte láser de $7 a $10 por minuto (FIC cobra $9), e impresión 3D de $2,50 a $4,00 por gramo o de $1,20 a $1,80 por minuto. Una cotización fuera del rango alto pide revisar qué cobran aparte. Una por debajo del bajo suele ser solo el corte, sin material.

| Trabajo | Cantidad | Bajo | Medio | Alto |
|---|---|---|---|---|
| Corte láser · MDF de 5,5 mm | 24 piezas · 18,9 m · 41 min · 2 hojas | $629 | $711 | $812 |
| Corte láser · acrílico transparente de 3 mm | 13 piezas · 5,2 m · 5 min · 1 hoja | $246 | $255 | $700 |
| Corte láser · acrílico negro de 3 mm | 3 piezas · 0,6 m · 1 min · 1 hoja | $20 | $22 | $83 |
| Impresión 3D en PETG | 28 piezas · 373 g · 16 h | $932 | $1,277 | $1,723 |
| **Total de taller** | | **$1,826** | **$2,266** | **$3,320** |

- FIC Corte Láser (Polanco): $9/min lun–sáb de 8 a 20 h, material aparte, cama de 87 × 57 cm, recolección $60: https://fic-cortelaser.mx/
- Otros talleres de CDMX: Estudio Aragón $6–9/min, Impresiones DE desde $8/min, Preciso $10/min: https://estudioaragon.com/
- Velocidades de referencia de un CO2 de 100 W (Forza): MDF 6 mm 10 mm/s, acrílico 3 mm 24 mm/s; ×1,3 por traslados y perforaciones: https://support.forzalaser.com/wp-content/uploads/2025/02/PARAMETROSREFERENCIALES-FORZA100W.pdf
- Hojas de 90 × 60 cm en FIC: MDF 5,5 mm $170, acrílico transparente 3 mm $594; acrílico de color $0,23/cm²: https://fic-cortelaser.mx/
- Impresora 3D México (Anzures): PLA $1,20/min y PETG $1,80/min de máquina: https://www.impresora3dmexico.com.mx/precios-por-impresion-3D.php
- Por gramo: PLA desde $2/g en MercadoLibre; el PETG cuesta 1,5 veces el PLA: https://www.mercadolibre.com.mx/

## Piezas de corte láser

Cada pieza lleva su código grabado en la cara que no se ve con la mesa armada. Las de prueba (E14, E15, A06) se cortan primero.

| Código | Pieza | Cant. | Material | mm | Paso | Qué hace |
|---|---|---|---|---|---|---|
| E01 | Piso | 1 | MDF 5,5 mm | 383 × 262 | 1 | Base de todo: en sus ranuras entran las torres de los motores, el marco y los topes de la fuente; los cinchos de los drivers y de las tarjetas pasan por sus ranuras chicas · Opcional: cola blanca en los dientes de las paredes |
| E02 | Frente | 1 | MDF 5,5 mm | 383 × 125 | 4 | Pared del lado de la lente; la cuna de la lente se apoya en su cara de afuera · Opcional: cola blanca en los dientes del piso y de los costados |
| E03 | Costado izquierdo | 1 | MDF 5,5 mm | 262 × 125 | 4 | Pared del lado del tambor 1 · Opcional: cola blanca |
| E04 | Costado derecho | 1 | MDF 5,5 mm | 262 × 125 | 4 | Pared del lado del tambor 2 y del brazo tensor · Opcional: cola blanca |
| E05 | Cubierta (capa de arriba) | 1 | MDF 5,5 mm | 383 × 276 | 5 | Lleva los dos 608 de los tambores, los ejes de las guías y el hueco donde gira el brazo tensor; todo lo de arriba se posiciona con ella · Cola blanca en toda la cara de abajo, con los 608 ya puestos: queda pegada a la contracubierta |
| E06 | Contracubierta (capa de abajo) | 1 | MDF 5,5 mm | 383 × 276 | 5 | Le hace tope a los 608 de la capa de arriba, lleva el 608 de arriba del pivote y recibe los dientes de las torres y del marco de la fuente |
| E07 | Tapa trasera | 1 | MDF 5,5 mm | 383 × 125 | 12 | Se quita para llegar a la electrónica: entra en los dientes del piso, de los costados y de la cubierta, y la sujetan dos cuñas |
| E08 | Costado de torre | 4 | MDF 5,5 mm | 54 × 120 | 1 | Cuatro iguales: dos por motor. Abajo entran en el piso, arriba en la contracubierta; sostienen el collar del motor y la placa del segundo 608. La muesca de abajo deja salir el conector del motor |
| E09 | Collar del motor | 2 | MDF 5,5 mm | 68 × 54 | 1 | El cuerpo del motor entra en su hueco cuadrado de 42,6 mm: no gira ni se mueve. Forrar el hueco con cinta de espuma si queda juego |
| E10 | Placa del segundo 608 | 2 | MDF 5,5 mm | 68 × 54 | 2 | Lleva el segundo 608 del eje del tambor, 25 mm abajo del de la cubierta: el tambor no cabecea |
| E11 | Marco de la fuente | 1 | MDF 5,5 mm | 116 × 120 | 1 | La fuente se para detrás de él, contra la tapa trasera; por la ventana se ven sus bornes |
| E12 | Tope de la fuente | 2 | MDF 5,5 mm | 30 × 26 | 1 | Dos: no dejan que la fuente se corra de lado |
| E13 | Cuña | 4 | MDF 5,5 mm | 16 × 46 | 12 | Dos (y dos de repuesto): entran por las ventanas de los dientes de la cubierta y aprietan la tapa trasera. Se sacan jalando de la cabeza |
| E14 | Pieza de prueba (ranuras, 608 y eje) | 1 | MDF 5,5 mm | 100 × 66 | prueba | Se corta primero: con la llave E15 se elige la ranura que entra apretada, con un 608 el barreno del rodamiento y con el eje el de 8 mm. Si la buena no es la del centro (6,0 mm, 22,0 mm, 7,9 mm), se regeneran los archivos con el espesor medido |
| E15 | Llave de prueba | 1 | MDF 5,5 mm | 30 × 12 | prueba | Tira del mismo MDF: se mete de canto en las ranuras de la E14 |
| A01 | Tapa del tambor | 2 | Acrílico transparente 3 mm | 170 × 170 | 10 | Dos iguales: la del tambor 2 va volteada. Encajan a presión en los broches de sus tres postes; el capuchón del sensor y su canal se abrochan encima |
| A02 | Brida de abajo del tambor | 2 | Acrílico transparente 3 mm | 130 × 130 | 6 | Entra en el cubo del núcleo impreso y se pega a su orilla con cemento de acrílico o cianoacrilato |
| A03 | Brida de arriba del tambor | 2 | Acrílico transparente 3 mm | 130 × 130 | 6 | La centra el eje de 8 mm; se pega a la orilla del núcleo |
| A04 | Brida de guía | 4 | Acrílico transparente 3 mm | 64 × 64 | 7 | Cuatro: dos por guía. El 608 atraviesa su barreno y la centra |
| A05 | Brida del rodillo tensor | 2 | Acrílico transparente 3 mm | 44 × 44 | 7 | Dos: igual que las de las guías |
| A06 | Pieza de prueba de acrílico | 1 | Acrílico transparente 3 mm | 90 × 40 | prueba | Barrenos de los broches de los postes (6,4 y 11,4) y del 608 (22,1) con ±0,2 mm: se prueba con las piezas impresas antes de cortar las tapas |
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
- I13 Cuna de la lente: estanca, 55.2 cm³, 51.2 g y 86 min cada una en una Bambu A1 · voladizos de más de 45°: 8.7 cm² (2.9 % de la superficie): soportes u otra orientación
- I14 Brazo del sensor de marcas: estanca, 5.2 cm³, 5.1 g y 9 min cada una en una Bambu A1 · voladizos de más de 45°: 0.6 cm² (2.1 % de la superficie): soportes u otra orientación
- I15 Ancla del resorte: estanca, 0.3 cm³, 0.3 g y 2 min cada una en una Bambu A1 · voladizos de más de 45°: 0.3 cm² (9.1 % de la superficie): soportes u otra orientación
- I16 Espiga Ø5,8 × 18: estanca, 0.5 cm³, 0.6 g y 4 min cada una en una Bambu A1

## Cómo se arma

Los mismos pasos que muestra *Mechanical Simulation → Ensamble sin tornillos* (`?demo=tambores&ensamble=1`).

**1. Piso, torres y marco de la fuente**
   - Cortar primero las piezas de prueba (E14, E15, A06) y ajustar si hace falta.
   - Armar cada torre: dos costados E08 con su collar E09 en las ranuras de abajo.
   - Encajar las dos torres, el marco E11 y los dos topes E12 en las ranuras del piso E01.
   - Entran: E01, E08, E09, E11, E12

**2. Motores, coples y segundo 608**
   - Bajar cada motor por el collar hasta el piso, con el conector hacia la muesca del costado.
   - Poner el cople en el eje del motor (13 mm de eje dentro del cople) y apretar su prisionero.
   - Meter un 608 a presión en cada placa E10 y encajarla en las ranuras de arriba de la torre: los costados se abren un poco.
   - Entran: motor-17hs8401, coupling-5-8, E10, bearing-608

**3. Electrónica en el piso**
   - La fuente de pie detrás del marco E11, entre los topes.
   - Cada DM542 delante de su motor con dos cinchos; la placa de expansión con el ESP32, los reguladores y la resistencia con un cincho cada uno.
   - La protoboard con su adhesivo. Cablear potencia y señales (ver la vista Electrónica).
   - Entran: psu-24v-5a, driver-dm542, esp32-expansion, esp32, buck-lm2596, led-resistor, breadboard-kit, cable-ties

**4. Paredes**
   - Encajar frente E02 y costados E03 y E04 en los dientes del piso y entre ellos.
   - Si la mesa va a moverse mucho, poner cola blanca en los dientes antes de cerrar.
   - Entran: E02, E03, E04

**5. Cubierta doble**
   - Pegar la copa impresa del pivote (I05) bajo la contracubierta E06 con sus tres espigas y epóxico.
   - Bajar la E06 sobre las paredes, las torres y el marco de la fuente.
   - Meter a presión los dos 608 de los tambores en la cubierta E05, poner cola blanca en su cara de abajo y bajarla sobre la E06 con los ejes de las guías como guía; prensar con peso una hora.
   - Meter el 608 de arriba del pivote desde el hueco: apoya en la copa.
   - Entran: E05, E06, I05, bearing-608, glue-wood

**6. Tambores**
   - Pegar con epóxico cada núcleo impreso (I01) a su eje de 100 mm, con 2 mm de eje arriba.
   - Pegar la brida de abajo A02 (barreno de 11,7) y la de arriba A03 (8,2) a las orillas del núcleo.
   - Bajar cada tambor por su 608 de la cubierta y el de la torre hasta el cople y apretar el prisionero: el cubo apoya en la pista interior del 608.
   - Entran: I01, A02, A03, shaft-8mm, epoxy

**7. Guías y brazo tensor**
   - Pegar con epóxico los ejes de 70 mm de las guías en la cubierta, a plomo.
   - Rondana M8, guía (I02 con dos 608 y sus bridas A04) y tapón I07.
   - Brazo I04 pegado al eje del pivote, eje del rodillo en su casquillo, rodillo I03 con sus 608 y bridas A05, tapón I07.
   - Resorte del brazo a la mitad del brazo y al ancla I15; tapa del imán (I06) en la punta de abajo del eje y el AS5600 en la ranura de la copa.
   - Entran: I02, I03, I04, I06, I07, I15, A04, A05, washers-m8, dancer-spring, as5600

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
   - Abrochar cada tapa A01 en sus tres postes (la del tambor 2, volteada).
   - Poner cada VL53L4CD con su tira de pines en ángulo y cubrirlo con su capuchón con canal (I10): el canal tapa los cables hasta el poste hueco.
   - Entran: A01, I10, hand-sensor, pin-headers

**11. Película**
   - Meter la punta de la cola del tambor 1 en la ranura de su núcleo y enrollarla; pasar la película por la guía 1, la ventana, la guía 2 y el rodillo tensor hasta el tambor 2.
   - Con el programa en banco, tensar a 1,5 N y probar las dos manos.
   - Entran: film

**12. Tapa trasera y cuñas**
   - Empujar la tapa trasera E07 sobre los dientes del piso, de los costados y de la cubierta.
   - Bajar las dos cuñas E13 por las ventanas de los dientes de la cubierta hasta que aprieten.
   - Entran: E07, E13

## Si el MDF no mide 5,5 mm

Mide el espesor con vernier en tres puntos de la hoja y regenera todo con ese valor: `node scripts/fabricar.mjs --mdf=5.7`. Dientes, ranuras, alturas y la lista de compras se recalculan.
