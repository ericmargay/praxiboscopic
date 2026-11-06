// Alternativas de compra fuera de UNIT Electronics, por renglón de la lista (id de pieza de bom.ts). Amazon México se
// leyó directo de su búsqueda pública el 2-nov-2026; MercadoLibre son rangos de resultados indexados por el buscador,
// sin fecha exacta (la página pide verificar la cuenta). Los avisos «antes de pagar» salen de las fichas de UNIT.
// Fuente legible: docs/COMPRAS-ELECTRONICA.md.

export interface Offer {
  store: 'Amazon México' | 'MercadoLibre' | 'Pololu' | 'DigiKey México';
  /** precio total de la oferta en MXN (o rango) */
  price?: number;
  range?: [number, number];
  /** qué trae la oferta, si no es una pieza */
  pack?: string;
  url: string;
  note?: string;
  /** cuándo se leyó (por omisión, el 2-nov-2026) */
  date?: string;
}

export interface RowExtra {
  offers: Offer[];
  /** qué revisar en el carrito de UNIT antes de pagar */
  check?: string;
}

const amz = (asin: string) => `https://www.amazon.com.mx/dp/${asin}`;
const ml = (q: string) => `https://listado.mercadolibre.com.mx/${q}`;

export const OFFERS: Record<string, RowExtra> = {
  'motor-17hs8401': { offers: [{ store: 'Amazon México', price: 270.25, url: amz('B09MSRWNGL') }, { store: 'MercadoLibre', range: [190, 370], url: ml('motor-a-pasos-nema-17') }] },
  'driver-dm542': { offers: [{ store: 'Amazon México', price: 395, url: amz('B0BXQ4QFL8') }, { store: 'MercadoLibre', range: [216, 384], url: ml('driver-dm542') }] },
  'psu-24v-5a': { offers: [{ store: 'Amazon México', price: 425, url: amz('B08NJ9RDCQ') }, { store: 'MercadoLibre', range: [130, 260], url: ml('fuente-conmutada-24v-5a'), note: 'Puede salir más barata; confirma marca y protecciones' }], check: 'Quedaban 13 piezas de la UE-120-24' },
  esp32: { offers: [{ store: 'Amazon México', price: 184.14, pack: '38 pines', url: amz('B08V517B56') }, { store: 'MercadoLibre', range: [120, 184], url: ml('esp32-38-pines-esp-wroom-32') }] },
  'sensor-f249': { offers: [{ store: 'Amazon México', price: 66, pack: '1 pieza', url: amz('B0D485FTKP') }] },
  'led-10w': { offers: [{ store: 'Amazon México', price: 330.06, pack: 'paquete Chanzon', url: amz('B01DBZJY4S') }], check: 'Los 26 son el precio más probable, no confirmado en la ficha principal: elige la variante de 10 W' },
  'buck-lm2596': { offers: [{ store: 'Amazon México', price: 179, pack: '2 piezas', url: amz('B0C254R78M') }] },
  'led-mosfet': { offers: [{ store: 'Amazon México', price: 141.72, pack: '10 piezas', url: amz('B097NK3LFY') }] },
  'led-gate-driver': { offers: [], check: 'Quedaban 14 piezas. Comprueba en la hoja de datos que LIN acepte 3,3 V' },
  'led-caps': { offers: [{ store: 'Amazon México', price: 170.15, pack: '7 piezas de 35 V', url: amz('B0FVG77HZV') }] },
  'led-resistor': { offers: [{ store: 'Amazon México', price: 129, pack: '10 piezas de 2,2 Ω 5 W', url: amz('B09RQLGMFQ') }], check: 'Confirma que exista en 3,3 Ω; el valor final sale de medir en banco' },
  'coupling-5-8': { offers: [{ store: 'Amazon México', price: 66, pack: 'D18L25', url: amz('B0D5NB3JS7') }] },
  'bracket-nema17': { offers: [{ store: 'Amazon México', price: 66, url: amz('B09RDBFQ8B') }] },
  'bearing-608': { offers: [{ store: 'Amazon México', price: 190, pack: '10 piezas', url: amz('B086LD7332') }], check: 'Aparece a 8 y también de 21 a 25 según la página: con el segundo, el total sube unos 136' },
  'led-fuse': { offers: [], check: 'Hay una categoría con 22 productos, pero no confirmé el modelo' },
  'esp32-expansion': { offers: [], check: 'Precio estimado: la ficha existe pero no pude leer el precio' },
  'breadboard-kit': { offers: [{ store: 'MercadoLibre', range: [120, 220], url: ml('kit-protoboard-830-fuente-mb102') }], check: 'Precio estimado: la ficha existe pero no pude leer el precio' },
  'jumpers-hm': { offers: [{ store: 'MercadoLibre', range: [56, 92], pack: '40 piezas', url: ml('jumpers-macho-hembra') }], check: 'Precio estimado' },
  // dos tambores (ADR-0011): leído el 5-nov-2026. Dólares a 18,80 MXN (FIX del 30-oct-2026: 18,7962)
  'hand-sensor': {
    offers: [
      { store: 'Pololu', price: 262, note: '#3692 a US$13.95, con sus pines. Pololu calcula el envío a México al pagar y la aduana corre por tu cuenta', url: 'https://www.pololu.com/product/3692', date: '5-nov-2026' },
      { store: 'DigiKey México', price: 281, note: 'Adafruit 5396 a US$14.95. Envío de US$30 abajo de US$100 de pedido; IVA y aranceles al recibir', url: 'https://www.digikey.com.mx/es/products/detail/adafruit-industries-llc/5396/16129669', date: '5-nov-2026' },
    ],
    check: 'Ninguna tienda en México lo tiene. Amazon lo envía con los impuestos incluidos y da entrega para el 17-nov. La placa de SparkFun tiene conectores Qwiic; si no trae pines, suéldale una tira de 6. El sensor del tambor 2 usa su pin de apagado (XSHUT)',
  },
  'hand-sensor-bench': { offers: [{ store: 'Amazon México', price: 150.38, pack: '2 piezas, VKLSVAN', url: amz('B099N2JW89'), date: '5-nov-2026' }], check: 'Precio del buscador: también aparece a 48 y 54; desde 10 piezas baja a 41.32' },
  as5600: { offers: [{ store: 'Amazon México', price: 258.98, pack: '2 piezas, HiLetgo, con imán diametral según las reseñas', url: amz('B09KGWC1PT'), date: '5-nov-2026' }], check: 'La ficha de UNIT dice que trae un imán de neodimio, pero no si es diametral (los polos a los lados del disco). Compruébalo al recibirlo; si no lo es, el HiLetgo de Amazon sí lo es. Evita el UMLIFE: sus reseñas reportan imanes que no son diametrales' },
  'dancer-spring': { offers: [{ store: 'Amazon México', price: 274, pack: '200 piezas, HERCHR, 124 de extensión', url: amz('B0BWNHMW7Z'), date: '5-nov-2026' }, { store: 'MercadoLibre', range: [93, 519], pack: 'kits de 200', url: ml('resorte-de-compresion-y-extension') }], check: 'Precio del buscador. Del surtido, prueba los de extensión de 5 a 8 mm de diámetro y de 20 a 32 mm de largo' },
  'jumpers-hh': { offers: [{ store: 'Amazon México', price: 199.99, pack: 'ELEGOO, 120 de 20 cm (40 HH, 40 MH y 40 MM)', url: amz('B01EV70C78'), date: '5-nov-2026' }], check: 'Precio del buscador: pide la variante hembra-hembra (HH) de 30 cm; existencias sin confirmar' },
  'm3-kit': { offers: [{ store: 'Amazon México', price: 473.37, pack: 'DSHTP, 420 piezas M3 con insertos de latón y su cautín', url: amz('B0GGH7DMKG'), date: '5-nov-2026' }], check: 'No encontré la ficha del kit de UNIT, solo su categoría: búscalo por nombre en la tienda. No trae insertos de latón; para las piezas impresas sirve el kit DSHTP de Amazon' },
};

/** envío de UNIT: las páginas se contradicen (59 a 99 sobre 599, o recoger gratis en sucursal) */
export const UNIT_SHIPPING = 'Las páginas de UNIT se contradicen: de 59 a 99 MXN de envío en compras mayores a 599, o recoger gratis en sucursal.';
