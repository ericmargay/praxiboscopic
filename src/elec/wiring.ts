// Conexiones de la electrónica de la mesa de dos tambores (ADR-0015): qué va con qué, en qué agujero de la protoboard,
// con qué cable y en qué orden, para armarla y probarla en banco por etapas antes de fijarla al piso.
// Aquí vive el esquema dos veces, a propósito: como redes (`NETS`: qué pines deben quedar unidos) y como montaje físico
// (componentes en agujeros y cables de punta a punta). `checkWiring` arma las redes que resultan del montaje, con las
// tiras de la protoboard, y las compara con el esquema: si un cable está mal puesto en este archivo, la prueba lo dice.
// Sin DOM ni three: lo usan el visor de conexiones, las pruebas y el programa de prueba (mismos pines).

/** pines del ESP32, los mismos del programa de prueba (`public/electronica/prueba-banco/prueba-banco.ino`) */
export const PINS = { pul1: 25, dir1: 26, pul2: 32, dir2: 33, led: 27, mark: 34, sda: 21, scl: 22, xshut2: 4 } as const;

/** pulsos por vuelta del DM542 (1/16 de paso) */
export const PULSES_PER_REV = 3200;

/** filas de pines del ESP32-DevKitC V4, de la antena al conector USB; J2 queda a la izquierda con la antena arriba */
export const ESP32_J2 = ['3V3', 'EN', 'VP', 'VN', 'GPIO34', 'GPIO35', 'GPIO32', 'GPIO33', 'GPIO25', 'GPIO26', 'GPIO27', 'GPIO14', 'GPIO12', 'GND1', 'GPIO13', 'SD2', 'SD3', 'CMD', '5V'] as const;
export const ESP32_J3 = ['GND2', 'GPIO23', 'GPIO22', 'TX', 'RX', 'GPIO21', 'GND3', 'GPIO19', 'GPIO18', 'GPIO5', 'GPIO17', 'GPIO16', 'GPIO4', 'GPIO0', 'GPIO2', 'GPIO15', 'SD1', 'SD0', 'CLK'] as const;

export type CableKind = 'ac' | 'awg18' | 'tip' | 'motor' | 'mm' | 'hm' | 'hh';
export const CABLE: Record<CableKind, { label: string; note: string }> = {
  ac: { label: 'Cable de alimentación AC', note: 'Los tres hilos del cable universal, con el conector C13 cortado' },
  awg18: { label: 'Dúplex 18 AWG', note: 'Rojo para positivo y negro para tierra; atornillado o soldado en las dos puntas' },
  tip: { label: 'Cable con punta de pin', note: 'El 18 AWG no entra en la protoboard: la punta que llega a ella termina en medio jumper macho-macho, soldado o torcido y con cinta. En los reguladores, el otro extremo va soldado al pad' },
  motor: { label: 'Cable del motor', note: 'Los cuatro hilos que trae el motor, directo a los bornes del driver' },
  mm: { label: 'Jumper macho-macho', note: 'Del kit de la protoboard; los que van a los bornes del DM542 son los más largos' },
  hm: { label: 'Jumper hembra-macho', note: 'La hembra en el pin del ESP32 o del sensor y el macho en la protoboard' },
  hh: { label: 'Jumper hembra-hembra', note: 'Directo de un pin del sensor a un pin del ESP32' },
};

/** color sugerido de cada cable: el del modelo 3D y el que conviene usar en la mesa */
export const WIRE_COLOR = {
  rojo: 0xc8372d,
  negro: 0x23272b,
  naranja: 0xe07b26,
  morado: 0x7b4bb3,
  rosa: 0xd4608c,
  verde: 0x2b8a4b,
  azul: 0x2a6fb5,
  blanco: 0xf0f0ee,
  gris: 0x8d979e,
  cafe: 0x8a5a3c,
  turquesa: 0x1f9e9e,
  celeste: 0x6fb1d8,
} as const;
export type WireColor = keyof typeof WIRE_COLOR;
export const COLOR_LABEL: Record<WireColor, string> = { rojo: 'rojo', negro: 'negro', naranja: 'naranja', morado: 'morado', rosa: 'rosa', verde: 'verde', azul: 'azul', blanco: 'blanco', gris: 'gris', cafe: 'café', turquesa: 'turquesa', celeste: 'azul claro' };

export type NetKind = 'mains' | 'v24' | 'v12' | 'v5' | 'v33' | 'gnd' | 'signal' | 'i2c' | 'coil' | 'pulse';
export interface NetSpec {
  id: string;
  label: string;
  kind: NetKind;
  /** qué debe medirse en esta red contra tierra, o qué señal lleva */
  level: string;
  /** pines de componentes que deben quedar unidos: `componente.pin` */
  pins: string[];
  /** paso a partir del cual la red está completa (los cables que la arman pueden entrar antes) */
  final?: boolean;
}

export type ElecGroup = 'potencia' | 'motores' | 'control' | 'sensores' | 'led' | 'protoboard';
export const GROUP_LABEL: Record<ElecGroup, string> = { potencia: 'Potencia', motores: 'Motores y drivers', control: 'Control', sensores: 'Sensores', led: 'Luz', protoboard: 'En la protoboard' };

export interface ElecPin {
  id: string;
  /** como viene impreso en la pieza */
  label: string;
  /** para qué sirve */
  what?: string;
}

export interface ElecComponent {
  id: string;
  /** forma en el catálogo de piezas (`src/three/parts.ts`), o una propia del visor */
  kind: string;
  name: string;
  /** nombre corto para las tablas de cables */
  short: string;
  group: ElecGroup;
  /** renglón de la lista de compras */
  bomId?: string;
  /** paso en el que entra */
  step: number;
  /** valor, si es un pasivo */
  value?: string;
  pins: ElecPin[];
  /** pines unidos por dentro de la pieza */
  internal?: string[][];
  /** en la protoboard: pin → agujero */
  mount?: Record<string, string>;
  /** cómo se orienta al insertarla */
  orient?: string;
  /** datos eléctricos: lo que hay que saber de la pieza */
  data: [string, string][];
  /** ajustes antes de conectarla */
  setup?: string[];
  warn?: string[];
}

export interface Wire {
  id: string;
  /** `componente.pin` o `bb:<agujero>` */
  from: string;
  to: string;
  color: WireColor;
  cable: CableKind;
  step: number;
  note?: string;
}

export interface StepTest {
  do: string;
  expect: string;
  /** comando del programa de prueba, si lo hay */
  cmd?: string;
}
export interface WiringStep {
  n: number;
  title: string;
  goal: string;
  /** de dónde sale la corriente durante la prueba de este paso */
  power: 'fuente' | 'usb' | 'ambas';
  todo: string[];
  test: StepTest[];
  fail?: string[];
  warn?: string[];
}

// --- protoboard --------------------------------------------------------------------------------------------------------
// Agujeros: `a1`…`j63` en las tiras (cada columna une a–e por un lado y f–j por el otro) y cuatro rieles: `+a`/`-a`
// junto a la fila a y `+j`/`-j` junto a la fila j, con el número de columna más cercano (`-a11`). En muchas
// protoboards de 830 puntos cada riel está partido a la mitad (la línea roja o azul se interrumpe): el montaje no
// depende de eso, y la prueba lo revisa de las dos maneras.
export interface Hole {
  rail: '' | '+' | '-';
  row: string;
  col: number;
}
export const RAIL_COLS: number[] = Array.from({ length: 59 }, (_, k) => k + 3).filter((c) => (c - 3) % 6 !== 5);
const MID = 32;

export function parseHole(ref: string): Hole | null {
  const m = /^bb:([+-]?)([a-j])(\d{1,2})$/.exec(ref);
  if (!m) return null;
  const h: Hole = { rail: m[1] as Hole['rail'], row: m[2], col: Number(m[3]) };
  if (h.rail) return (h.row === 'a' || h.row === 'j') && RAIL_COLS.includes(h.col) ? h : null;
  return h.col >= 1 && h.col <= 63 ? h : null;
}

/** la tira de contacto a la que pertenece un agujero */
export function stripOf(h: Hole, splitRails: boolean): string {
  if (h.rail) return `riel${h.rail}${h.row}${splitRails ? (h.col < MID ? ':1' : ':2') : ''}`;
  return `col${h.col}:${'abcde'.includes(h.row) ? 'ae' : 'fj'}`;
}

/** «a12», «riel azul (−) del lado a, hacia la columna 11» */
export function holeText(ref: string, long = false): string {
  const h = parseHole(ref);
  if (!h) return ref;
  if (!h.rail) return `${h.row}${h.col}`;
  const name = h.rail === '+' ? 'riel rojo (+)' : 'riel azul (−)';
  return long ? `${name} del lado ${h.row}, hacia la columna ${h.col}` : `${name} lado ${h.row} · col. ${h.col}`;
}

// --- componentes -------------------------------------------------------------------------------------------------------
const pins = (...ids: string[]): ElecPin[] => ids.map((id) => ({ id, label: id }));
const R_BANDS: Record<string, string> = { '1 kΩ': 'café · negro · negro · café · café', '10 Ω': 'café · negro · negro · dorado · café', '10 kΩ': 'café · negro · negro · rojo · café' };

function resistor(id: string, value: keyof typeof R_BANDS, a: string, b: string, step: number, what: string): ElecComponent {
  return {
    id,
    kind: 'resistor',
    name: `${id.toUpperCase()} · resistencia de ${value}`,
    short: `${id.toUpperCase()} ${value}`,
    group: 'protoboard',
    bomId: 'small-resistors',
    step,
    value,
    pins: pins('a', 'b'),
    mount: { a: `bb:${a}`, b: `bb:${b}` },
    orient: 'Acostada, con las patas dobladas a cuatro agujeros de distancia. No tiene polaridad.',
    data: [
      ['Para qué', what],
      ['Valor', `${value}, 1/2 W, 1 %`],
      ['Bandas', R_BANDS[value]],
    ],
  };
}

function npn(k: number, col: number, what: string): ElecComponent {
  return {
    id: `npn-${k}`,
    kind: 'npn',
    name: `Q${k + 1} · transistor 2N3904 (${what})`,
    short: `Q${k + 1} 2N3904`,
    group: 'protoboard',
    bomId: 'npn-2n3904',
    step: k < 2 ? 4 : 5,
    pins: [
      { id: 'E', label: 'E', what: 'Emisor: a tierra' },
      { id: 'B', label: 'B', what: 'Base: del GPIO, por 1 kΩ' },
      { id: 'C', label: 'C', what: `Colector: a ${what.split(' ')[0]}− del driver` },
    ],
    mount: { E: `bb:b${col}`, B: `bb:b${col + 1}`, C: `bb:b${col + 2}` },
    orient: 'La cara plana hacia la fila a. Así, de izquierda a derecha, sus patas son E, B y C.',
    data: [
      ['Para qué', `Lleva ${what} a la entrada de 5 V del driver: el ESP32 solo da 3,3 V. Con el GPIO en alto conduce y enciende el optoacoplador del driver`],
      ['Límites', '40 V · 200 mA'],
      ['Corriente aquí', 'Unos 13 mA por el colector y 2,6 mA por la base'],
    ],
  };
}

function dm542(n: 1 | 2): ElecComponent {
  return {
    id: `dm542-${n}`,
    kind: 'dm542',
    name: `Driver DM542 del motor ${n}`,
    short: `DM542 ${n}`,
    group: 'motores',
    bomId: 'driver-dm542',
    step: n === 1 ? 4 : 5,
    pins: [
      { id: 'PUL+', label: 'PUL+', what: 'Ánodo de la entrada de pasos: a 5 V' },
      { id: 'PUL-', label: 'PUL−', what: 'Cada vez que baja a tierra, un micropaso' },
      { id: 'DIR+', label: 'DIR+', what: 'Ánodo de la entrada de sentido: a 5 V' },
      { id: 'DIR-', label: 'DIR−', what: 'A tierra o libre: un sentido u otro' },
      { id: 'ENA+', label: 'ENA+', what: 'Libre: el driver queda habilitado' },
      { id: 'ENA-', label: 'ENA−', what: 'Libre' },
      { id: 'GND', label: 'GND', what: 'Tierra de potencia' },
      { id: '+V', label: '+V', what: '24 V' },
      { id: 'A+', label: 'A+', what: 'Bobina A' },
      { id: 'A-', label: 'A−', what: 'Bobina A' },
      { id: 'B+', label: 'B+', what: 'Bobina B' },
      { id: 'B-', label: 'B−', what: 'Bobina B' },
    ],
    data: [
      ['Alimentación', '20 a 50 V de continua; aquí 24 V'],
      ['Corriente al motor', 'De 1,0 a 4,2 A pico, por interruptores'],
      ['Entradas', 'Optoacopladas, de 5 a 24 V y unos 10 mA. Los 3,3 V del ESP32 no alcanzan: por eso pasan por un transistor'],
      ['Pulso mínimo', '2,5 µs; el sentido se fija 5 µs antes del pulso'],
      ['Consumo', 'Menos de 1 A de la fuente con el motor girando'],
    ],
    setup: [
      'SW1 ON · SW2 OFF · SW3 ON: 1,91 A pico (1,36 A eficaces), para empezar sin calentar. El manual pide 1,4 veces la corriente del motor: si le falta fuerza a 30 fps, sube a 2,37 A con SW1 OFF · SW2 OFF · SW3 ON.',
      'SW4 OFF: en reposo baja a la mitad de la corriente y el motor no se calienta.',
      'SW5 ON · SW6 ON · SW7 OFF · SW8 ON: 3200 pulsos por vuelta (1/16 de paso).',
      'La tabla impresa en la tapa del driver manda: si no coincide con esto, usa la suya. Y los bornes, por sus letreros: el orden de GND y +V cambia entre versiones.',
      'Si el driver trae un selector de 5 V / 24 V para las señales (los DM542T y DM542E lo traen), va en 5 V. De fábrica viene en 24 V, y así el motor no se mueve con estas señales.',
    ],
    warn: ['El motor no se conecta ni se desconecta con el driver encendido: se daña.', 'Los interruptores se mueven con el driver apagado.'],
  };
}

function motor(n: 1 | 2): ElecComponent {
  return {
    id: `motor-${n}`,
    kind: 'nema17',
    name: `Motor ${n} · NEMA 17 17HS8401`,
    short: `Motor ${n}`,
    group: 'motores',
    bomId: 'motor-17hs8401',
    step: n === 1 ? 4 : 5,
    pins: [
      { id: 'A+', label: 'negro', what: 'Bobina A' },
      { id: 'A-', label: 'verde', what: 'Bobina A' },
      { id: 'B+', label: 'rojo', what: 'Bobina B' },
      { id: 'B-', label: 'azul', what: 'Bobina B' },
    ],
    data: [
      ['Tipo', 'Paso a paso bipolar de 4 hilos, 1,8° por paso (200 por vuelta)'],
      ['Corriente', '1,7 a 1,8 A por fase, según la ficha'],
      ['Bobinas', 'Unos 1,8 Ω y 3,2 mH cada una'],
      ['Par', '52 N·cm de retención'],
      ['Con el driver', '3200 pulsos por vuelta: a 30 rpm, 1600 pulsos por segundo'],
    ],
    setup: ['Antes de atornillar, confirma los pares con el multímetro en ohms: entre los dos hilos de una bobina hay unos 1,8 Ω; entre una bobina y la otra, circuito abierto. Los colores cambian según el lote.'],
    warn: ['Con el driver encendido el eje queda frenado: es normal.'],
  };
}

function tof(n: 1 | 2): ElecComponent {
  return {
    id: `hand-sensor-${n}`,
    kind: 'vl53l4cd',
    name: `Sensor de mano ${n} · VL53L4CD`,
    short: `Mano ${n}`,
    group: 'sensores',
    bomId: 'hand-sensor',
    step: 6,
    pins: [
      { id: 'GND', label: 'GND' },
      { id: '3V3', label: '3V3', what: 'Alimentación de 3,3 V' },
      { id: 'SDA', label: 'SDA', what: 'Datos del bus I2C' },
      { id: 'SCL', label: 'SCL', what: 'Reloj del bus I2C' },
      { id: 'INT', label: 'INT', what: 'Libre' },
      { id: 'XSHUT', label: 'SHUT', what: n === 2 ? 'Apagado (XSHUT): al GPIO4' : 'Libre: la placa lo mantiene encendido' },
    ],
    data: [
      ['Qué mide', 'Distancia a la mano con un láser infrarrojo: de 1 mm a 1,2 m'],
      ['Alimentación', 'Solo 3,3 V (la placa no trae regulador), unos 20 mA'],
      ['Bus', 'I2C, dirección 0x29 al encender. La placa ya trae las resistencias del bus'],
      ['Dos sensores', n === 2 ? 'Los dos nacen en 0x29. Al arrancar, el ESP32 apaga este por XSHUT, le cambia la dirección al otro a 0x2A y lo vuelve a encender' : 'Los dos nacen en 0x29. Al arrancar, el ESP32 apaga el otro por XSHUT y a este le cambia la dirección a 0x2A'],
      ['En banco', 'Sirve igual el VL53L0X (GY-VL53L0XV2): VIN en vez de 3V3 y las mismas cuatro conexiones. Su XSHUT es de 2,8 V: el programa solo lo baja a tierra o lo suelta'],
    ],
    setup: ['Si la placa llegó sin pines, suelda la tira de seis.', 'Quita la película protectora del sensor, si la trae.'],
  };
}

export const COMPONENTS: ElecComponent[] = [
  {
    id: 'ac',
    kind: 'ac',
    name: 'Cable de alimentación AC',
    short: 'Cable AC',
    group: 'potencia',
    bomId: 'ac-cable',
    step: 1,
    pins: [
      { id: 'L', label: 'fase', what: 'Hilo café o negro' },
      { id: 'N', label: 'neutro', what: 'Hilo azul o blanco' },
      { id: 'PE', label: 'tierra', what: 'Hilo verde, o verde con amarillo' },
    ],
    data: [
      ['Voltaje', '127 V de alterna'],
      ['Preparación', 'Se corta el conector C13 y se pelan 8 mm de cada hilo'],
    ],
    warn: ['Siempre desenchufado mientras se toca cualquier cable.'],
  },
  {
    id: 'psu',
    kind: 'psu',
    name: 'Fuente Mean Well LRS-150F-24',
    short: 'Fuente',
    group: 'potencia',
    bomId: 'psu-24v-5a',
    step: 1,
    pins: [
      { id: 'L', label: 'L', what: 'Fase' },
      { id: 'N', label: 'N', what: 'Neutro' },
      { id: 'PE', label: '⏚', what: 'Tierra física' },
      { id: '-V1', label: '−V', what: 'Tierra de 24 V: a los dos drivers' },
      { id: '-V2', label: '−V', what: 'Tierra de 24 V: al regulador de 5 V y a la protoboard' },
      { id: '+V1', label: '+V', what: '24 V: a los dos drivers' },
      { id: '+V2', label: '+V', what: '24 V: al regulador de 5 V y al fusible' },
    ],
    internal: [
      ['-V1', '-V2'],
      ['+V1', '+V2'],
    ],
    data: [
      ['Entrada', '100 a 240 V de alterna, automática: no tiene selector'],
      ['Salida', '24 V · 6,5 A (156 W)'],
      ['Al encender', 'Tarda medio segundo en arrancar y sube en unos 30 ms'],
      ['Ajuste', 'De 21,6 a 28,8 V con el potenciómetro +V ADJ, junto a los bornes'],
      ['Lo que toma la mesa', 'Menos de 3 A: cada motor menos de 1 A, y el LED y la lógica casi nada'],
      ['Bornes', 'Dos +V y dos −V, unidos por dentro: dos cables por tornillo'],
    ],
    warn: ['En L y N hay 127 V: no se tocan con la fuente enchufada. La tapa de los bornes, puesta.'],
  },
  {
    id: 'fuse',
    kind: 'fuse',
    name: 'Portafusible con fusible de 500 mA',
    short: 'Fusible',
    group: 'potencia',
    bomId: 'led-fuse',
    step: 2,
    pins: pins('in', 'out'),
    data: [
      ['Para qué', 'Protege el lado del LED: si el MOSFET se queda conduciendo, corta antes de quemar el LED y la resistencia'],
      ['Tipo', '500 mA, de fusión rápida, de 5 × 20 mm'],
      ['Corriente normal', 'Unos 10 mA en promedio: los picos los entregan los capacitores'],
      ['Ojo', 'Al enchufar, la fuente sube en unos 30 ms y los tres capacitores toman cerca de 2,4 A mientras se cargan: queda al 80 % de lo que funde un fusible rápido de 500 mA. Puede fundirse sin que haya falla, a la primera o después de varios encendidos. Si pasa, se cambia por uno lento'],
      ['Nunca', 'Conectar el riel de potencia con la fuente ya encendida: los capacitores se cargan de golpe y el fusible se funde'],
    ],
  },
  {
    id: 'buck-5v',
    kind: 'lm2596',
    name: 'Regulador LM2596 a 5 V',
    short: 'Regulador 5 V',
    group: 'potencia',
    bomId: 'buck-lm2596',
    step: 2,
    pins: pins('IN+', 'IN-', 'OUT+', 'OUT-'),
    internal: [['IN-', 'OUT-']],
    data: [
      ['Para qué', 'Baja 24 V a 5 V para las entradas de los drivers y, sin USB, para el ESP32'],
      ['Entrada', '4,5 a 40 V'],
      ['Salida', 'Ajustable de 1,25 a 30 V, hasta 3 A'],
      ['Tierra', 'IN− y OUT− están unidos por dentro'],
    ],
    setup: ['Se ajusta sin nada conectado a la salida: girar el tornillo del potenciómetro azul hasta leer 5,0 V. Da unas 25 vueltas.', 'Marcarlo «5 V».'],
    warn: ['Llega ajustado a cualquier voltaje: no se conecta su salida hasta medirla.'],
  },
  {
    id: 'buck-12v',
    kind: 'lm2596',
    name: 'Regulador LM2596 a 12 V',
    short: 'Regulador 12 V',
    group: 'potencia',
    bomId: 'buck-lm2596',
    step: 2,
    pins: pins('IN+', 'IN-', 'OUT+', 'OUT-'),
    internal: [['IN-', 'OUT-']],
    data: [
      ['Para qué', 'Da 12 V al IR2101, que con ellos abre de golpe la compuerta del MOSFET'],
      ['Entrada', 'Toma los 24 V del riel de potencia, después del fusible'],
      ['Salida', 'Ajustable de 1,25 a 30 V; aquí 12 V y unos pocos mA'],
      ['Tierra', 'IN− y OUT− están unidos por dentro'],
    ],
    setup: ['Se ajusta sin nada conectado a la salida, a 12,0 V.', 'Marcarlo «12 V».'],
    warn: ['Si se confunde con el de 5 V, el riel de lógica recibe 12 V: por eso se marcan.'],
  },
  {
    id: 'breadboard',
    kind: 'breadboard',
    name: 'Protoboard de 830 puntos',
    short: 'Protoboard',
    group: 'control',
    bomId: 'breadboard-kit',
    step: 2,
    pins: [],
    data: [
      ['Tiras', 'Cada columna une sus cinco agujeros a–e, y por separado los cinco f–j. El canal del centro las separa'],
      ['Rieles', 'Cuatro a lo largo. Lado j: rojo = 24 V con fusible, azul = tierra. Lado a: rojo = 5 V, azul = tierra'],
      ['Riel partido', 'Si la línea roja o azul se interrumpe a media tabla, cada mitad es un riel aparte. Todo está repartido para que no importe; dos puentes unen las tierras'],
      ['Límite', 'Alrededor de 1 A por contacto. El pulso del LED es de 3,6 A, pero dura menos de medio milisegundo'],
      ['Cable', 'Solo entran pines y alambre delgado: el 18 AWG, no'],
    ],
    setup: ['Guíate por las letras y los números impresos en tu protoboard, no por la orientación del dibujo.'],
  },
  {
    id: 'esp32',
    kind: 'esp32',
    name: 'ESP32 DevKitC V4',
    short: 'ESP32',
    group: 'control',
    bomId: 'esp32',
    step: 3,
    pins: [...ESP32_J2, ...ESP32_J3].map((id) => ({ id, label: id.replace(/^GND\d$/, 'GND').replace(/^GPIO/, 'IO') })),
    data: [
      ['Lógica', '3,3 V. Ningún pin aguanta 5 V'],
      ['Alimentación en las pruebas', 'Por USB, desde la computadora'],
      ['Sin computadora', '5 V del regulador al pin 5V, con el USB desconectado'],
      ['Motor 1', `GPIO${PINS.pul1} pasos · GPIO${PINS.dir1} sentido`],
      ['Motor 2', `GPIO${PINS.pul2} pasos · GPIO${PINS.dir2} sentido`],
      ['LED', `GPIO${PINS.led} al IR2101`],
      ['Marcas', `GPIO${PINS.mark}, que solo es entrada`],
      ['Bus I2C', `GPIO${PINS.sda} SDA · GPIO${PINS.scl} SCL`],
      ['Sensor de mano 2', `GPIO${PINS.xshut2} a su XSHUT`],
    ],
    setup: [
      'Suelto y volteado, con las patas hacia arriba y un jumper hembra en cada pin que se usa.',
      'Volteado, las dos filas quedan en espejo y no se ven los letreros: cuenta los pines desde la antena con el modelo.',
      'Con la placa de expansión de 38 pines no hace falta voltearlo: mismos nombres, en la fila S.',
    ],
    warn: ['USB y pin 5V a la vez, no.', 'Un cable de 5, 12 o 24 V en un GPIO lo quema: revisa dos veces antes de enchufar.'],
  },
  dm542(1),
  motor(1),
  npn(0, 11, 'PUL del motor 1'),
  resistor('r1', '1 kΩ', 'd8', 'd12', 4, 'Limita la corriente de base de Q1'),
  npn(1, 18, 'DIR del motor 1'),
  resistor('r2', '1 kΩ', 'd15', 'd19', 4, 'Limita la corriente de base de Q2'),
  dm542(2),
  motor(2),
  npn(2, 25, 'PUL del motor 2'),
  resistor('r3', '1 kΩ', 'd22', 'd26', 5, 'Limita la corriente de base de Q3'),
  npn(3, 32, 'DIR del motor 2'),
  resistor('r4', '1 kΩ', 'd29', 'd33', 5, 'Limita la corriente de base de Q4'),
  tof(1),
  tof(2),
  {
    id: 'as5600',
    kind: 'as5600',
    name: 'Encoder magnético AS5600',
    short: 'AS5600',
    group: 'sensores',
    bomId: 'as5600',
    step: 6,
    pins: [
      { id: 'VCC', label: 'VCC', what: 'Alimentación de 3,3 V' },
      { id: 'GND', label: 'GND' },
      { id: 'SDA', label: 'SDA', what: 'Datos del bus I2C' },
      { id: 'SCL', label: 'SCL', what: 'Reloj del bus I2C' },
      { id: 'DIR', label: 'DIR', what: 'A tierra: el ángulo crece girando en el sentido del reloj' },
      { id: 'OUT', label: 'OUT', what: 'Libre' },
      { id: 'GPO', label: 'GPO', what: 'Libre' },
    ],
    data: [
      ['Qué mide', 'El ángulo del brazo tensor, con el imán del extremo de su eje a 1 o 2 mm del chip'],
      ['Resolución', '12 bits: 4096 pasos por vuelta, 0,09° cada uno'],
      ['Alimentación', '3,3 V, como viene armada. A 5 V no: habría que quitarle una resistencia (R1)'],
      ['Bus', 'I2C, dirección fija 0x36'],
    ],
    setup: ['Si la placa llegó sin pines, suelda la tira.', 'El orden de los pines cambia según la placa: guíate por sus letreros.'],
  },
  {
    id: 'sensor',
    kind: 'f249',
    name: 'Sensor de marcas F249',
    short: 'F249',
    group: 'sensores',
    bomId: 'sensor-f249',
    step: 7,
    pins: [
      { id: 'VCC', label: 'VCC', what: 'Alimentación: 3,3 V, no 5 V' },
      { id: 'GND', label: 'GND' },
      { id: 'DO', label: 'DO', what: 'Salida: en alto con el haz tapado y en bajo con la ranura libre' },
    ],
    data: [
      ['Qué hace', 'Una horquilla con un haz infrarrojo: la marca negra de cada fotograma lo interrumpe y dispara el destello'],
      ['Alimentación', 'Funciona de 3,3 a 5 V; aquí a 3,3 V'],
      ['Por qué 3,3 V', 'Su salida sube hasta el voltaje con que se alimenta, y los pines del ESP32 no aguantan 5 V'],
      ['Ranura', '5 mm'],
      ['Cuarto pin', 'Si trae AO, queda libre'],
    ],
    setup: ['Probarlo con la tinta de la película real: muchas tintas dejan pasar el infrarrojo.'],
  },
  {
    id: 'ir2101',
    kind: 'ir2101',
    name: 'Driver de compuerta IR2101',
    short: 'IR2101',
    group: 'protoboard',
    bomId: 'led-gate-driver',
    step: 8,
    pins: [
      { id: 'VCC', label: '1 VCC', what: '12 V' },
      { id: 'HIN', label: '2 HIN', what: 'Entrada del canal alto, sin usar: a tierra' },
      { id: 'LIN', label: '3 LIN', what: 'Entrada: del GPIO27' },
      { id: 'COM', label: '4 COM', what: 'Tierra' },
      { id: 'LO', label: '5 LO', what: 'Salida: a la compuerta, por 10 Ω' },
      { id: 'VS', label: '6 VS', what: 'Libre' },
      { id: 'HO', label: '7 HO', what: 'Libre' },
      { id: 'VB', label: '8 VB', what: 'Libre' },
    ],
    mount: { VCC: 'bb:e40', HIN: 'bb:e41', LIN: 'bb:e42', COM: 'bb:e43', LO: 'bb:f43', VS: 'bb:f42', HO: 'bb:f41', VB: 'bb:f40' },
    orient: 'A caballo sobre el canal, con la muesca hacia la columna 40. El pin 1 queda en e40.',
    data: [
      ['Para qué', 'Convierte los 3,3 V del ESP32 en 12 V con flancos rápidos para la compuerta del MOSFET'],
      ['Alimentación', '10 a 20 V; aquí 12 V'],
      ['Entrada', 'LIN en alto enciende LO. Su hoja de datos la da por compatible con 3,3 V: reconoce el alto desde 3 V'],
      ['Salida', 'Entrega 130 mA y absorbe 270 mA'],
      ['Canal alto', 'No se usa: HIN a tierra y los pines 6, 7 y 8 libres'],
    ],
    warn: ['Al revés recibe 12 V donde no debe: revisa la muesca.'],
  },
  {
    id: 'c100n',
    kind: 'ceramic',
    name: 'C1 · capacitor cerámico de 100 nF',
    short: 'C1 100 nF',
    group: 'protoboard',
    bomId: 'ceramic-caps',
    step: 8,
    value: '100 nF',
    pins: pins('a', 'b'),
    mount: { a: 'bb:b40', b: 'bb:b39' },
    orient: 'Sin polaridad. Si sus patas vienen a 5 mm, se cierran un poco.',
    data: [
      ['Para qué', 'Desacoplo del IR2101, pegado a su pin 1'],
      ['Marcado', '104'],
    ],
  },
  {
    id: 'c10u',
    kind: 'cap-small',
    name: 'C2 · capacitor electrolítico de 10 µF',
    short: 'C2 10 µF',
    group: 'protoboard',
    bomId: 'ceramic-caps',
    step: 8,
    value: '10 µF',
    pins: [
      { id: '+', label: '+', what: 'Pata larga' },
      { id: '-', label: '−', what: 'Lado de la franja' },
    ],
    mount: { '+': 'bb:d40', '-': 'bb:d39' },
    orient: 'La pata larga (+) en d40 y la de la franja (−) en d39.',
    data: [
      ['Para qué', 'Reserva de 12 V junto al IR2101'],
      ['Voltaje', '50 V'],
    ],
    warn: ['Tiene polaridad.'],
  },
  resistor('r6', '10 kΩ', 'c42', 'c46', 8, 'Mantiene LIN en bajo, y el LED apagado, mientras el ESP32 arranca'),
  resistor('r5', '10 Ω', 'j43', 'j47', 8, 'Amortigua el flanco entre el IR2101 y la compuerta'),
  {
    id: 'irlz44n',
    kind: 'irlz44n',
    name: 'MOSFET IRLZ44N',
    short: 'MOSFET',
    group: 'protoboard',
    bomId: 'led-mosfet',
    step: 8,
    pins: [
      { id: 'G', label: 'G', what: 'Compuerta: del IR2101, por 10 Ω' },
      { id: 'D', label: 'D', what: 'Drenador: del − del LED' },
      { id: 'S', label: 'S', what: 'Fuente: a tierra' },
    ],
    mount: { G: 'bb:g47', D: 'bb:g48', S: 'bb:g49' },
    orient: 'Las letras hacia la fila a y la aleta metálica hacia la fila j. Así, de izquierda a derecha, sus patas son G, D y S.',
    data: [
      ['Para qué', 'Es el interruptor del destello: cierra el circuito del LED a tierra'],
      ['Límites', '55 V · 47 A'],
      ['Resistencia', '22 mΩ con 10 V o más en la compuerta: no se calienta'],
      ['Aleta', 'Está unida al drenador: que no toque nada'],
    ],
  },
  resistor('r7', '10 kΩ', 'i47', 'i51', 8, 'Descarga la compuerta: si algo se suelta, el MOSFET queda apagado'),
  ...[9, 16, 23].map(
    (col, k): ElecComponent => ({
      id: `cap-${k + 1}`,
      kind: 'cap1000',
      name: `C${k + 3} · capacitor de 1000 µF 50 V`,
      short: `C${k + 3} 1000 µF`,
      group: 'led',
      bomId: 'led-caps',
      step: 9,
      value: '1000 µF',
      pins: [
        { id: '+', label: '+', what: 'Pata larga' },
        { id: '-', label: '−', what: 'Lado de la franja blanca' },
      ],
      mount: { '+': `bb:+j${col}`, '-': `bb:-j${col}` },
      orient: 'Directo en el riel de potencia: la pata larga (+) en el rojo y la de la franja (−) en el azul.',
      data: [
        ['Para qué', 'Los tres juntos (3000 µF) entregan el pico del destello; la fuente solo repone el promedio'],
        ['Voltaje', '50 V: el doble de lo que reciben'],
        ['Carga', 'Quedan cargados unos segundos después de desenchufar'],
      ],
      warn: ['Al revés, revienta.'],
    }),
  ),
  {
    id: 'led-resistor',
    kind: 'res10w',
    name: 'Resistencia de 3,3 Ω 10 W',
    short: 'R 3,3 Ω',
    group: 'led',
    bomId: 'led-resistor',
    step: 9,
    value: '3,3 Ω',
    pins: pins('a', 'b'),
    data: [
      ['Para qué', 'Limita el pulso del LED: (24 V − unos 12 V) / 3,3 Ω ≈ 3,6 A'],
      ['Potencia', '10 W. En promedio disipa menos de 0,2 W: no se calienta'],
      ['Conexión', 'No entra en la protoboard: cable soldado a sus dos terminales'],
    ],
  },
  {
    id: 'led',
    kind: 'led10',
    name: 'LED blanco frío de 10 W',
    short: 'LED',
    group: 'led',
    bomId: 'led-10w',
    step: 9,
    pins: [
      { id: '+', label: '+', what: 'Ánodo: de la resistencia' },
      { id: '-', label: '−', what: 'Cátodo: al drenador del MOSFET' },
    ],
    data: [
      ['Nominal', '9 a 12 V · 900 mA'],
      ['Aquí', 'Pulsos de unos 3,6 A que duran de 0,1 a 0,5 ms: cuatro veces su corriente, por muy poco tiempo'],
      ['Promedio', 'Encendido el 0,3 % del tiempo'],
      ['Polaridad', 'El + viene marcado en la base'],
    ],
    setup: ['Va sobre su disipador. Suelda un cable rojo al pad + y uno negro al pad −.'],
    warn: ['No se mira de frente: apúntalo a la pared.', 'Si se queda encendido fijo, desenchufa de inmediato.'],
  },
];

// --- cables ------------------------------------------------------------------------------------------------------------
const w = (id: string, from: string, to: string, color: WireColor, cable: CableKind, step: number, note?: string): Wire => ({ id, from, to, color, cable, step, note });

function motorWires(n: 1 | 2): Wire[] {
  const s = n === 1 ? 4 : 5;
  const d = `dm542-${n}`;
  const q = n === 1 ? [0, 1] : [2, 3];
  const cols = n === 1 ? { pulG: 8, dirG: 15, pulE: 11, dirE: 18, pulC: 13, dirC: 20, pul5: 9, dir5: 10 } : { pulG: 22, dirG: 29, pulE: 25, dirE: 32, pulC: 27, dirC: 34, pul5: 21, dir5: 22 };
  const pul = n === 1 ? PINS.pul1 : PINS.pul2;
  const dir = n === 1 ? PINS.dir1 : PINS.dir2;
  return [
    w(`m${n}-24`, 'psu.+V1', `${d}.+V`, 'rojo', 'awg18', s),
    w(`m${n}-gnd`, 'psu.-V1', `${d}.GND`, 'negro', 'awg18', s),
    w(`m${n}-a+`, `motor-${n}.A+`, `${d}.A+`, 'negro', 'motor', s),
    w(`m${n}-a-`, `motor-${n}.A-`, `${d}.A-`, 'verde', 'motor', s),
    w(`m${n}-b+`, `motor-${n}.B+`, `${d}.B+`, 'rojo', 'motor', s),
    w(`m${n}-b-`, `motor-${n}.B-`, `${d}.B-`, 'azul', 'motor', s),
    w(`pul${n}-gpio`, `esp32.GPIO${pul}`, `bb:a${cols.pulG}`, 'verde', 'hm', s, `Pasos del motor ${n}: llega a R${q[0] + 1}`),
    w(`dir${n}-gpio`, `esp32.GPIO${dir}`, `bb:a${cols.dirG}`, 'azul', 'hm', s, `Sentido del motor ${n}: llega a R${q[1] + 1}`),
    w(`q${q[0] + 1}-e`, `bb:a${cols.pulE}`, `bb:-a${cols.pulE}`, 'negro', 'mm', s, `Emisor de Q${q[0] + 1} a tierra`),
    w(`q${q[1] + 1}-e`, `bb:a${cols.dirE}`, `bb:-a${n === 1 ? cols.dirE : 30}`, 'negro', 'mm', s, `Emisor de Q${q[1] + 1} a tierra`),
    w(`pul${n}-c`, `bb:e${cols.pulC}`, `${d}.PUL-`, 'verde', 'mm', s, `Colector de Q${q[0] + 1}`),
    w(`dir${n}-c`, `bb:e${cols.dirC}`, `${d}.DIR-`, 'azul', 'mm', s, `Colector de Q${q[1] + 1}`),
    w(`pul${n}-5`, `bb:+a${cols.pul5}`, `${d}.PUL+`, 'naranja', 'mm', s),
    w(`dir${n}-5`, `bb:+a${cols.dir5}`, `${d}.DIR+`, 'naranja', 'mm', s),
  ];
}

function busWires(id: string, comp: string, vcc: string, row: string, gndCol: number): Wire[] {
  return [
    w(`${id}-3v3`, `${comp}.${vcc}`, `bb:${row}1`, 'rosa', 'hm', 6),
    w(`${id}-gnd`, `${comp}.GND`, `bb:-a${gndCol}`, 'negro', 'hm', 6),
    w(`${id}-sda`, `${comp}.SDA`, `bb:${row}3`, 'cafe', 'hm', 6),
    w(`${id}-scl`, `${comp}.SCL`, `bb:${row}5`, 'gris', 'hm', 6),
  ];
}

export const WIRES: Wire[] = [
  // 1 · fuente
  w('ac-l', 'ac.L', 'psu.L', 'cafe', 'ac', 1, 'Fase'),
  w('ac-n', 'ac.N', 'psu.N', 'celeste', 'ac', 1, 'Neutro'),
  w('ac-pe', 'ac.PE', 'psu.PE', 'verde', 'ac', 1, 'Tierra física'),
  // 2 · 24 V a la protoboard y a los reguladores
  w('24-fuse', 'psu.+V2', 'fuse.in', 'rojo', 'awg18', 2),
  w('fuse-rail', 'fuse.out', 'bb:+j27', 'rojo', 'tip', 2, '24 V con fusible al riel de potencia'),
  w('gnd-rail', 'psu.-V2', 'bb:-j27', 'negro', 'tip', 2, 'Tierra al riel de potencia'),
  w('24-b5', 'psu.+V2', 'buck-5v.IN+', 'rojo', 'awg18', 2),
  w('gnd-b5', 'psu.-V2', 'buck-5v.IN-', 'negro', 'awg18', 2),
  w('24-b12', 'bb:+j29', 'buck-12v.IN+', 'rojo', 'tip', 2),
  w('gnd-b12', 'bb:-j29', 'buck-12v.IN-', 'negro', 'tip', 2),
  // 3 · rieles de lógica, tierras y ESP32
  w('5-rail', 'buck-5v.OUT+', 'bb:+a3', 'naranja', 'tip', 3, '5 V al riel de lógica'),
  w('5-gnd', 'buck-5v.OUT-', 'bb:-a3', 'negro', 'tip', 3, 'Tierra al riel de lógica'),
  w('gnd-tie', 'bb:-a5', 'bb:-j5', 'negro', 'mm', 3, 'Puente de tierras: une la de lógica con la de potencia'),
  w('gnd-bridge', 'bb:-a31', 'bb:-a33', 'negro', 'mm', 3, 'Une las dos mitades del riel azul del lado a'),
  w('esp-gnd', 'esp32.GND1', 'bb:-a7', 'negro', 'hm', 3, 'Tierra del ESP32: el GND que está entre IO12 e IO13'),
  w('esp-3v3', 'esp32.3V3', 'bb:a1', 'rosa', 'hm', 3, 'La columna 1 reparte 3,3 V a los sensores'),
  // 4 y 5 · motores
  ...motorWires(1),
  ...motorWires(2),
  // 6 · bus I2C
  w('sda', `esp32.GPIO${PINS.sda}`, 'bb:a3', 'cafe', 'hm', 6, 'La columna 3 reparte SDA'),
  w('scl', `esp32.GPIO${PINS.scl}`, 'bb:a5', 'gris', 'hm', 6, 'La columna 5 reparte SCL'),
  ...busWires('mano1', 'hand-sensor-1', '3V3', 'b', 4),
  ...busWires('mano2', 'hand-sensor-2', '3V3', 'c', 6),
  w('mano2-xshut', 'hand-sensor-2.XSHUT', `esp32.GPIO${PINS.xshut2}`, 'turquesa', 'hh', 6, 'Apaga el sensor 2 un instante al arrancar'),
  ...busWires('enc', 'as5600', 'VCC', 'd', 9),
  w('enc-dir', 'as5600.DIR', 'bb:-a10', 'negro', 'hm', 6),
  // 7 · sensor de marcas
  w('marca-3v3', 'sensor.VCC', 'bb:e1', 'rosa', 'hm', 7, 'A 3,3 V, no a 5 V'),
  w('marca-gnd', 'sensor.GND', 'bb:-a12', 'negro', 'hm', 7),
  w('marca-do', 'sensor.DO', `esp32.GPIO${PINS.mark}`, 'blanco', 'hh', 7),
  // 8 · driver del LED
  w('12-vcc', 'buck-12v.OUT+', 'bb:a40', 'morado', 'tip', 8, '12 V al pin 1 del IR2101'),
  w('12-gnd', 'buck-12v.OUT-', 'bb:-a35', 'negro', 'tip', 8),
  w('gnd-c', 'bb:a39', 'bb:-a39', 'negro', 'mm', 8, 'Tierra de los dos capacitores del IR2101'),
  w('hin-gnd', 'bb:a41', 'bb:-a41', 'negro', 'mm', 8, 'HIN a tierra'),
  w('lin', `esp32.GPIO${PINS.led}`, 'bb:a42', 'blanco', 'hm', 8, 'La orden del destello'),
  w('com-gnd', 'bb:a43', 'bb:-a43', 'negro', 'mm', 8, 'COM a tierra'),
  w('r6-gnd', 'bb:a46', 'bb:-a46', 'negro', 'mm', 8, 'El otro extremo de R6 a tierra'),
  w('fet-s', 'bb:j49', 'bb:-j31', 'negro', 'mm', 8, 'Fuente del MOSFET a la tierra de potencia'),
  w('r7-gnd', 'bb:j51', 'bb:-j30', 'negro', 'mm', 8, 'El otro extremo de R7 a tierra'),
  // 9 · capacitores y LED
  w('led-r', 'bb:+j31', 'led-resistor.a', 'rojo', 'tip', 9, '24 V con fusible a la resistencia'),
  w('led-a', 'led-resistor.b', 'led.+', 'rojo', 'awg18', 9),
  w('led-k', 'led.-', 'bb:j48', 'negro', 'tip', 9, 'Del − del LED al drenador del MOSFET'),
  // 10 · sin USB
  w('esp-5v', 'bb:+a7', 'esp32.5V', 'naranja', 'hm', 10, 'Solo con el USB desconectado'),
];

// --- esquema: qué pines deben quedar unidos -----------------------------------------------------------------------------
const each = (ids: string[], pin: string) => ids.map((c) => `${c}.${pin}`);
const coil = (n: number): NetSpec[] => ['A+', 'A-', 'B+', 'B-'].map((p) => ({ id: `m${n}${p}`, label: `Bobina ${p.replace('-', '−')} del motor ${n}`, kind: 'coil' as NetKind, level: 'Corriente del motor: hasta 1,9 A', pins: [`motor-${n}.${p}`, `dm542-${n}.${p}`] }));
const shifter = (k: number, gpio: number, what: 'PUL' | 'DIR', n: number): NetSpec[] => [
  { id: `${what.toLowerCase()}${n}`, label: `${what === 'PUL' ? 'Pasos' : 'Sentido'} del motor ${n}`, kind: 'signal', level: `3,3 V o 0 V, del GPIO${gpio}`, pins: [`esp32.GPIO${gpio}`, `r${k + 1}.a`] },
  { id: `${what.toLowerCase()}${n}-b`, label: `Base de Q${k + 1}`, kind: 'signal', level: '0,7 V con el GPIO en alto', pins: [`r${k + 1}.b`, `npn-${k}.B`] },
  { id: `${what.toLowerCase()}${n}-c`, label: `${what}− del driver ${n}`, kind: 'signal', level: 'Casi 0 V con el GPIO en alto; unos 4 V en bajo', pins: [`npn-${k}.C`, `dm542-${n}.${what}-`] },
];

export const NETS: NetSpec[] = [
  { id: 'fase', label: 'Fase', kind: 'mains', level: '127 V de alterna', pins: ['ac.L', 'psu.L'] },
  { id: 'neutro', label: 'Neutro', kind: 'mains', level: '127 V de alterna contra la fase', pins: ['ac.N', 'psu.N'] },
  { id: 'tierra-fisica', label: 'Tierra física', kind: 'mains', level: 'El chasis de la fuente', pins: ['ac.PE', 'psu.PE'] },
  { id: 'v24', label: '+24 V', kind: 'v24', level: '24 V', pins: ['psu.+V1', 'psu.+V2', 'dm542-1.+V', 'dm542-2.+V', 'buck-5v.IN+', 'fuse.in'] },
  { id: 'v24f', label: '+24 V con fusible', kind: 'v24', level: '24 V', pins: ['fuse.out', 'buck-12v.IN+', 'cap-1.+', 'cap-2.+', 'cap-3.+', 'led-resistor.a'] },
  { id: 'led-a', label: 'Ánodo del LED', kind: 'pulse', level: '24 V en reposo', pins: ['led-resistor.b', 'led.+'] },
  { id: 'led-k', label: 'Cátodo del LED', kind: 'pulse', level: 'Sube hacia 24 V en reposo; 0 V durante el destello', pins: ['led.-', 'irlz44n.D'] },
  {
    id: 'gnd',
    label: 'Tierra (GND)',
    kind: 'gnd',
    level: '0 V: contra ella se mide todo',
    pins: [
      'psu.-V1', 'psu.-V2', 'dm542-1.GND', 'dm542-2.GND', 'buck-5v.IN-', 'buck-5v.OUT-', 'buck-12v.IN-', 'buck-12v.OUT-', 'cap-1.-', 'cap-2.-', 'cap-3.-', 'irlz44n.S', 'ir2101.COM', 'ir2101.HIN',
      ...each(['npn-0', 'npn-1', 'npn-2', 'npn-3'], 'E'), 'r6.b', 'r7.b', 'c100n.b', 'c10u.-', 'esp32.GND1', ...each(['hand-sensor-1', 'hand-sensor-2', 'as5600', 'sensor'], 'GND'), 'as5600.DIR',
    ],
  },
  { id: 'v5', label: '+5 V', kind: 'v5', level: '5,0 V', pins: ['buck-5v.OUT+', 'dm542-1.PUL+', 'dm542-1.DIR+', 'dm542-2.PUL+', 'dm542-2.DIR+', 'esp32.5V'], final: true },
  { id: 'v12', label: '+12 V', kind: 'v12', level: '12,0 V', pins: ['buck-12v.OUT+', 'ir2101.VCC', 'c100n.a', 'c10u.+'] },
  { id: 'v33', label: '+3,3 V', kind: 'v33', level: '3,3 V, del ESP32', pins: ['esp32.3V3', 'hand-sensor-1.3V3', 'hand-sensor-2.3V3', 'as5600.VCC', 'sensor.VCC'] },
  { id: 'sda', label: 'SDA (I2C)', kind: 'i2c', level: '3,3 V en reposo', pins: [`esp32.GPIO${PINS.sda}`, 'hand-sensor-1.SDA', 'hand-sensor-2.SDA', 'as5600.SDA'] },
  { id: 'scl', label: 'SCL (I2C)', kind: 'i2c', level: '3,3 V en reposo', pins: [`esp32.GPIO${PINS.scl}`, 'hand-sensor-1.SCL', 'hand-sensor-2.SCL', 'as5600.SCL'] },
  { id: 'xshut2', label: 'Apagado del sensor de mano 2', kind: 'signal', level: '0 V apagado; suelto, encendido', pins: [`esp32.GPIO${PINS.xshut2}`, 'hand-sensor-2.XSHUT'] },
  { id: 'marca', label: 'Marca de sincronía', kind: 'signal', level: '0 V o 3,3 V según haya marca', pins: [`esp32.GPIO${PINS.mark}`, 'sensor.DO'] },
  ...shifter(0, PINS.pul1, 'PUL', 1),
  ...shifter(1, PINS.dir1, 'DIR', 1),
  ...shifter(2, PINS.pul2, 'PUL', 2),
  ...shifter(3, PINS.dir2, 'DIR', 2),
  { id: 'lin', label: 'Orden del destello', kind: 'signal', level: '0 V en reposo; 3,3 V durante el destello', pins: [`esp32.GPIO${PINS.led}`, 'ir2101.LIN', 'r6.a'] },
  { id: 'lo', label: 'Salida del IR2101', kind: 'signal', level: '0 V en reposo; 12 V durante el destello', pins: ['ir2101.LO', 'r5.a'] },
  { id: 'gate', label: 'Compuerta del MOSFET', kind: 'signal', level: '0 V en reposo; 12 V durante el destello', pins: ['r5.b', 'irlz44n.G', 'r7.a'] },
  ...coil(1),
  ...coil(2),
];

// --- pasos -------------------------------------------------------------------------------------------------------------
export const STEPS: WiringStep[] = [
  {
    n: 1,
    title: 'Fuente de 24 V, sola',
    goal: 'Confirmar que la fuente da 24 V antes de conectarle nada.',
    power: 'fuente',
    todo: [
      'Con el cable desenchufado, corta el conector C13 y pela 8 mm de cada hilo. Identifica los tres: fase (café o negro), neutro (azul o blanco) y tierra (verde, o verde con amarillo).',
      'Atornilla la fase en L, el neutro en N y la tierra en ⏚. Que no quede cobre a la vista, y vuelve a poner la tapa de los bornes.',
    ],
    test: [
      { do: 'Enchufa. Con el multímetro en voltaje de continua, mide entre un borne +V y un borne −V.', expect: '24,0 V (de 23,5 a 24,5). Si no, gira el potenciómetro +V ADJ, junto a los bornes.' },
      { do: 'Desenchufa y espera a que se apague el LED verde de la fuente.', expect: 'De aquí en adelante, todo se cablea con la fuente desenchufada.' },
    ],
    warn: ['En L y N hay 127 V: con la fuente enchufada no se tocan los bornes.'],
  },
  {
    n: 2,
    title: '24 V a la protoboard y reguladores',
    goal: 'Llevar los 24 V al riel de potencia, pasando por el fusible, y dejar un regulador en 5 V y otro en 12 V antes de que alimenten algo.',
    power: 'fuente',
    todo: [
      'El cable de 18 AWG no entra en la protoboard. Cada punta que llega a ella termina en medio jumper macho-macho, soldado o torcido y con cinta: es el «cable con punta de pin».',
      'Suelda a cada regulador sus cables de entrada (IN+ e IN−) y de una vez los de salida (OUT+ y OUT−), que por ahora quedan sueltos y sin tocarse.',
      'El riel de potencia es el rojo y el azul del lado j, en la mitad de las columnas 3 a 31. Ahí va todo lo de 24 V.',
      'Dos cables por tornillo en la fuente: en un +V, el fusible y el regulador de 5 V; el otro +V queda para los drivers.',
    ],
    test: [
      { do: 'Enchufa. Mide entre el riel rojo y el azul del lado j.', expect: '24 V. Si da 0 V, revisa el fusible.' },
      { do: 'Mide entre OUT+ y OUT− de un regulador y gira el tornillo de su potenciómetro azul hasta leer 5,0 V. Márcalo «5 V».', expect: '5,0 V (de 4,9 a 5,1). El tornillo da unas 25 vueltas: si la lectura no cambia, sigue girando.' },
      { do: 'Lo mismo con el otro, a 12,0 V. Márcalo «12 V». Desenchufa.', expect: '12,0 V (de 11,5 a 12,5).' },
    ],
    warn: ['Los reguladores llegan ajustados a cualquier voltaje: su salida no se conecta hasta medirla.'],
  },
  {
    n: 3,
    title: 'Riel de 5 V, tierras y ESP32',
    goal: 'Alimentar el riel de lógica, unir las tierras y dejar el ESP32 hablando con la computadora.',
    power: 'ambas',
    todo: [
      'El riel de lógica es el rojo (5 V) y el azul (tierra) del lado a, en la mitad de las columnas 3 a 31.',
      'Dos puentes: uno del riel azul del lado a al riel azul del lado j, y otro que une las dos mitades del riel azul del lado a, de la columna 31 a la 33.',
      'El ESP32 va suelto y volteado, con las patas hacia arriba, y un jumper hembra en cada pin. Volteado no se ven los letreros: cuenta los pines desde la antena con el modelo.',
      'Conéctalo por USB a la computadora y carga el programa de prueba desde el IDE de Arduino, con la placa «ESP32 Dev Module». Abre el monitor serie a 115200.',
      'En las pruebas el ESP32 se alimenta por USB. Su pin 5V no se conecta hasta el paso 10.',
    ],
    test: [
      { do: 'En el monitor serie escribe ? y Enter.', expect: 'Responde con la lista de comandos.', cmd: '?' },
      { do: 'Mide entre la columna 1 (filas a–e) y el riel azul del lado a.', expect: '3,3 V.' },
      { do: 'Enchufa la fuente y mide entre el riel rojo y el azul del lado a. Desenchufa.', expect: '5,0 V.' },
    ],
    warn: ['USB y pin 5V a la vez, no.'],
  },
  {
    n: 4,
    title: 'Motor 1',
    goal: 'Girar el motor 1 con su driver: una vuelta para cada lado.',
    power: 'ambas',
    todo: [
      'Interruptores del DM542, con el driver apagado: SW1 ON, SW2 OFF, SW3 ON (1,91 A); SW4 OFF; SW5 ON, SW6 ON, SW7 OFF, SW8 ON (3200 pulsos por vuelta). Compáralo con la tabla impresa en el driver: si difiere, manda la suya.',
      'Si el driver trae un selector de 5 V / 24 V para las señales, ponlo en 5 V.',
      'Motor al driver: negro en A+, verde en A−, rojo en B+ y azul en B−. Antes, confirma los pares con el multímetro: entre los dos hilos de una bobina hay unos 1,8 Ω.',
      '24 V con cable de 18 AWG, de la fuente a +V y GND del driver.',
      'En la protoboard: R1 (1 kΩ) de d8 a d12 y Q1 en b11, b12 y b13, con la cara plana hacia la fila a. R2 de d15 a d19 y Q2 en b18, b19 y b20.',
      'ENA+ y ENA− quedan libres.',
      'Mete un tramo de varilla en el cople y pégale un trozo de cinta: así se ve girar.',
    ],
    test: [
      { do: 'Enchufa la fuente.', expect: 'Enciende el LED verde del driver y el eje se siente frenado al tratar de girarlo con los dedos.' },
      { do: 'En el monitor serie: 1', expect: 'El eje da una vuelta, se detiene y regresa.', cmd: '1' },
      { do: 'Ahora: 1 120', expect: 'Lo mismo a 120 rpm, sin zumbidos ni saltos. Desenchufa.', cmd: '1 120' },
    ],
    fail: [
      'No gira y el LED rojo del driver parpadea: una bobina cruzada o un cable flojo. Desenchufa y revisa los pares.',
      'Vibra sin avanzar: un hilo del motor no hace contacto, o los pasos no llegan (revisa Q1 y su cable a PUL−).',
      'Queda frenado y no se mueve nunca: el selector de señales del driver está en 24 V, o falta 5 V en PUL+.',
      'Gira, pero no cambia de sentido: revisa Q2 y su cable a DIR−.',
      'El sentido aquí no importa: se corrige en el programa.',
    ],
    warn: ['El motor no se conecta ni se desconecta con el driver encendido.'],
  },
  {
    n: 5,
    title: 'Motor 2',
    goal: 'Lo mismo con el segundo motor y su driver.',
    power: 'ambas',
    todo: [
      'Los mismos interruptores en el segundo DM542.',
      'Motor al driver con los mismos colores, y 24 V de los mismos bornes de la fuente que el primer driver.',
      'En la protoboard: R3 de d22 a d26 y Q3 en b25, b26 y b27. R4 de d29 a d33 y Q4 en b32, b33 y b34.',
      'El emisor de Q4 baja de a32 al riel azul en la columna 30: del lado izquierdo de la mitad.',
    ],
    test: [
      { do: 'Enchufa la fuente. En el monitor serie: 2', expect: 'El motor 2 da una vuelta, se detiene y regresa. El motor 1 no se mueve.', cmd: '2' },
      { do: 'Ahora: 1 y luego 2 120', expect: 'Cada comando mueve solo su motor. Desenchufa.', cmd: '2 120' },
    ],
    fail: ['Se mueve el motor equivocado: los cables de los GPIO o de los colectores están cruzados entre los dos drivers.'],
  },
  {
    n: 6,
    title: 'Sensores de mano y encoder',
    goal: 'Que el ESP32 vea en el bus I2C los dos sensores de distancia y el encoder del brazo tensor.',
    power: 'usb',
    todo: [
      'Tres columnas de la protoboard reparten el bus, en las filas a–e: la 1 es 3,3 V, la 3 es SDA y la 5 es SCL.',
      'Cada sensor lleva cuatro jumpers hembra-macho: 3,3 V a la columna 1, GND al riel azul del lado a, SDA a la columna 3 y SCL a la 5.',
      'El sensor de mano 2 lleva además su XSHUT al GPIO4, con un jumper hembra-hembra.',
      'El pin DIR del AS5600 va al riel azul.',
      'Basta el USB: la fuente puede quedar desenchufada.',
    ],
    test: [
      { do: 'En el monitor serie: i', expect: 'Encuentra 0x29 (los dos sensores de mano responden juntos) y 0x36 (el AS5600).', cmd: 'i' },
      { do: 'Ahora: d', expect: 'Sensor de mano 1 en 0x2A y sensor de mano 2 en 0x29: dos sensores, dos direcciones.', cmd: 'd' },
      { do: 'Ahora: a, y gira el imán a 1 o 2 mm sobre el chip.', expect: 'El ángulo cambia entre 0 y 360°.', cmd: 'a' },
    ],
    fail: [
      'No encuentra nada: SDA y SCL están cruzados, o falta 3,3 V o tierra.',
      'Con d solo aparece una dirección: el XSHUT del sensor 2 no llega al GPIO4, o está en el sensor 1.',
      'El ángulo no cambia: el imán está lejos, o no es diametral (los polos van a los lados, no arriba y abajo).',
    ],
  },
  {
    n: 7,
    title: 'Sensor de marcas',
    goal: 'Que el ESP32 vea pasar una marca por la horquilla.',
    power: 'usb',
    todo: [
      'VCC a la columna 1 (3,3 V) y GND al riel azul del lado a, con jumpers hembra-macho.',
      'DO directo al GPIO34, con un jumper hembra-hembra.',
      'Va a 3,3 V y no a 5 V: su salida sube hasta el voltaje con que se alimenta, y el ESP32 no aguanta 5 V.',
    ],
    test: [
      { do: 'En el monitor serie: s, y pasa una tarjeta por la ranura.', expect: 'Dice «tapado» con la tarjeta dentro y «libre» al sacarla, y cambia el LED de la plaquita.', cmd: 's' },
      { do: 'Pasa la orilla de una tira impresa con su marca negra.', expect: '«Tapado» al pasar la marca. Si no la ve, esa tinta deja pasar el infrarrojo: anótalo en un comentario.' },
    ],
    fail: ['No cambia nunca: VCC y GND invertidos, o DO en otro pin.', 'Dice «tapado» con la ranura libre: tu plaquita trabaja al revés. No es falla: anótalo, se invierte en el programa.'],
  },
  {
    n: 8,
    title: 'Driver del LED, sin LED',
    goal: 'Probar el IR2101 y el MOSFET antes de conectar el LED: un error aquí lo deja encendido fijo y lo quema.',
    power: 'ambas',
    todo: [
      'IR2101 a caballo sobre el canal, con la muesca hacia la columna 40: sus pines 1 a 4 en e40 a e43, y 8 a 5 en f40 a f43.',
      'C1 (100 nF) de b40 a b39. C2 (10 µF) con la pata larga en d40 y la de la franja en d39.',
      'R6 (10 kΩ) de c42 a c46: mantiene apagado el LED mientras el ESP32 arranca.',
      'R5 (10 Ω) de j43 a j47. MOSFET en g47, g48 y g49, con las letras hacia la fila a y la aleta hacia la fila j. R7 (10 kΩ) de i47 a i51.',
      'Los 12 V del regulador marcado «12 V» entran en a40, y su tierra en el riel azul del lado a.',
      'Los pines 6, 7 y 8 del IR2101 quedan libres.',
    ],
    test: [
      { do: 'Enchufa. Mide entre a40 y el riel azul del lado a.', expect: '12 V.' },
      { do: 'Mide entre la columna 47 (filas f–j, la compuerta) y el riel azul.', expect: '0 V.' },
      { do: 'En el monitor serie: g, y confirma con s. Sigue midiendo la compuerta.', expect: 'Sube a unos 12 V durante 3 segundos y vuelve a 0 V. Desenchufa.', cmd: 'g' },
    ],
    fail: [
      'La compuerta está siempre en 12 V: el IR2101 está al revés, o R6 no llega a tierra.',
      'No sube nunca: falta el cable del GPIO27 en a42, o no hay 12 V en a40.',
    ],
    warn: ['Este paso se prueba sin el LED y sin los capacitores grandes.'],
  },
  {
    n: 9,
    title: 'Capacitores y LED',
    goal: 'Dar el primer destello.',
    power: 'ambas',
    todo: [
      'Los tres capacitores de 1000 µF van directo en el riel de potencia (lado j), en las columnas 9, 16 y 23: la pata larga en el riel rojo y la de la franja blanca en el azul. Al revés, revientan.',
      'El LED, sobre su disipador. Suelda un cable rojo a su pad + y uno negro a su pad −.',
      'La resistencia de 3,3 Ω va en serie: del riel rojo del lado j a uno de sus extremos, y del otro extremo al + del LED.',
      'El − del LED entra en j48: la columna del drenador del MOSFET.',
    ],
    test: [
      { do: 'Apunta el LED a la pared y enchufa.', expect: 'El LED sigue apagado. Si enciende fijo, desenchufa de inmediato.' },
      { do: 'En el monitor serie: l', expect: 'Destellos de 100 µs, 24 por segundo, durante 3 segundos: se ven como una luz tenue y continua.', cmd: 'l' },
      { do: 'Ahora: l 400', expect: 'Más brillante. El programa no deja pasar de 500 µs. Desenchufa.', cmd: 'l 400' },
    ],
    fail: [
      'El fusible se funde justo al enchufar, sin nada mal conectado: es la carga de los tres capacitores, que lo deja al límite. Anótalo en un comentario; se cambia por un fusible lento.',
      'No destella: LED al revés, o su cable negro no está en la columna 48.',
    ],
    warn: ['No mires el LED de frente.', 'Enchufa siempre con todo ya conectado: nunca conectes el riel de potencia con la fuente encendida.', 'Los capacitores quedan cargados unos segundos después de desenchufar.'],
  },
  {
    n: 10,
    title: 'Todo junto, y sin USB',
    goal: 'Repetir las pruebas con todo conectado y dejar el ESP32 alimentado por la fuente.',
    power: 'ambas',
    todo: [
      'Con todo conectado y la fuente encendida, repite cada comando: 1, 2, d, a, s y l.',
      'Para trabajar sin computadora, primero desconecta el USB. Después lleva 5 V del riel rojo del lado a al pin 5V del ESP32.',
      'Cuando todo pase, la electrónica se fija al piso con las mismas conexiones: es el paso 3 del ensamble.',
    ],
    test: [
      { do: 'Repite 1, 2, d, a, s y l.', expect: 'Todo responde igual que por separado.' },
      { do: 'Sin USB y con el pin 5V conectado, enchufa la fuente.', expect: 'Enciende el LED rojo del ESP32. Los motores quedan frenados y el LED de 10 W, apagado.' },
    ],
    warn: ['USB y pin 5V a la vez, no: para volver a programar, primero quita el cable del pin 5V.'],
  },
];

// --- lectura -----------------------------------------------------------------------------------------------------------
export interface Wiring {
  components: ElecComponent[];
  wires: Wire[];
  nets: NetSpec[];
  steps: WiringStep[];
}
export const WIRING: Wiring = { components: COMPONENTS, wires: WIRES, nets: NETS, steps: STEPS };

export const componentById = (id: string, wr: Wiring = WIRING) => wr.components.find((c) => c.id === id);
export const wiresOfStep = (n: number, wr: Wiring = WIRING) => wr.wires.filter((x) => x.step === n);
export const componentsOfStep = (n: number, wr: Wiring = WIRING) => wr.components.filter((c) => c.step === n);

/** «DM542 1 · PUL−», «a12», «riel azul (−) lado a · col. 11» */
export function refText(ref: string, wr: Wiring = WIRING, long = false): string {
  if (ref.startsWith('bb:')) return long ? `Protoboard · ${holeText(ref, true)}` : holeText(ref);
  const [cid, pid] = splitRef(ref);
  const c = componentById(cid, wr);
  const p = c?.pins.find((x) => x.id === pid);
  return `${c?.short ?? cid} · ${p?.label ?? pid}`;
}

export function splitRef(ref: string): [string, string] {
  const i = ref.indexOf('.');
  return [ref.slice(0, i), ref.slice(i + 1)];
}

/** la red del esquema a la que pertenece un pin de componente */
export const netOfPin = (ref: string, wr: Wiring = WIRING) => wr.nets.find((n) => n.pins.includes(ref));

/** lo que hay en un agujero: la pata de un componente montado o la punta de un cable */
export function holeUsers(wr: Wiring = WIRING): Map<string, string[]> {
  const m = new Map<string, string[]>();
  const add = (hole: string, who: string) => m.set(hole, [...(m.get(hole) ?? []), who]);
  for (const c of wr.components) for (const [pin, hole] of Object.entries(c.mount ?? {})) add(hole, `${c.id}.${pin}`);
  for (const x of wr.wires) for (const end of [x.from, x.to]) if (end.startsWith('bb:')) add(end, `cable ${x.id}`);
  return m;
}

/**
 * Las redes que resultan del montaje: une los pines por los cables, por las tiras de la protoboard y por dentro de cada
 * pieza. `splitRails` trata cada riel como dos mitades sin unir. `upTo` solo cuenta lo que entra hasta ese paso.
 * Devuelve grupos de pines de componentes (sin agujeros), solo los de más de un pin.
 */
export function derivedNets(wr: Wiring = WIRING, splitRails = false, upTo = Infinity): string[][] {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    if (!parent.has(x)) parent.set(x, x);
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(x, r);
    return r;
  };
  const join = (a: string, b: string) => parent.set(find(a), find(b));
  const node = (ref: string) => {
    const h = parseHole(ref);
    return h ? `#${stripOf(h, splitRails)}` : ref;
  };
  for (const c of wr.components) {
    if (c.step > upTo) continue;
    for (const p of c.pins) find(`${c.id}.${p.id}`);
    for (const g of c.internal ?? []) for (const p of g.slice(1)) join(`${c.id}.${g[0]}`, `${c.id}.${p}`);
    for (const [pin, hole] of Object.entries(c.mount ?? {})) join(`${c.id}.${pin}`, node(hole));
  }
  for (const x of wr.wires) if (x.step <= upTo) join(node(x.from), node(x.to));
  const groups = new Map<string, string[]>();
  for (const k of parent.keys()) {
    if (k.startsWith('#')) continue;
    const r = find(k);
    groups.set(r, [...(groups.get(r) ?? []), k]);
  }
  return [...groups.values()].filter((g) => g.length > 1).map((g) => g.sort());
}

/** la red del esquema por la que va un cable (aunque sus dos puntas sean agujeros de la protoboard) */
export function netOfWire(x: Wire, wr: Wiring = WIRING): NetSpec | undefined {
  for (const end of [x.from, x.to]) if (!end.startsWith('bb:')) return netOfPin(end, wr);
  return netOfHole(x.from, wr);
}

/** la red a la que quedó unido un agujero de la protoboard, si alguna pata o cable lo alcanza */
export function netOfHole(ref: string, wr: Wiring = WIRING): NetSpec | undefined {
  const h = parseHole(ref);
  if (!h) return undefined;
  const strips = stripNets(wr);
  return strips.get(stripOf(h, false));
}

let stripCache: { wr: Wiring; map: Map<string, NetSpec> } | null = null;
function stripNets(wr: Wiring): Map<string, NetSpec> {
  if (stripCache?.wr === wr) return stripCache.map;
  const map = new Map<string, NetSpec>();
  const strip = (ref: string) => {
    const h = parseHole(ref);
    return h ? stripOf(h, false) : null;
  };
  for (const c of wr.components)
    for (const [pin, hole] of Object.entries(c.mount ?? {})) {
      const n = netOfPin(`${c.id}.${pin}`, wr);
      const s = strip(hole);
      if (n && s) map.set(s, n);
    }
  // los cables llevan la red de una punta a la otra; se repite hasta que nada cambia
  for (let pass = 0; pass < 6; pass++) {
    let changed = false;
    for (const x of wr.wires) {
      const nets = [x.from, x.to].map((e) => (e.startsWith('bb:') ? map.get(strip(e)!) : netOfPin(e, wr)));
      const n = nets[0] ?? nets[1];
      if (!n) continue;
      for (const e of [x.from, x.to]) {
        const s = strip(e);
        if (s && !map.has(s)) {
          map.set(s, n);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  stripCache = { wr, map };
  return map;
}

/** todo lo que no cuadra entre el montaje y el esquema; vacío si está bien */
export function checkWiring(wr: Wiring = WIRING): string[] {
  const out: string[] = [];
  const ids = new Set<string>();
  for (const c of wr.components) {
    if (ids.has(c.id)) out.push(`componente repetido: ${c.id}`);
    ids.add(c.id);
    if (!wr.steps.some((s) => s.n === c.step)) out.push(`${c.id}: paso ${c.step} no existe`);
    for (const [pin, hole] of Object.entries(c.mount ?? {})) {
      if (!c.pins.some((p) => p.id === pin)) out.push(`${c.id}: no tiene el pin ${pin}`);
      if (!parseHole(hole)) out.push(`${c.id}.${pin}: agujero inválido ${hole}`);
    }
  }
  const pinExists = (ref: string) => {
    if (ref.startsWith('bb:')) return parseHole(ref) !== null;
    const [cid, pid] = splitRef(ref);
    return !!componentById(cid, wr)?.pins.some((p) => p.id === pid);
  };
  const wids = new Set<string>();
  for (const x of wr.wires) {
    if (wids.has(x.id)) out.push(`cable repetido: ${x.id}`);
    wids.add(x.id);
    for (const end of [x.from, x.to]) if (!pinExists(end)) out.push(`cable ${x.id}: no existe ${end}`);
    if (!wr.steps.some((s) => s.n === x.step)) out.push(`cable ${x.id}: paso ${x.step} no existe`);
    // un cable no entra antes que las piezas que une
    for (const end of [x.from, x.to]) {
      if (end.startsWith('bb:')) continue;
      const c = componentById(splitRef(end)[0], wr);
      if (c && c.step > x.step) out.push(`cable ${x.id}: entra en el paso ${x.step}, antes que ${c.id} (paso ${c.step})`);
    }
    // el 18 AWG y los jumpers hembra no entran en la protoboard
    const holes = [x.from, x.to].filter((e) => e.startsWith('bb:')).length;
    if (holes && (x.cable === 'awg18' || x.cable === 'hh' || x.cable === 'ac' || x.cable === 'motor')) out.push(`cable ${x.id}: un ${CABLE[x.cable].label} no entra en la protoboard`);
    if (x.cable === 'mm' && holes === 0) out.push(`cable ${x.id}: un jumper macho-macho necesita al menos una punta en la protoboard o en un borne`);
  }
  // un agujero, una pata
  for (const [hole, who] of holeUsers(wr)) if (who.length > 1) out.push(`${holeText(hole)}: lo ocupan ${who.join(' y ')}`);
  // cada tira tiene cinco agujeros
  const perStrip = new Map<string, number>();
  for (const hole of holeUsers(wr).keys()) {
    const h = parseHole(hole);
    if (h && !h.rail) perStrip.set(stripOf(h, true), (perStrip.get(stripOf(h, true)) ?? 0) + 1);
  }
  for (const [s, n] of perStrip) if (n > 5) out.push(`${s}: ${n} patas en una tira de cinco`);
  // un pin, una red
  const seen = new Map<string, string>();
  for (const n of wr.nets)
    for (const p of n.pins) {
      if (!pinExists(p)) out.push(`red ${n.id}: no existe ${p}`);
      if (seen.has(p)) out.push(`${p}: está en las redes ${seen.get(p)} y ${n.id}`);
      seen.set(p, n.id);
    }
  // el montaje arma exactamente el esquema, con los rieles enteros y con los rieles partidos
  const want = new Set(wr.nets.map((n) => [...n.pins].sort().join(' ')));
  for (const split of [false, true]) {
    const got = new Set(derivedNets(wr, split).map((g) => g.join(' ')));
    const tag = split ? ' (rieles partidos)' : '';
    for (const g of got) if (!want.has(g)) out.push(`el montaje une lo que el esquema no${tag}: ${g}`);
    for (const g of want) if (!got.has(g)) out.push(`el montaje no arma la red${tag}: ${g}`);
  }
  // ningún GPIO queda en una red de potencia
  for (const n of wr.nets) if (['v24', 'v12', 'v5', 'mains', 'pulse', 'coil'].includes(n.kind)) for (const p of n.pins) if (p.startsWith('esp32.') && p !== 'esp32.5V') out.push(`${p} en la red ${n.label}`);
  return out;
}

/** cuántas resistencias de cada valor pide el montaje */
export function resistorCount(wr: Wiring = WIRING): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of wr.components) if (c.kind === 'resistor' && c.value) out[c.value] = (out[c.value] ?? 0) + 1;
  return out;
}

/** cuántos jumpers de cada tipo */
export function cableCount(wr: Wiring = WIRING): Record<CableKind, number> {
  const out = { ac: 0, awg18: 0, tip: 0, motor: 0, mm: 0, hm: 0, hh: 0 } as Record<CableKind, number>;
  for (const x of wr.wires) out[x.cable]++;
  return out;
}
