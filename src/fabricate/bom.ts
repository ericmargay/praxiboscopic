// Lista de materiales de la instalación física derivada del proyecto, con las convenciones de OMEGA
// (`@aminoacid/omega/parts` para las piezas, `@aminoacid/omega/fabricate` para la tabla en el formato de
// SHOPPING.md: qué, por qué, para qué, alternativa, costo · evidencia, link, necesidad). Los precios 🟢 de UNIT
// Electronics se leyeron el 2-nov-2026 en capturas de Eric o en fichas indexadas; la página de UNIT bloquea el acceso
// automático, así que hay que confirmarlos en el carrito. La comparativa con Amazon y MercadoLibre está en
// docs/COMPRAS-ELECTRONICA.md. Nada se compra sin abrir el link.
import { BEARINGS, type MotorModel } from '@aminoacid/omega/mech';
import { bomFromParts, type BomLine, type PartMeta } from '@aminoacid/omega/parts';
import { bomCsv, bomMarkdown, type ShoppingNotes } from '@aminoacid/omega/fabricate';
import type { Derived, Project, ReelsDerived } from '../core/project';
import { motorOf } from '../mech/transport';
import { mediumById } from '../optics/medium';
import { opticsReport } from '../optics/projector';
import { tilePlan } from '../film/print';
import { buildAssembly, buildReelsAssembly } from '../mech/assembly';
import { buildReelsStructure, SHEET_MATERIALS } from '../mech/structure';
import { reelsPrintedParts } from './printed';
import { estimateLaser, estimatePrint, fmtMxn, fmtRange, RATE_SOURCES, SHEET_STOCK } from './estimate';

const READ_DATE = '2-nov-2026';
const SHOP = 'UNIT Electronics';
const U = 'https://uelectronics.com/producto/';

/** precios de UNIT Electronics (MXN) */
const UNIT = {
  motor17hs8401: { sku: '17HS8401', unitCost: 225, url: `${U}nema-17-motor-a-pasos-17hs8401/`, label: 'Nema 17 17HS8401 1,8 A 5,5 kg·cm' },
  dm542: { sku: 'DM542', unitCost: 219, url: undefined, label: 'Driver DM542 20–50 V 4,2 A' },
  bracket17: { sku: 'SOP-N17', unitCost: 25, url: `${U}soporte-de-acero-para-motor-nema-17/`, label: 'Soporte de acero para motor Nema 17' },
  coupling: { sku: 'D19L25-5x8', unitCost: 33, url: undefined, label: 'Cople flexible D19L25 de aluminio 5 × 8 mm' },
  psu24: { sku: 'UE-120-24', unitCost: 210, url: `${U}fuente-conmutada-24v-5a/`, label: 'Fuente conmutada 24 V 5 A 120 W' },
  buck: { sku: 'AR0150', unitCost: 36, url: `${U}modulo-regulador-ajustable-lm2596-dc-dc-step-down-3a-1-25-30v/`, label: 'Regulador LM2596 step down 3 A' },
  esp32: { sku: 'ESP32-DevKitC-V4', unitCost: 145, url: `${U}esp32-devkitc-v4-esp32-wroom-32d-32u/`, label: 'ESP32 DevKitC V4 WROOM-32D' },
  sensor: { sku: 'F249', unitCost: 20, url: `${U}sensor-de-velocidad-f249-3-3v-5v/`, label: 'Sensor de barrera F249 3,3–5 V' },
  led10: { sku: 'LED-10W-BF', unitCost: 26, url: `${U}led-blanco-frio-de-potencia-10w-50w-y-100w/`, label: 'LED blanco frío de potencia 10 W, emisor 10,8 × 10,8 mm' },
  mosfet: { sku: 'IRLZ44N', unitCost: 12, url: `${U}transistor-irlz44/`, label: 'MOSFET IRLZ44N 55 V 47 A' },
  gateDriver: { sku: 'IR2101PBF', unitCost: 50, url: `${U}ir2101-driver-dip-8-ir2101pbf/`, label: 'Driver de compuerta IR2101 DIP-8' },
  npn: { sku: 'S8050', unitCost: 2, url: `${U}transistor-npn-500ma-25v-s8050/`, label: 'Transistor NPN S8050' },
  cap: { sku: 'CAP-1000U-50V', unitCost: 6, url: `${U}capacitor-electrolitico-50v/`, label: 'Capacitor electrolítico 1000 µF 50 V' },
  resistor: { sku: 'RES-AL-10W', unitCost: 32, url: `${U}resistencia-de-aluminio-10w/`, label: 'Resistencia de aluminio 10 W, 3,3 Ω (confirmar valor disponible)' },
  bearing: { sku: '608ZZ-7', unitCost: 8, url: `${U}608zz-7-rodamiento-tipo-balero-de-8-x-22-x-7-mm/`, label: 'Rodamiento 608ZZ 8 × 22 × 7 mm' },
  cable: { sku: 'AC-1.8', unitCost: 93, url: undefined, label: 'Cable de alimentación universal AC 1,8 m' },
} as const;

/**
 * Piezas de UNIT cuyo precio no pude leer (la tienda bloquea el acceso automático y el buscador no lo muestra): el
 * costo es una estimación y la evidencia queda como «estimated» hasta verlo en el carrito.
 */
const UNIT_EST = {
  expansion: { sku: 'UNIT-EXP-ESP32-38', unitCost: 89, url: `${U}unit-placa-de-expansion-para-esp32-38-pines/`, label: 'UNIT Placa de expansión para ESP32 de 38 pines' },
  breadboardKit: { sku: 'KIT-PROTO-830-MB102', unitCost: 150, url: `${U}kit-protoboard-830-puntos-fuente-mb102-65-cables-dupont-m-m/`, label: 'Kit protoboard 830 puntos + fuente MB102 + 65 jumpers macho-macho' },
  jumpersHM: { sku: 'JMP-HM-40', unitCost: 45, url: undefined, label: 'Jumpers dupont hembra-macho 20 cm (40 piezas)' },
  heatsink: { sku: 'DIS-40X40', unitCost: 35, url: undefined, label: 'Disipador de aluminio 40 × 40 × 20 mm' },
  resistors: { sku: 'RES-1/4W', unitCost: 1, url: undefined, label: 'Resistencias 1/4 W: 3 × 1 kΩ, 1 × 10 Ω, 2 × 10 kΩ' },
  ceramics: { sku: 'CAP-100N + CAP-10U', unitCost: 3, url: undefined, label: 'Capacitores 100 nF cerámico y 10 µF 50 V' },
  standoffs: { sku: 'SEP-M3-40', unitCost: 7, url: undefined, label: 'Separador hexagonal de latón M3 × 40 mm (macho-hembra)' },
  wire: { sku: 'CAB-18AWG', unitCost: 15, url: undefined, label: 'Cable 18 AWG rojo y negro (por metro)' },
} as const;
const unitEst = (k: keyof typeof UNIT_EST) => ({ name: SHOP, sku: UNIT_EST[k].sku, url: UNIT_EST[k].url, unitCost: UNIT_EST[k].unitCost, currency: 'MXN' as const });

const unit = (k: keyof typeof UNIT) => ({ name: SHOP, sku: UNIT[k].sku, url: UNIT[k].url, unitCost: UNIT[k].unitCost, currency: 'MXN' as const });

/**
 * Piezas nuevas de los dos tambores (ADR-0011): tienda, precio en MXN y de dónde salió. Las de UNIT salen del buscador
 * (la tienda bloquea la lectura automática): hay que confirmarlas en el carrito.
 */
interface ReelsPrice {
  label: string;
  shop: string;
  sku?: string;
  unitCost?: number;
  url?: string;
  evidence: NonNullable<ShoppingNotes['evidence']>;
  date?: string;
}
export const REELS_PRICES: Record<'vl53l4cd' | 'vl53l0x' | 'as5600' | 'spring' | 'jumpersHH' | 'm3kit' | 'headers' | 'fuse' | 'ties' | 'washers' | 'woodGlue' | 'epoxy' | 'caGlue' | 'shaftRod', ReelsPrice> = {
  // nadie lo vende en México: Amazon trae el de SparkFun con impuestos incluidos (Pololu y DigiKey, en OFFERS)
  vl53l4cd: { label: 'Sensor de distancia VL53L4CD en placa Qwiic (SparkFun SEN-18993)', shop: 'Amazon México', sku: 'B09YWNL4BN', unitCost: 500.18, url: 'https://www.amazon.com.mx/dp/B09YWNL4BN', evidence: 'read', date: '5-nov-2026' },
  vl53l0x: { label: 'Sensor de distancia VL53L0X en placa (GY-VL53L0XV2)', shop: SHOP, sku: 'VL53L0X', unitCost: 47, url: `${U}vl53l0x-medidor-de-distancia-laser-i2c-940nm-tof/`, evidence: 'estimated', date: '5-nov-2026' },
  as5600: { label: 'Encoder magnético AS5600 de 12 bits en módulo I2C, con imán', shop: SHOP, sku: 'AS5600', unitCost: 52, url: `${U}as5600-encoder-magnetico-12-bits/`, evidence: 'estimated', date: '5-nov-2026' },
  spring: { label: 'Kit de resortes de compresión y extensión, 200 piezas', shop: SHOP, sku: 'AR3384', unitCost: 162, url: `${U}resortes-de-compresion-y-extension-200-piezas/`, evidence: 'estimated', date: '5-nov-2026' },
  jumpersHH: { label: 'Jumpers dupont hembra-hembra de 30 cm (40 piezas)', shop: SHOP, sku: 'DUPONT-30-HH', unitCost: 20, url: `${U}cables-dupont-extra-largos-30cm-hh-mh-mm/`, evidence: 'estimated', date: '5-nov-2026' },
  m3kit: { label: 'Kit de 1260 tornillos M2 a M5 con tuercas y rondanas', shop: SHOP, unitCost: 341, url: 'https://uelectronics.com/categoria-producto/kits/robotica-kits/', evidence: 'estimated', date: '5-nov-2026' },
  // la página dio 403: precio del extracto del buscador (tira en escuadra de 40 pines, con IVA)
  headers: { label: 'Tira de pines macho en ángulo recto de 2,54 mm (40 pines)', shop: SHOP, unitCost: 3, url: 'https://uelectronics.com/?s=tira+de+pines', evidence: 'estimated', date: '5-nov-2026' },
  // Steren: fusible FEUR .5 (5 × 20 mm) $4 y portafusible en línea FUS-AUE $29
  fuse: { label: 'Fusible de 500 mA de 5 × 20 mm con portafusible en línea (Steren FEUR .5 + FUS-AUE)', shop: 'Steren', sku: 'FEUR .5 + FUS-AUE', unitCost: 33, url: 'https://www.steren.com.mx/catalogsearch/result/?q=fusible', evidence: 'read', date: '5-nov-2026' },
  // sin precio publicado a la vista: estimados de ferretería
  ties: { label: 'Cinchos de nylon de 3,6 × 150 mm (bolsa de 100)', shop: 'ferretería / Steren', unitCost: 45, evidence: 'estimated', date: '5-nov-2026' },
  washers: { label: 'Rondanas planas M8 (DIN 125, 1,6 mm), bolsa de 10', shop: 'ferretería', unitCost: 20, evidence: 'estimated', date: '5-nov-2026' },
  woodGlue: { label: 'Resistol 850 (cola blanca para madera), 250 g', shop: 'Home Depot', unitCost: 89, url: 'https://www.homedepot.com.mx/s/resistol%20850', evidence: 'read', date: '5-nov-2026' },
  epoxy: { label: 'Epóxico transparente de 5 minutos (J-B Weld ClearWeld)', shop: 'Home Depot', unitCost: 109, url: 'https://www.homedepot.com.mx/s/resistol%20850', evidence: 'read', date: '5-nov-2026' },
  caGlue: { label: 'Cianoacrilato (Kola Loka o similar), 2 tubos', shop: 'papelería / ferretería', unitCost: 40, evidence: 'estimated', date: '5-nov-2026' },
  shaftRod: { label: 'Eje lineal de acero Ø8 × 500 mm (varilla rectificada), cortado en 6 tramos', shop: 'UNIT Electronics / MercadoLibre', unitCost: 150, evidence: 'estimated', date: '5-nov-2026' },
};
const offerSupplier = (k: keyof typeof REELS_PRICES) => {
  const x = REELS_PRICES[k];
  return { name: x.shop, sku: x.sku, url: x.url, unitCost: x.unitCost, currency: 'MXN' as const };
};

export interface BomBundle {
  parts: PartMeta[];
  lines: BomLine[];
  notes: Record<string, ShoppingNotes>;
  markdown: string;
  csv: string;
}

function motorPart(motor: MotorModel, transport: Project['transport'], reels?: ReelsDerived): { part: PartMeta; note: ShoppingNotes } {
  const unitMotor = motor.id === '17hs8401';
  const part: PartMeta = {
    id: `motor-${motor.id}`,
    name: `Motor ${motor.label}`,
    category: 'electronic',
    qty: reels ? 2 : 1,
    process: 'buy',
    dimsMm: { x: motor.body.wMm, y: motor.body.hMm, z: motor.body.lengthMm },
    massG: motor.massG,
    supplier: unitMotor ? unit('motor17hs8401') : motor.supplier ? { name: motor.supplier.name, url: motor.supplier.url, unitCost: motor.supplier.unitCost, currency: motor.supplier.currency } : { name: motor.source.title, url: motor.source.url },
    notes: motor.notes,
  };
  const note: ShoppingNotes = {
    why: reels
      ? `Uno directo bajo cada tambor: el que jala marca la velocidad y el que suelta sostiene la tensión. A ${reels.fps.normal} fps gira de ${reels.rpm.normalFull.toFixed(0)} a ${reels.rpm.normalCore.toFixed(0)} rpm y a ${reels.fps.max} fps llega a ${reels.rpm.maxCore.toFixed(0)}; ahí da ${reels.torque.availableNcm.toFixed(1)} N·cm y hacen falta ${reels.torque.rollerTorqueNcm.toFixed(1)}`
      : `Un solo motor arrastra la película a ${transport.motorRpm.toFixed(0)} rpm con acoplamiento directo; los otros tres rodillos giran libres`,
    forWhat: reels ? 'Los dos tambores' : 'Rodillo motriz del loop de película',
    alternative: 'Nema 17 17HS4401 (MXN 156) si hay existencias en sucursal; 17HS4023 (MXN 145) es débil para este margen',
    evidence: unitMotor ? 'read' : motor.supplier?.unitCost ? 'estimated' : 'unverified',
    evidenceDate: unitMotor ? READ_DATE : undefined,
    need: 'requerido',
  };
  return { part, note };
}

/** piezas de la instalación para el proyecto actual */
export function buildParts(p: Project, d: Derived): { parts: PartMeta[]; notes: Record<string, ShoppingNotes> } {
  const parts: PartMeta[] = [];
  const notes: Record<string, ShoppingNotes> = {};
  const add = (part: PartMeta, note: ShoppingNotes) => {
    parts.push(part);
    notes[part.id] = note;
  };
  const motor = motorOf(p.transport);
  const reels = d.reels;
  const nMotors = reels ? 2 : 1;
  const m = motorPart(motor, p.transport, reels);
  add(m.part, m.note);

  // driver según el motor
  if (motor.type === 'stepper') {
    add(
      { id: 'driver-dm542', name: UNIT.dm542.label, category: 'electronic', qty: nMotors, process: 'buy', supplier: unit('dm542') },
      { why: reels ? 'Uno por motor, con 1/16 de paso: los dos siguen la misma rampa. Exige fuente de al menos 20 V' : 'Microstepping suave para reducir la vibración de la película; exige fuente de al menos 20 V', forWhat: reels ? 'Motores de los tambores' : 'Motor del transporte', alternative: reels ? 'TMC2209 (UNIT, de 87 a 99; existencias por confirmar): silencioso y va en la protoboard, si la prueba de banco muestra que alcanza el par a 1,2 A. TB6600 (MXN 140), más barato' : 'TB6600 (MXN 140), más barato y con microstepping menos fino', evidence: 'read', evidenceDate: READ_DATE, need: 'requerido' },
    );
    add(
      { id: 'npn-s8050', name: `${UNIT.npn.label} (PUL y DIR de 3,3 V a las entradas de 5 V ${reels ? 'de cada driver' : 'del driver'})`, category: 'electronic', qty: 2 * nMotors + 1, process: 'buy', supplier: unit('npn') },
      { why: `Las entradas optoacopladas del DM542 esperan 5 V; el ESP32 da 3,3 V. Dos por driver y uno de repuesto`, forWhat: reels ? 'Señales a los dos drivers' : 'Señales al driver', alternative: 'Buffer 74HCT245', evidence: 'read', evidenceDate: READ_DATE, need: 'requerido' },
    );
    if (!reels && motor.body.wMm <= 43)
      add(
        { id: 'bracket-nema17', name: UNIT.bracket17.label, category: 'structural', qty: nMotors, process: 'buy', supplier: unit('bracket17') },
        { why: reels ? 'Cuelga cada motor bajo la cubierta, alineado con el eje de su tambor' : 'Fija el motor bajo la mesa alineado con el eje del rodillo motriz', forWhat: 'Montaje del motor', alternative: 'Soporte impreso en 3D', evidence: 'read', evidenceDate: READ_DATE, need: 'requerido' },
      );
  } else {
    add({ id: 'driver-hbridge', name: 'Driver puente H para motor DC (p. ej. TB6612 o BTS7960)', category: 'electronic', qty: 1, process: 'buy' }, { why: 'Control PWM del motor DC', forWhat: 'Motor del transporte', alternative: 'Servo continuo con su propio driver', evidence: 'unverified', need: 'requerido' });
  }

  if (reels) addReelsMechanics(p, d, reels, add);
  else addLoopMechanics(p, d, add);
  addStructure(p, d, add);
  addOpticsAndControl(p, d, add);
  return { parts, notes };
}

type Add = (part: PartMeta, note: ShoppingNotes) => void;

/**
 * Dos tambores (ADR-0011) armados sin tornillos (ADR-0012): los trabajos de taller (corte láser en MDF y acrílico,
 * impresión 3D en PETG) con su estimado, el brazo tensor con resorte y AS5600, los sensores de mano, rodamientos, ejes y
 * coples. Los precios que no salen de la lista del loop vienen de `REELS_PRICES`; los de taller, de `estimate.ts`.
 */
function addReelsMechanics(p: Project, d: Derived, r: ReelsDerived, add: Add): void {
  const st = buildReelsStructure(p, d);
  const asm = st.asm;
  const printed = reelsPrintedParts(p, d, {}, asm);
  const laser = estimateLaser(st);
  const pe = estimatePrint(printed);
  const L = (m: string) => laser.find((x) => x.material === m)!;
  const pieces = (m: string) => st.parts.filter((x) => x.material === m);
  const list = (m: string) => pieces(m).map((x) => `${x.id} ${x.name.toLowerCase()}${x.qty > 1 ? ` ×${x.qty}` : ''}`).join(', ');
  const mdf = L('mdf');
  add(
    { id: 'laser-mdf', name: `Corte láser en ${SHEET_MATERIALS.mdf.label}: piso, cubierta doble, torres de los motores, marco y topes de la fuente, cuñas y piezas de prueba (${mdf.pieces} piezas)`, category: 'structural', qty: 1, material: 'mdf-5.5', process: 'laser', dimsMm: { x: asm.base.x1 - asm.base.x0, y: asm.base.z1 - asm.base.z0, z: 125 }, fabricate: { profile: 'outline', thicknessMm: asm.base.mdfT }, supplier: { name: 'taller de corte láser (FIC, CDMX)', url: RATE_SOURCES.laserFic.url, unitCost: Math.round(mdf.mxn.mid), currency: 'MXN' } },
    { why: `Piso y cubierta atrapan las paredes de acrílico en sus ranuras; todo se arma a mano sin tornillos: ${list('mdf')}. Estimado ${fmtRange(mdf.mxn)}: ${mdf.cutM.toFixed(1)} m de corte, unos ${Math.round(mdf.minutes)} min a $9/min, y ${mdf.sheets} hoja${mdf.sheets === 1 ? '' : 's'} de ${SHEET_STOCK['mdf'].label} a ${fmtMxn(SHEET_STOCK['mdf'].mxn)}`, forWhat: 'Estructura', alternative: 'Pedir la cotización por minuto y llevar el MDF de Home Depot (hoja de 1,22 × 2,44 m de 5,5 mm a $279, cortada a 90 × 60)', evidence: 'estimated', evidenceDate: '5-nov-2026', need: 'taller' },
  );
  const acr = L('acrilico-3');
  add(
    { id: 'laser-acrylic', name: `Corte láser en ${SHEET_MATERIALS['acrilico-3'].label}: las cuatro paredes de la caja, tapas de los tambores y bridas (${acr.pieces} piezas)`, category: 'structural', qty: 1, material: 'acrilico-3', process: 'laser', fabricate: { profile: 'outline', thicknessMm: 3 }, supplier: { name: 'taller de corte láser (FIC, CDMX)', url: RATE_SOURCES.laserFic.url, unitCost: Math.round(acr.mxn.mid), currency: 'MXN' } },
    { why: `${list('acrilico-3')}. Transparente para que se vean la electrónica y la película enrollada. Estimado ${fmtRange(acr.mxn)}: ${acr.cutM.toFixed(1)} m de corte (unos ${Math.round(acr.minutes)} min) y ${acr.sheets} hoja${acr.sheets === 1 ? '' : 's'} de 90 × 60 a ${fmtMxn(SHEET_STOCK['acrilico-3'].mxn)}, o el material por área si lo venden por pedazo`, forWhat: 'Paredes, tambores, guías y tapas', alternative: 'Paredes de MDF (más baratas, pero no se ve la electrónica) y bridas impresas en PETG', evidence: 'estimated', evidenceDate: '5-nov-2026', need: 'taller' },
  );
  const blk = L('acrilico-negro-3');
  add(
    { id: 'laser-black', name: `Corte láser en ${SHEET_MATERIALS['acrilico-negro-3'].label}: placa de la ventana y sus dos guías`, category: 'optical', qty: 1, material: 'acrilico-negro-3', process: 'laser', fabricate: { profile: 'outline', thicknessMm: 3 }, supplier: { name: 'taller de corte láser (FIC, CDMX)', url: RATE_SOURCES.laserFic.url, unitCost: Math.max(50, Math.round(blk.mxn.mid)), currency: 'MXN' } },
    { why: `Máscara del fotograma de ${p.optics.gateWidthMm} × ${p.optics.gateHeightMm} mm del lado de la lámpara; las guías tocan el dorso de la película solo por los márgenes. Con el LED en destellos no hay calor que pida aluminio. Estimado ${fmtRange(blk.mxn)} más el mínimo del taller`, forWhat: 'Óptica', alternative: 'Aluminio negro de 1,5 mm con láser de fibra (Prometeus o Lasershop cotizan por proyecto)', evidence: 'estimated', evidenceDate: '5-nov-2026', need: 'taller' },
  );
  add(
    { id: 'print-petg', name: `Impresión 3D en PETG: ${printed.length} piezas distintas, ${pe.pieces} en total (núcleos de los tambores, cuerpos de las guías y del rodillo tensor, brazo, copa del pivote, postes, capuchones, cabeza del LED, cuna de la lente y soportes)`, category: 'mechanical', qty: 1, material: 'petg', process: 'print3d', fabricate: { profile: 'mesh' }, supplier: { name: 'servicio de impresión 3D (CDMX)', url: RATE_SOURCES.print3d.url, unitCost: Math.round(pe.mxn.mid), currency: 'MXN' } },
    { why: `Unos ${Math.round(pe.grams)} g de PETG y ${pe.hours.toFixed(0)} h de máquina. Estimado ${fmtRange(pe.mxn)}: de $2,5/g a $1,80/min. Lo que más pesa: ${pe.heaviest.map((h) => `${h.id} ${h.name.toLowerCase()} (${Math.round(h.grams)} g)`).join(', ')}`, forWhat: 'Tambores, guías, brazo tensor, tapas y óptica', alternative: 'Imprimir en casa (unos $110 de filamento: un rollo de PETG de 1 kg cuesta ~$295) o núcleos de los tambores con discos de MDF pegados', evidence: 'estimated', evidenceDate: '5-nov-2026', need: 'taller' },
  );
  add(
    { id: 'dancer-spring', name: REELS_PRICES.spring.label, category: 'mechanical', qty: 1, process: 'buy', supplier: offerSupplier('spring') },
    { why: `Jala el brazo hacia la película desde el ancla del hueco: fija la tensión en unos ${p.transport.tensionN} N. Del surtido se elige uno suave (unos 2 N con el brazo al centro); se ajusta desde arriba`, forWhat: 'Tensión de la película', alternative: 'Una liga de hule o un resorte de bolígrafo para la prueba de banco', evidence: REELS_PRICES.spring.evidence, evidenceDate: REELS_PRICES.spring.date, need: 'requerido' },
  );
  add(
    { id: 'as5600', name: REELS_PRICES.as5600.label, category: 'electronic', qty: 1, process: 'buy', supplier: offerSupplier('as5600') },
    { why: 'Lee el ángulo del brazo tensor con 0,09° de resolución a través del imán del eje; entra de lado en la ranura de la copa del pivote. El ESP32 corrige con él el motor que suelta', forWhat: 'Tensión de la película', alternative: 'Potenciómetro de 10 kΩ en el eje del pivote, a la entrada analógica del ESP32', evidence: REELS_PRICES.as5600.evidence, evidenceDate: REELS_PRICES.as5600.date, need: 'requerido' },
  );
  const sensor = r.spec.sensor === 'vl53l0x' ? REELS_PRICES.vl53l0x : REELS_PRICES.vl53l4cd;
  add(
    { id: 'hand-sensor', name: sensor.label, category: 'electronic', qty: 2, process: 'buy', supplier: offerSupplier(r.spec.sensor) },
    { why: `Uno sobre cada tambor, mirando hacia arriba bajo su capuchón impreso: ${r.sensor.note.toLowerCase()}. La mano a ${Math.max(...r.spec.control.speedMap.map((x) => x[0])) / 10} cm o más cerca mueve la película`, forWhat: 'Manos del visitante', alternative: r.spec.sensor === 'vl53l0x' ? 'VL53L4CD, que lee la mano hasta 1 mm y en un cono más estrecho' : 'VL53L0X de UNIT (pierde la mano a menos de 3 cm), solo para la prueba de banco', evidence: sensor.evidence, evidenceDate: sensor.date, need: 'requerido' },
  );
  add(
    { id: 'pin-headers', name: REELS_PRICES.headers.label, category: 'electronic', qty: 1, process: 'buy', supplier: offerSupplier('headers') },
    { why: 'Seis pines en ángulo recto soldados a cada sensor de mano: los cables salen de lado hacia el canal del capuchón, y el XSHUT del sensor 2 no viene en el conector Qwiic', forWhat: 'Manos del visitante', alternative: 'Cables Qwiic a jumper hembra (sin XSHUT)', evidence: REELS_PRICES.headers.evidence, evidenceDate: REELS_PRICES.headers.date, need: 'requerido' },
  );
  if (r.spec.sensor === 'vl53l4cd')
    add(
      { id: 'hand-sensor-bench', name: `${REELS_PRICES.vl53l0x.label}, para empezar la prueba de banco mientras llega el VL53L4CD`, category: 'electronic', qty: 1, process: 'buy', supplier: offerSupplier('vl53l0x') },
      { why: 'Se consigue hoy y usa el mismo bus I2C: con él se arma el programa de la mano en banco', forWhat: 'Prueba de banco', alternative: 'Esperar al VL53L4CD', evidence: REELS_PRICES.vl53l0x.evidence, evidenceDate: REELS_PRICES.vl53l0x.date, need: 'opcional' },
    );
  const bearing = BEARINGS.find((b) => b.id === '608') ?? BEARINGS[0];
  add(
    { id: `bearing-${bearing.id}`, name: UNIT.bearing.label, category: 'mechanical', qty: 12, process: 'buy', dimsMm: { x: bearing.odMm, y: bearing.odMm, z: bearing.widthMm }, massG: bearing.massG, supplier: unit('bearing') },
    { why: 'Dos por tambor (en la cubierta y en la placa de su torre), dos por guía, dos en el rodillo del brazo tensor y dos en el pivote (contracubierta y copa)', forWhat: 'Tambores, guías y brazo tensor', alternative: 'Bujes de bronce 8 × 12 × 8 (más fricción)', evidence: 'estimated', evidenceDate: READ_DATE, need: 'requerido' },
  );
  add(
    { id: 'shaft-8mm', name: REELS_PRICES.shaftRod.label, category: 'mechanical', qty: 1, process: 'buy', dimsMm: { x: 8, y: 8, z: 500 }, supplier: offerSupplier('shaftRod') },
    { why: 'Seis tramos con segueta: 2 de 100 mm (tambores, pegados al núcleo; bajan al cople), 2 de 70 mm (guías, pegados a la cubierta), 1 de 65 mm (rodillo tensor) y 1 de 40 mm (pivote). Suman 445 mm', forWhat: 'Tambores, guías y brazo tensor', alternative: 'Tramos de varilla rectificada de ferretería', evidence: REELS_PRICES.shaftRod.evidence, evidenceDate: REELS_PRICES.shaftRod.date, need: 'requerido' },
  );
  add(
    { id: 'coupling-5-8', name: UNIT.coupling.label, category: 'mechanical', qty: 2, process: 'buy', supplier: unit('coupling') },
    { why: 'Une el eje de cada motor con el de su tambor tolerando desalineación. Sus prisioneros son los únicos tornillos de la mesa', forWhat: 'Transmisión', alternative: 'Cople rígido, solo si la alineación es muy buena', evidence: 'read', evidenceDate: READ_DATE, need: 'requerido' },
  );
}

/** el loop: rodillos, rodamientos, ejes, cople y tensor */
function addLoopMechanics(p: Project, d: Derived, add: Add): void {
  const R = d.pathSpec.rollerRadiusMm;
  const rollerH = p.film.stripWidthMm + 10;
  const n = d.pathSpec.rollers.length;
  const onCover = d.faces.covered ? d.faces.inkTouched : 0;
  add(
    { id: 'rollers', name: `Rodillo Ø${(2 * R).toFixed(2)} × ${rollerH.toFixed(0)} mm con pestañas guía`, category: 'mechanical', qty: n, material: 'pla o petg', process: 'print3d', dimsMm: { x: 2 * R + 6, y: 2 * R + 6, z: rollerH }, fabricate: { profile: 'mesh' }, notes: `Pestañas que guían la película sin tocar los fotogramas; el motriz con superficie de goma y cubo metálico con prisionero${onCover ? `. Los ${onCover} que tocan la cubierta, con el centro rebajado: apoyan solo en los márgenes, fuera de la imagen` : ''}` },
    { why: `Uno motriz, uno tensor y ${n - 2 === 2 ? 'dos' : n - 2} libres; definen el recorrido de ${d.path.lengthMm.toFixed(0)} mm`, forWhat: 'Recorrido de la película', alternative: 'Torneados en nylon o aluminio si la impresión queda con más de 0,1 mm de excentricidad', evidence: 'estimated', need: 'taller' },
  );
  const bearing = BEARINGS.find((b) => b.id === '608') ?? BEARINGS[0];
  add(
    { id: `bearing-${bearing.id}`, name: UNIT.bearing.label, category: 'mechanical', qty: n * 2, process: 'buy', dimsMm: { x: bearing.odMm, y: bearing.odMm, z: bearing.widthMm }, massG: bearing.massG, supplier: unit('bearing') },
    { why: 'Dos por rodillo: giro libre y sin juego para que la película no cabecee', forWhat: 'Rodillos', alternative: 'Bujes de bronce 8 × 12 × 8 (más fricción)', evidence: 'estimated', evidenceDate: READ_DATE, need: 'requerido' },
  );
  add(
    { id: 'shaft-8mm', name: `Eje de acero Ø8 × ${(rollerH + 40).toFixed(0)} mm`, category: 'mechanical', qty: n, process: 'buy', dimsMm: { x: 8, y: 8, z: rollerH + 40 }, supplier: { name: 'ferretería (varilla rectificada)', unitCost: 60, currency: 'MXN' } },
    { why: 'Eje de cada rodillo sobre los rodamientos 608', forWhat: 'Rodillos', alternative: 'Tornillo M8 (menos preciso)', evidence: 'estimated', need: 'requerido' },
  );
  add(
    { id: 'coupling-5-8', name: UNIT.coupling.label, category: 'mechanical', qty: 1, process: 'buy', supplier: unit('coupling') },
    { why: 'Une el eje del motor con el eje del rodillo motriz tolerando desalineación; no hacen falta bandas', forWhat: 'Transmisión', alternative: 'Cople rígido, solo si la alineación es muy buena', evidence: 'read', evidenceDate: READ_DATE, need: 'requerido' },
  );

  add(
    { id: 'tensioner', name: 'Brazo del rodillo tensor con resorte de extensión', category: 'mechanical', qty: 1, process: 'print3d', fabricate: { profile: 'mesh' } },
    { why: 'Mantiene alrededor de 1 N de tensión y absorbe el error de longitud de la tira empalmada a mano', forWhat: 'Recorrido de la película', alternative: 'Rodillo en corredera con resorte', evidence: 'estimated', need: 'taller' },
  );
}

/** caja base y, en el loop, la caja de control sobre los rodillos */
function addStructure(p: Project, d: Derived, add: Add): void {
  if (d.reels) {
    // la estructura va en el corte láser; aquí solo lo que la arma sin tornillos
    add(
      { id: 'cable-ties', name: REELS_PRICES.ties.label, category: 'structural', qty: 1, process: 'buy', supplier: offerSupplier('ties') },
      { why: 'Pasan por las ranuras chicas del piso: sujetan los dos drivers, la placa de expansión, los reguladores y la resistencia, el F249 a su brazo y el cable de CA en la tapa trasera', forWhat: 'Montaje', alternative: 'Cinchos de velcro, que se reusan', evidence: REELS_PRICES.ties.evidence, evidenceDate: REELS_PRICES.ties.date, need: 'requerido' },
    );
    add(
      { id: 'washers-m8', name: REELS_PRICES.washers.label, category: 'mechanical', qty: 1, process: 'buy', supplier: offerSupplier('washers') },
      { why: 'Una bajo cada guía: el 608 de abajo apoya en ella y no roza la cubierta', forWhat: 'Guías', alternative: 'Arandela impresa de 1,6 mm', evidence: REELS_PRICES.washers.evidence, evidenceDate: REELS_PRICES.washers.date, need: 'requerido' },
    );
    add(
      { id: 'glue-wood', name: REELS_PRICES.woodGlue.label, category: 'structural', qty: 1, process: 'buy', supplier: offerSupplier('woodGlue') },
      { why: 'Pega las dos capas de la cubierta (con los 608 adentro) y, si la mesa va a viajar, los dientes del piso y las paredes', forWhat: 'Estructura', alternative: 'Cualquier cola blanca para madera', evidence: REELS_PRICES.woodGlue.evidence, evidenceDate: REELS_PRICES.woodGlue.date, need: 'requerido' },
    );
    add(
      { id: 'epoxy', name: REELS_PRICES.epoxy.label, category: 'structural', qty: 1, process: 'buy', supplier: offerSupplier('epoxy') },
      { why: 'Pega los núcleos y el brazo a sus ejes, los ejes de las guías a la cubierta, la copa del pivote y las espigas de los postes', forWhat: 'Montaje', alternative: 'Kola Loka Epoxi o Devcon', evidence: REELS_PRICES.epoxy.evidence, evidenceDate: REELS_PRICES.epoxy.date, need: 'requerido' },
    );
    add(
      { id: 'ca-glue', name: REELS_PRICES.caGlue.label, category: 'structural', qty: 1, process: 'buy', supplier: offerSupplier('caGlue') },
      { why: 'Pega las bridas de acrílico a los núcleos y rodillos impresos, y las dos guías a la placa de la ventana', forWhat: 'Tambores, guías y ventana', alternative: 'Cemento para acrílico (cloroformo) solo para acrílico con acrílico', evidence: REELS_PRICES.caGlue.evidence, evidenceDate: REELS_PRICES.caGlue.date, need: 'requerido' },
    );
    return;
  }
  // caja base: cubierta con los rodillos y, dentro, motor, fuente, driver y reguladores
  const asm = buildAssembly(p, d);
  const baseW = asm.base.x1 - asm.base.x0;
  const baseD = asm.base.z1 - asm.base.z0;
  const baseH = asm.base.deckT + asm.base.innerH + asm.base.floorT;
  add(
    { id: 'base-box', name: `Caja base ${baseW.toFixed(0)} × ${baseD.toFixed(0)} × ${baseH.toFixed(0)} mm: cubierta de MDF 9 mm con barrenos de rodillos y paso de cables, paredes y piso de MDF 6 mm`, category: 'structural', qty: 1, material: 'mdf-9', process: 'laser', dimsMm: { x: baseW, y: baseD, z: baseH }, fabricate: { profile: 'outline', thicknessMm: 9 } },
    { why: 'Posiciona los rodillos con la precisión del láser (±0,5 mm → ±0,5 mm de loop) y guarda dentro motor, fuente y driver', forWhat: 'Estructura', alternative: 'Acrílico transparente 6 mm para ver la electrónica', evidence: 'estimated', need: 'taller' },
  );
  add(
    { id: 'control-box', name: `Caja de control de acrílico transparente 3 mm, ${asm.box.w} × ${asm.box.d} × ${asm.box.h} mm, con tapa`, category: 'structural', qty: 1, material: 'acrilico-3', process: 'laser', dimsMm: { x: asm.box.w, y: asm.box.d, z: asm.box.h }, fabricate: { profile: 'outline', thicknessMm: 3 } },
    { why: 'Lleva la protoboard, el ESP32 y el driver del LED por encima de los rodillos, a la vista y cerca del LED', forWhat: 'Control', alternative: 'Caja de proyectos de plástico de tamaño similar', evidence: 'estimated', need: 'taller' },
  );
  add(
    { id: 'standoffs', name: UNIT_EST.standoffs.label, category: 'structural', qty: 2 * asm.standoffs.length, process: 'buy', supplier: unitEst('standoffs') },
    { why: `Dos por pata: elevan la caja de control a ${asm.box.y} mm, por encima de los ejes de los rodillos`, forWhat: 'Control', alternative: 'Varilla roscada M3 con tuercas', evidence: 'estimated', need: 'requerido' },
  );
}

/** lo que comparten las dos obras: ventana, óptica, LED, control, alimentación, película y pantalla */
function addOpticsAndControl(p: Project, d: Derived, add: Add): void {
  const reels = d.reels;
  // ventana y linterna (con dos tambores la placa y los soportes van en los trabajos de corte e impresión)
  if (!reels) add(
    { id: 'gate-plate', name: `Placa de ventana ${p.optics.gateWidthMm} × ${p.optics.gateHeightMm} mm en aluminio negro 1,5 mm con guías`, category: 'optical', qty: 1, material: 'aluminio-1.5', process: 'laser', dimsMm: { x: p.optics.gateWidthMm + 40, y: p.film.stripWidthMm + 30, z: 1.5 }, fabricate: { profile: 'outline', thicknessMm: 1.5 }, notes: 'Del lado de la lámpara: sus guías apoyan en los márgenes de la cara limpia. Del lado de la lente nada toca la película: ahí va la tinta' },
    { why: 'Máscara del fotograma: solo pasa luz por la imagen; las guías mantienen la película plana en el plano focal', forWhat: 'Óptica', alternative: 'Acrílico negro 2 mm (menos resistente al calor de la lámpara)', evidence: 'estimated', need: 'taller' },
  );
  const orep = opticsReport(p.optics);
  add(
    { id: `lens-${p.optics.focalMm}mm`, name: `Lente de ${p.optics.focalMm} mm f/${p.optics.fNumber} para réflex de 35 mm, con montura de enfoque (no sirve una CCTV C-mount)`, category: 'optical', qty: 1, process: 'buy', supplier: { name: 'segunda mano', unitCost: 800, currency: 'MXN' } },
    { why: `Forma la imagen de ${orep.imageWidthMm.toFixed(0)} × ${orep.imageHeightMm.toFixed(0)} mm a ${(p.optics.throwMm / 1000).toFixed(1)} m; debe cubrir la diagonal de 37,7 mm del fotograma`, forWhat: 'Óptica', alternative: 'Lente de ampliadora de 50 mm', evidence: 'unverified', need: 'requerido' },
  );
  add(
    { id: 'condenser', name: 'Condensador: par de lentes plano-convexas Ø40 mm f≈50 mm en tubo impreso', category: 'optical', qty: 1, process: 'buy', supplier: { name: 'óptica / AliExpress', unitCost: 300, currency: 'MXN' } },
    { why: 'Concentra la luz del LED en la ventana (eficiencia del condensador en el modelo: ' + (p.optics.condenserEfficiency * 100).toFixed(0) + ' %)', forWhat: 'Óptica', alternative: 'Lente Fresnel de 50 mm de focal', evidence: 'estimated', need: 'requerido' },
  );
  if (!reels) add(
    { id: 'printed-supports', name: reels ? 'Piezas impresas: cuna de la lente, poste de la cabeza del LED, brazo del sensor de marcas, alojamientos del segundo 608 de cada tambor y soporte del AS5600' : 'Piezas impresas: cuna de la lente, poste de la cabeza del LED, brazo del sensor y alojamiento del segundo 608 del motriz', category: 'mechanical', qty: 1, process: 'print3d', fabricate: { profile: 'mesh' } },
    { why: reels ? 'Fijan la lente a la distancia de enfoque, el LED detrás de la ventana, el sensor sobre el borde de la película, el eje de cada tambor en dos rodamientos y el AS5600 frente al imán del pivote' : 'Fijan la lente a la distancia de enfoque, el LED detrás de la ventana, el sensor sobre el borde de la película y el eje motriz en dos rodamientos', forWhat: 'Óptica', alternative: 'Tubo de PVC y abrazaderas', evidence: 'estimated', need: 'taller' },
  );

  // estroboscopio
  if (p.strobeKind === 'led') {
    add(
      { id: 'led-10w', name: UNIT.led10.label, category: 'electronic', qty: 3, process: 'buy', supplier: unit('led10') },
      { why: `Emisor pequeño: la lente admite ~${(p.optics.condenserEfficiency * 100).toFixed(0)} % de su luz, frente a ~8 % del LED de 100 W (emisor de 24,6 mm); dos son repuesto para las pruebas de sobrecorriente`, forWhat: 'Fuente de luz', alternative: 'LED de 100 W (MXN 78), que exige un riel de unos 48 V', evidence: 'estimated', evidenceDate: READ_DATE, need: 'requerido' },
    );
    add(
      { id: 'led-heatsink', name: UNIT_EST.heatsink.label, category: 'electronic', qty: 1, process: 'buy', supplier: unitEst('heatsink') },
      { why: 'Base térmica del LED; la potencia media es pequeña, así que no hace falta ventilador', forWhat: 'Fuente de luz', alternative: 'Placa de aluminio de 3 mm', evidence: 'estimated', need: 'requerido' },
    );
    add(
      { id: 'led-mosfet', name: UNIT.mosfet.label, category: 'electronic', qty: 2, process: 'buy', supplier: unit('mosfet') },
      { why: 'Interruptor del pulso de unos 4 A', forWhat: 'Driver del LED', alternative: 'IRFZ44N solo con 10–12 V de compuerta', evidence: 'read', evidenceDate: READ_DATE, need: 'requerido' },
    );
    add(
      { id: 'led-gate-driver', name: UNIT.gateDriver.label, category: 'electronic', qty: 1, process: 'buy', supplier: unit('gateDriver') },
      { why: 'Da 12 V a la compuerta con flancos rápidos desde la señal de 3,3 V; usar el canal bajo (confirmar umbral de entrada en la hoja de datos)', forWhat: 'Driver del LED', alternative: 'TC4420, que no encontré en UNIT', evidence: 'read', evidenceDate: READ_DATE, need: 'requerido' },
    );
    add(
      { id: 'led-caps', name: UNIT.cap.label, category: 'electronic', qty: 3, process: 'buy', supplier: unit('cap') },
      { why: 'Entregan el pico de corriente junto al LED; la fuente solo repone el promedio', forWhat: 'Driver del LED', alternative: 'Cualquier electrolítico de al menos 35 V', evidence: 'estimated', evidenceDate: READ_DATE, need: 'requerido' },
    );
    add(
      { id: 'led-resistor', name: UNIT.resistor.label, category: 'electronic', qty: 1, process: 'buy', supplier: unit('resistor') },
      { why: 'Limita el pulso: (24 V − unos 12 V) / 3,3 Ω ≈ 3,6 A. Empieza con más ohms y baja midiendo', forWhat: 'Driver del LED', alternative: 'Cemento 5 W de 2,2 Ω en serie', evidence: 'estimated', evidenceDate: READ_DATE, need: 'requerido' },
    );
    add(
      { id: 'small-resistors', name: UNIT_EST.resistors.label, category: 'electronic', qty: 6, process: 'buy', supplier: unitEst('resistors') },
      { why: '1 kΩ en las bases de los S8050, 10 Ω entre el IR2101 y la compuerta, 10 kΩ de compuerta a tierra y en LIN', forWhat: 'Driver del LED y señales', alternative: 'Surtido de resistencias 1/4 W', evidence: 'estimated', need: 'requerido' },
    );
    add(
      { id: 'ceramic-caps', name: UNIT_EST.ceramics.label, category: 'electronic', qty: 2, process: 'buy', supplier: unitEst('ceramics') },
      { why: 'Desacoplo del IR2101 junto a su pin VCC', forWhat: 'Driver del LED', alternative: 'Cualquier 100 nF de 25 V o más', evidence: 'estimated', need: 'requerido' },
    );
    add(
      { id: 'led-fuse', name: `${REELS_PRICES.fuse.label}, antes de los capacitores`, category: 'electronic', qty: 1, process: 'buy', supplier: offerSupplier('fuse') },
      { why: 'Si el MOSFET queda en corto, corta antes de quemar el LED y la resistencia. La ficha de Steren no dice si es rápido: el Bussmann GMA-500mA sí lo es ($26,60 + IVA en Electrónica Universal)', forWhat: 'Seguridad', alternative: 'Fusible reajustable de corriente similar', evidence: REELS_PRICES.fuse.evidence, evidenceDate: REELS_PRICES.fuse.date, need: 'requerido' },
    );
  } else {
    add(
      { id: 'drum-shutter', name: `Tambor obturador Ø${(2 * p.drum.drumRadiusMm).toFixed(0)} mm con ${p.drum.slots} ranuras de ${p.drum.slotWidthMm} mm, en acrílico negro 3 mm`, category: 'optical', qty: 1, material: 'acrilico-negro-3', process: 'laser', dimsMm: { x: 2 * p.drum.drumRadiusMm, y: 2 * p.drum.drumRadiusMm, z: p.film.stripWidthMm + 20 }, fabricate: { profile: 'outline', thicknessMm: 3 } },
      { why: `${p.drum.slots} ranuras a ${p.drum.rpm} rpm = ${((p.drum.slots * p.drum.rpm) / 60).toFixed(1)} destellos/s`, forWhat: 'Estroboscopio analógico', alternative: 'Disco obturador plano (más fácil de equilibrar)', evidence: 'estimated', need: 'taller' },
    );
    add(
      { id: 'drum-motor', name: 'Motor del tambor: Nema 17 17HS4023 0,7 A + driver A4988', category: 'electronic', qty: 1, process: 'buy', supplier: { name: SHOP, sku: '17HS4023 + A4988', unitCost: 145 + 34, currency: 'MXN' } },
      { why: 'Un paso a paso mantiene la relación exacta de velocidad con el motor de transporte (mismo reloj)', forWhat: 'Estroboscopio analógico', alternative: 'Acoplar el tambor al mismo eje con engranes (relación fija)', evidence: 'read', evidenceDate: READ_DATE, need: 'requerido' },
    );
    add(
      { id: 'lamp-halogen', name: `Lámpara continua ${p.drum.lampLumens} lm (halógena 12 V 50 W o LED 30 W) con reflector`, category: 'electronic', qty: 1, process: 'buy', supplier: { name: 'Steren / ferretería', unitCost: 250, currency: 'MXN' } },
      { why: 'Fuente continua detrás del tambor', forWhat: 'Linterna', alternative: 'LED COB 30 W con disipador', evidence: 'estimated', need: 'requerido' },
    );
  }

  // control y alimentación
  add(
    { id: 'esp32', name: UNIT.esp32.label, category: 'electronic', qty: 1, process: 'buy', supplier: unit('esp32') },
    { why: reels ? 'Lee las dos manos y el brazo tensor por I2C, mueve los dos motores con la misma rampa (por ejemplo con FastAccelStepper), frena antes del final y dispara el LED con cada marca, con un destello que se acorta con la velocidad. Se programa con el IDE de Arduino' : 'Genera los pasos del motor y dispara el LED por interrupción del sensor, con temporizadores de hardware. Se programa con el IDE de Arduino', forWhat: 'Control', alternative: 'Arduino Nano', evidence: 'read', evidenceDate: READ_DATE, need: 'requerido' },
  );
  add(
    { id: 'esp32-expansion', name: UNIT_EST.expansion.label, category: 'electronic', qty: 1, process: 'buy', supplier: unitEst('expansion') },
    { why: 'Las filas del DevKitC están a 25,4 mm: en una protoboard uno de sus lados queda sin agujeros libres. La placa expone cada GPIO con su voltaje y tierra', forWhat: 'Control', alternative: 'Dos protoboards de 400 puntos separadas para que cada fila quede en una', evidence: 'estimated', need: 'requerido' },
  );
  add(
    { id: 'breadboard-kit', name: UNIT_EST.breadboardKit.label, category: 'electronic', qty: 1, process: 'buy', supplier: unitEst('breadboardKit') },
    { why: 'Arma el driver del LED y las señales del motor sin soldar; los jumpers macho-macho van dentro de la protoboard', forWhat: 'Control', alternative: 'Protoboard de 830 puntos sola', evidence: 'estimated', need: 'requerido' },
  );
  add(
    { id: 'jumpers-hm', name: UNIT_EST.jumpersHM.label, category: 'wiring', qty: 1, process: 'buy', supplier: unitEst('jumpersHM') },
    { why: 'De los pines de la placa de expansión a la protoboard, al sensor y a las entradas del driver', forWhat: 'Cableado', alternative: 'Cable de calibre 24 con terminales dupont', evidence: 'estimated', need: 'requerido' },
  );
  if (reels)
    add(
      { id: 'jumpers-hh', name: REELS_PRICES.jumpersHH.label, category: 'wiring', qty: 1, process: 'buy', supplier: offerSupplier('jumpersHH') },
      { why: 'El bus I2C, 13 cables: 4 al AS5600 y 9 a los sensores de mano (el del tambor 2 lleva además su XSHUT). Para llegar a las tapas, unos 50 cm, cada uno va empalmado con uno hembra-macho de 20 cm', forWhat: 'Cableado', alternative: 'Cable de 6 hilos calibre 26 con terminales dupont hembra', evidence: REELS_PRICES.jumpersHH.evidence, evidenceDate: REELS_PRICES.jumpersHH.date, need: 'requerido' },
    );
  add(
    { id: 'wire-18awg', name: UNIT_EST.wire.label, category: 'wiring', qty: reels ? 5 : 4, process: 'buy', supplier: unitEst('wire') },
    { why: reels ? 'Lleva 24 V a los dos drivers y la corriente del LED; los jumpers delgados se quedan para las señales' : 'Lleva 24 V y la corriente del LED; los jumpers delgados se quedan para las señales', forWhat: 'Cableado', alternative: 'Cable de bocina 2 × 18 AWG', evidence: 'estimated', need: 'requerido' },
  );
  if (p.film.syncMarks.enabled)
    add(
      { id: 'sensor-f249', name: `${UNIT.sensor.label} (la marca negra interrumpe el haz)`, category: 'electronic', qty: 2, process: 'buy', supplier: unit('sensor') },
      { why: 'Cada marca de fotograma dispara el destello: el error de diámetro o el patinaje ya no producen deriva. Probar con la tinta real: muchas son transparentes al infrarrojo', forWhat: 'Sincronía', alternative: 'Módulo KY-010', evidence: 'read', evidenceDate: READ_DATE, need: 'requerido' },
    );
  add(
    { id: 'psu-24v-5a', name: UNIT.psu24.label, category: 'electronic', qty: 1, process: 'buy', supplier: unit('psu24') },
    { why: reels ? 'Alimenta los dos drivers y el LED: los motores toman en promedio menos de 1 A cada uno y el DM542 no arranca con 12 V' : 'Alimenta driver y LED; el DM542 no arranca con 12 V', forWhat: 'Alimentación', alternative: 'Mean Well LRS-75-24 (MXN 318), de mejor calidad', evidence: 'read', evidenceDate: READ_DATE, need: 'requerido' },
  );
  add(
    { id: 'buck-lm2596', name: `${UNIT.buck.label} (uno a 5 V y otro a 12 V)`, category: 'electronic', qty: 2, process: 'buy', supplier: unit('buck') },
    { why: '5 V para ESP32, sensor y señales; 12 V para el IR2101', forWhat: 'Alimentación', alternative: 'MP1584EN', evidence: 'read', evidenceDate: READ_DATE, need: 'requerido' },
  );
  add(
    { id: 'ac-cable', name: UNIT.cable.label, category: 'wiring', qty: 1, process: 'buy', supplier: unit('cable') },
    { why: 'Alimentación de la fuente', forWhat: 'Alimentación', alternative: 'Cualquier cable IEC C13', evidence: 'read', evidenceDate: READ_DATE, need: 'requerido' },
  );

  // película
  const medium = mediumById(p.print.mediumId);
  const plan = tilePlan(d.layout, p.print);
  if (medium.quality === 'desktop') {
    add(
      { id: `film-sheets-${medium.id}`, name: `Hojas transparentes ${plan.page.label} para ${medium.id === 'laser-transparency' ? 'láser' : 'inyección de tinta'} (paquete)`, category: 'material', qty: 1, process: 'buy', supplier: { name: 'papelería / Office Depot', unitCost: medium.id === 'laser-transparency' ? 180 : 320, currency: 'MXN' } },
      { why: `${plan.pages} página(s) por tira (${plan.segments.length} segmentos) más pruebas; el recubrimiento debe corresponder a la tecnología de la impresora`, forWhat: 'Película (prueba de escritorio)', alternative: 'Laboratorio: película fotográfica o fotolito para calidad óptica', evidence: 'estimated', need: 'requerido' },
    );
  } else {
    add(
      { id: `film-lab-${medium.id}`, name: `Servicio de laboratorio: ${medium.label}, tira de ${d.layout.totalLengthMm.toFixed(0)} × ${p.film.stripWidthMm} mm`, category: 'material', qty: 1, process: 'buy' },
      { why: 'Tono continuo, Dmax alto y estabilidad dimensional del poliéster', forWhat: 'Película final', alternative: 'Prueba previa en acetato de escritorio para validar movimiento y registro', evidence: 'unverified', need: 'requerido' },
    );
  }
  const lam = p.film.laminate;
  if (lam) {
    // largo de la tira (con dos tambores, también sus colas transparentes) más medio metro para el empalme y las pruebas
    const meters = (reels ? reels.filmToBuyM : d.layout.totalLengthMm / 1000 + 0.5).toFixed(1);
    add(
      { id: 'film-base-roll', name: `PET cristal de ${(lam.baseMm * 1000).toFixed(0)} µm o PVC rígido cristal calibre ${(lam.baseMm / 0.0254).toFixed(1).replace(/\.0$/, '')} (acetato), al menos ${meters} m por metro lineal`, category: 'material', qty: Math.ceil(Number(meters)), process: 'buy', supplier: { name: 'distribuidora de plásticos (por metro)', unitCost: 45, currency: 'MXN' } },
      { why: reels ? `Base continua: ${(d.layout.totalLengthMm / 1000).toFixed(2)} m de fotogramas y dos colas transparentes de ${(reels.design.tail1Mm / 1000).toFixed(2)} y ${(reels.design.tail2Mm / 1000).toFixed(2)} m que se fijan a los núcleos. Rígido: el "plástico cristal" flexible se estira y su plastificante ataca la pintura y el adhesivo` : 'Base continua de la tira, sin empalmes intermedios. Rígido: el "plástico cristal" flexible se estira y su plastificante ataca la pintura y el adhesivo', forWhat: 'Película laminada', alternative: 'Rollo de PVC rígido calibre 5 de 56 cm × 50 m (unos $1,140 en MercadoLibre, $23/m: alcanza para ocho tiras), o las hojas transparentes empalmadas a tope: la cubierta une los tramos', evidence: 'estimated', evidenceDate: '5-nov-2026', need: 'requerido' },
    );
    add(
      { id: 'film-cover', name: `Laminado en frío brillante de 75–80 µm con adhesivo acrílico, ${meters} m, pasado en laminadora de rodillos (servicio)`, category: 'material', qty: 1, process: 'buy', supplier: { name: 'tienda de rotulación o gran formato (Maxicopias: $170/m²)', url: 'https://maxicopias.com/lista-de-precios/', unitCost: Math.round(Number(meters) * 170), currency: 'MXN' } },
      { why: `Tapa la tinta: ${reels ? 'el brazo tensor toca la cubierta y no la pintura, y en el tambor cada vuelta apoya en la anterior' : 'los rodillos de la cara de la lente tocan la cubierta y no la pintura'}. Brillante, no mate: el mate vela la imagen. Cobran por m² con un metro de ancho mínimo: ${meters} m × 1 m × $170. Dejar reposar 72 h antes de enrollar para que se vaya el plateado (aire atrapado). La laca en aerosol no lo sustituye (ADR-0013)`, forWhat: 'Película laminada', alternative: 'Rollo de laminado brillante de 33 cm (MercadoLibre, $399 el par con uno mate) aplicado a mano con espátula; o segunda capa de la base con adhesivo de transferencia', evidence: 'estimated', evidenceDate: '5-nov-2026', need: 'requerido' },
    );
  }
  add(
    { id: 'splice-tape', name: 'Cinta de empalme transparente (poliéster, 19 mm) o cinta Scotch Magic', category: 'material', qty: 1, process: 'buy', supplier: { name: 'papelería', unitCost: 60, currency: 'MXN' } },
    { why: reels ? `${plan.segments.length - 1} empalme(s) entre segmentos, si no van sobre la base continua, y la punta de cada cola en la ranura de su núcleo. Sin loop no hay empalme de cierre` : `${Math.max(0, plan.segments.length - 1) + 1} empalme(s): ${plan.segments.length - 1} entre segmentos y 1 de cierre del loop`, forWhat: 'Ensamblaje de la tira', alternative: 'Empalmadora de cemento para película fotográfica', evidence: 'estimated', need: 'requerido' },
  );
  add(
    { id: 'screen', name: `Pantalla blanca mate ≥ ${(orep.imageWidthMm * 1.2).toFixed(0)} × ${(orep.imageHeightMm * 1.2).toFixed(0)} mm (foam board o tela)`, category: 'material', qty: 1, process: 'buy', supplier: { name: 'papelería', unitCost: 120, currency: 'MXN' } },
    { why: 'Superficie lambertiana de ganancia 1 (la del modelo)', forWhat: 'Proyección', alternative: 'Pantalla de ganancia 1,5 si la sala no se oscurece del todo', evidence: 'estimated', need: 'requerido' },
  );
}

export function buildBom(p: Project, d: Derived, date = new Date().toLocaleDateString('es-MX')): BomBundle {
  const { parts, notes } = buildParts(p, d);
  const lines = bomFromParts(parts);
  return { parts, lines, notes, markdown: bomMarkdown(lines, { title: `Lista de compras · ${p.name}`, date, notes, idPrefix: 'P' }), csv: bomCsv(lines) };
}
