# Compra de electrónica del primer prototipo

Revisado el 2-nov-2026. Precios en MXN, antes de envío. Comprar en UNIT cubre casi todo; la columna total usa cantidades.

**Cómo se obtuvieron.** UNIT y MercadoLibre bloquean el acceso automático. Los precios de UNIT salen de tus capturas o
de fichas indexadas por el buscador, y los de MercadoLibre son rangos de resultados indexados sin fecha exacta. Amazon
se leyó directo de su búsqueda pública. Todo se confirma en el carrito antes de pagar.

| Pieza | Cant. | UNIT c/u | UNIT total | Amazon México | MercadoLibre |
|---|---:|---:|---:|---|---|
| Motor Nema 17 17HS8401 | 1 | 225 | 225 | 270.25 (B09MSRWNGL) | ~190–370 |
| Driver DM542 | 1 | 219 | 219 | 395 (B0BXQ4QFL8) | ~216–384 |
| Fuente 24 V 5 A | 1 | 210 | 210 | 425 (B08NJ9RDCQ) | ~130–260 |
| Cable AC 1.8 m | 1 | 93 | 93 | sin revisar | sin datos |
| ESP32 DevKitC V4 | 1 | 145 | 145 | 184.14 (B08V517B56, 38 pines) | ~120–184 |
| Sensor de barrera F249 | 2 | 20 | 40 | 66 c/u (B0D485FTKP) | sin datos |
| LED blanco frío 10 W | 3 | 26 | 78 | 330.06 paquete Chanzon (B01DBZJY4S) | sin datos |
| Regulador LM2596 | 2 | 36 | 72 | 179 por 2 (B0C254R78M) | sin datos |
| MOSFET IRLZ44N | 2 | 12 | 24 | 141.72 por 10 (B097NK3LFY) | sin datos |
| Driver de compuerta IR2101 | 1 | 50 | 50 | sin revisar | sin datos |
| Transistor S8050 | 3 | 2 | 6 | sin revisar | sin datos |
| Capacitor 1000 µF 50 V | 3 | 6 | 18 | 170.15 por 7, 35 V (B0FVG77HZV) | sin datos |
| Resistencia aluminio 10 W | 1 | 25–32 | 32 | 129 por 10, 2.2 Ω 5 W (B09RQLGMFQ) | sin datos |
| Cople flexible 5 × 8 mm | 1 | 33 | 33 | 66, D18L25 (B0D5NB3JS7) | sin datos |
| Soporte Nema 17 | 1 | 25 | 25 | 66 (B09RDBFQ8B) | sin datos |
| Rodamiento 608ZZ | 8 | 8 | 64 | 190 por 10 (B086LD7332) | sin datos |
| Fusible 500 mA + portafusible | 1 | no confirmado | — | sin revisar | sin datos |
| Placa de expansión ESP32 38 pines | 1 | ~89 estimado | 89 | sin revisar | sin datos |
| Kit protoboard 830 + MB102 + 65 jumpers | 1 | ~150 estimado | 150 | sin revisar | ~120–220 |
| Jumpers hembra-macho 20 cm (40) | 1 | ~45 estimado | 45 | sin revisar | ~56–92 |
| Disipador 40 × 40 × 20 mm | 1 | ~35 estimado | 35 | sin revisar | sin datos |
| Resistencias 1/4 W (1 kΩ, 10 Ω, 10 kΩ) | 6 | ~1 estimado | 6 | sin revisar | sin datos |
| Capacitores 100 nF y 10 µF | 2 | ~3 estimado | 6 | sin revisar | sin datos |
| Separador M3 × 40 mm de latón | 8 | ~7 estimado | 56 | sin revisar | sin datos |
| Cable 18 AWG rojo y negro (m) | 4 | ~15 estimado | 60 | sin revisar | sin datos |
| **Total UNIT** | | | **1,781** | | |

Los ocho renglones añadidos el 2-nov-2026 (caja de control, ADR-0007) tienen precio estimado: sus fichas existen en
UNIT, pero no pude leer el precio. Sin ellos, el total es 1,334.

La página **compras.html** muestra esta misma lista con cada pieza en 3D, permite sacar renglones de la compra y marcar
lo comprado.

## Antes de pagar

- **Rodamiento 608ZZ:** el precio aparece a 8 y también de 21 a 25 según la página. Con el segundo, el total sube unos 136.
- **LED de 10 W:** los 26 son el precio más probable, no confirmado en la ficha principal. Elige la variante de 10 W.
- **Resistencia:** confirma que exista en 3.3 Ω. El valor final sale de medir en banco.
- **IR2101:** quedaban 14 piezas. Comprueba que su entrada acepte 3.3 V.
- **Fusible:** hay una categoría con 22 productos, pero no confirmé el modelo.
- **Fuente:** quedaban 13 piezas de la UE-120-24.
- **Envío:** las páginas de UNIT se contradicen. Mencionan de 59 a 99 sobre 599, o recoger gratis en sucursal.

## Fuera de esta lista

Película, lente de 50 mm f/1.8, condensador, ejes de 8 mm, resorte, base y rodillos impresos. UNIT también ofrece
impresión 3D y corte láser, sin cotizar aquí. La lista completa está en `docs/COMPRAS.md`.

## Orden de compra

1. Compra primero la electrónica y arma el pulso del LED en banco.
2. Mide flujo, temperatura y disparo con una tira impresa con tu tinta real.
3. Con eso, decide lente, tamaño de imagen y película final.

## Dos tambores con la mano (ADR-0011)

Revisado el 5-nov-2026. Es la versión que se construye y suma estas piezas a la lista de arriba. La lista completa
está en `docs/COMPRAS-TAMBORES.md` y en `compras.html?demo=tambores`.

**Cómo se obtuvieron.** Los dólares se pasaron a 18,80 MXN, el FIX de Banxico del 30-oct-2026 (18,7962). Amazon México
se leyó en sus páginas de producto, sin carrito ni sesión. Sus fechas de entrega son para el C.P. que usa por omisión.
Los precios de UNIT salen del buscador y hay que confirmarlos en el carrito.

| Pieza | Cant. | Dónde | c/u | Total | Alternativas |
|---|---:|---|---:|---:|---|
| Motor Nema 17 17HS8401 (el segundo) | +1 | UNIT | 225 | 225 | igual que arriba |
| Driver DM542 (el segundo) | +1 | UNIT | 219 | 219 | TMC2209 en UNIT, de 87 a 99 (existencias por confirmar) |
| Soporte Nema 17 y cople 5 × 8 (los segundos) | +1 de cada uno | UNIT | 25 y 33 | 58 | igual que arriba |
| Transistor S8050 | +2 (5 en total) | UNIT | 2 | 4 | — |
| Sensor de mano VL53L4CD, SparkFun SEN-18993 | 2 | Amazon México (B09YWNL4BN), envío gratis, entrega el 17-nov | 500.18 | 1,000.36 | Pololu #3692 a US$13.95 (≈262) más envío y aduana; DigiKey, Adafruit 5396, a US$14.95 (≈281) y US$30 de envío abajo de US$100 |
| Sensor VL53L0X para la prueba de banco (opcional) | 1 | UNIT, 1,199 disponibles | 47 | 47 | Amazon, 2 por 150.38 (B099N2JW89) |
| Encoder AS5600 con imán | 1 | UNIT, 67 disponibles | 52 | 52 | Amazon HiLetgo, 2 por 258.98 con imán diametral (B09KGWC1PT) |
| Kit de 200 resortes de compresión y extensión (AR3384) | 1 | UNIT, 283 disponibles | 162 | 162 | Amazon HERCHR, 274 (B0BWNHMW7Z), entrega el 7-nov |
| Jumpers hembra-hembra de 30 cm (40) | 1 | UNIT | 20 | 20 | Amazon ELEGOO, 120 de 20 cm por 199.99 (B01EV70C78) |
| Kit de 1260 tornillos M2 a M5 | 1 | UNIT | 341 | 341 | Amazon DSHTP, kit M3 con insertos y cautín, 473.37 (B0GGH7DMKG) |
| Tira de pines macho de 40 | 1 | UNIT | sin precio | — | — |
| Rodamientos 608ZZ | +4 (12 en total) | UNIT | 8 | 32 | igual que arriba |

**Por qué el VL53L4CD viene de Amazon.** Ninguna tienda en México lo tiene: ni UNIT, ni MercadoLibre, ni 330ohms, ni
AG Electrónica, ni SandoRobotics. Pololu cuesta la mitad, pero no publica su envío a México y la aduana corre por tu
cuenta. Amazon lo trae con los impuestos incluidos. AG Electrónica tiene el VL53L1X (OKY3240-0) a 174.14, que mide hasta
4 m pero en un cono de 27°: no lo recomiendo para una mano a 3 cm.

**Antes de pagar:**

- **AS5600:** la ficha de UNIT no dice si el imán es diametral, con los polos a los lados del disco. Compruébalo al
  recibirlo; si no lo es, el de HiLetgo sí. Evita el de UMLIFE: sus reseñas reportan imanes que no son diametrales.
- **VL53L0X:** también aparece a 48 y a 54 en páginas más viejas.
- **TMC2209:** la ficha dice «Sin existencias» y sus datos dicen que hay.
- **Kit M3 de UNIT:** solo encontré su categoría, no su ficha.

**Fuera de esta lista:**

- Tambores, guías, brazo tensor y tapas: impresión 3D y corte láser.
- Base de PET y laminado: 6,1 m de cada uno. No encontré precio en México; hay que pedir cotización.
- Ejes de 8 mm.
