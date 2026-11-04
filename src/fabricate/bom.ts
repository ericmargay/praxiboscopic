// Lista de materiales de la instalación física derivada del proyecto, con las convenciones de OMEGA
// (`@aminoacid/omega/parts` para las piezas, `@aminoacid/omega/fabricate` para la tabla en el formato de
// SHOPPING.md: qué, por qué, para qué, alternativa, costo · evidencia, link, necesidad). Los precios 🟢 de UNIT
// Electronics se leyeron el 2-nov-2026 en capturas de Eric o en fichas indexadas; la página de UNIT bloquea el acceso
// automático, así que hay que confirmarlos en el carrito. La comparativa con Amazon y MercadoLibre está en
// docs/COMPRAS-ELECTRONICA.md. Nada se compra sin abrir el link.
import { BEARINGS, type MotorModel } from '@aminoacid/omega/mech';
import { bomFromParts, type BomLine, type PartMeta } from '@aminoacid/omega/parts';
import { bomCsv, bomMarkdown, type ShoppingNotes } from '@aminoacid/omega/fabricate';
import type { Derived, Project } from '../core/project';
import { motorOf } from '../mech/transport';
import { mediumById } from '../optics/medium';
import { opticsReport } from '../optics/projector';
import { tilePlan } from '../film/print';
import { buildAssembly } from '../mech/assembly';

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

export interface BomBundle {
  parts: PartMeta[];
  lines: BomLine[];
  notes: Record<string, ShoppingNotes>;
  markdown: string;
  csv: string;
}

function motorPart(motor: MotorModel, transport: Project['transport']): { part: PartMeta; note: ShoppingNotes } {
  const unitMotor = motor.id === '17hs8401';
  const part: PartMeta = {
    id: `motor-${motor.id}`,
    name: `Motor ${motor.label}`,
    category: 'electronic',
    qty: 1,
    process: 'buy',
    dimsMm: { x: motor.body.wMm, y: motor.body.hMm, z: motor.body.lengthMm },
    massG: motor.massG,
    supplier: unitMotor ? unit('motor17hs8401') : motor.supplier ? { name: motor.supplier.name, url: motor.supplier.url, unitCost: motor.supplier.unitCost, currency: motor.supplier.currency } : { name: motor.source.title, url: motor.source.url },
    notes: motor.notes,
  };
  const note: ShoppingNotes = {
    why: `Un solo motor arrastra la película a ${transport.motorRpm.toFixed(0)} rpm con acoplamiento directo; los otros tres rodillos giran libres`,
    forWhat: 'Rodillo motriz del loop de película',
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
  const m = motorPart(motor, p.transport);
  add(m.part, m.note);

  // driver según el motor
  if (motor.type === 'stepper') {
    add(
      { id: 'driver-dm542', name: UNIT.dm542.label, category: 'electronic', qty: 1, process: 'buy', supplier: unit('dm542') },
      { why: 'Microstepping suave para reducir la vibración de la película; exige fuente de al menos 20 V', forWhat: 'Motor del transporte', alternative: 'TB6600 (MXN 140), más barato y con microstepping menos fino', evidence: 'read', evidenceDate: READ_DATE, need: 'requerido' },
    );
    add(
      { id: 'npn-s8050', name: `${UNIT.npn.label} (PUL y DIR de 3,3 V a las entradas de 5 V del driver)`, category: 'electronic', qty: 3, process: 'buy', supplier: unit('npn') },
      { why: 'Las entradas optoacopladas del DM542 esperan 5 V; el ESP32 da 3,3 V', forWhat: 'Señales al driver', alternative: 'Buffer 74HCT245', evidence: 'read', evidenceDate: READ_DATE, need: 'requerido' },
    );
    if (motor.body.wMm <= 43)
      add(
        { id: 'bracket-nema17', name: UNIT.bracket17.label, category: 'structural', qty: 1, process: 'buy', supplier: unit('bracket17') },
        { why: 'Fija el motor bajo la mesa alineado con el eje del rodillo motriz', forWhat: 'Montaje del motor', alternative: 'Soporte impreso en 3D', evidence: 'read', evidenceDate: READ_DATE, need: 'requerido' },
      );
  } else {
    add({ id: 'driver-hbridge', name: 'Driver puente H para motor DC (p. ej. TB6612 o BTS7960)', category: 'electronic', qty: 1, process: 'buy' }, { why: 'Control PWM del motor DC', forWhat: 'Motor del transporte', alternative: 'Servo continuo con su propio driver', evidence: 'unverified', need: 'requerido' });
  }

  // rodillos, rodamientos, ejes, acoplamiento
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

  // ventana y linterna
  add(
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
  add(
    { id: 'printed-supports', name: 'Piezas impresas: cuna de la lente, poste de la cabeza del LED, brazo del sensor y alojamiento del segundo 608 del motriz', category: 'mechanical', qty: 1, process: 'print3d', fabricate: { profile: 'mesh' } },
    { why: 'Fijan la lente a la distancia de enfoque, el LED detrás de la ventana, el sensor sobre el borde de la película y el eje motriz en dos rodamientos', forWhat: 'Óptica', alternative: 'Tubo de PVC y abrazaderas', evidence: 'estimated', need: 'taller' },
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
      { id: 'led-fuse', name: 'Fusible rápido de 500 mA con portafusible, antes de los capacitores', category: 'electronic', qty: 1, process: 'buy' },
      { why: 'Si el MOSFET queda en corto, corta antes de quemar el LED y la resistencia', forWhat: 'Seguridad', alternative: 'Fusible reajustable de corriente similar', evidence: 'unverified', need: 'requerido' },
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
    { why: 'Genera los pasos del motor y dispara el LED por interrupción del sensor, con temporizadores de hardware. Se programa con el IDE de Arduino', forWhat: 'Control', alternative: 'Arduino Nano', evidence: 'read', evidenceDate: READ_DATE, need: 'requerido' },
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
  add(
    { id: 'wire-18awg', name: UNIT_EST.wire.label, category: 'wiring', qty: 4, process: 'buy', supplier: unitEst('wire') },
    { why: 'Lleva 24 V y la corriente del LED; los jumpers delgados se quedan para las señales', forWhat: 'Cableado', alternative: 'Cable de bocina 2 × 18 AWG', evidence: 'estimated', need: 'requerido' },
  );
  if (p.film.syncMarks.enabled)
    add(
      { id: 'sensor-f249', name: `${UNIT.sensor.label} (la marca negra interrumpe el haz)`, category: 'electronic', qty: 2, process: 'buy', supplier: unit('sensor') },
      { why: 'Cada marca de fotograma dispara el destello: el error de diámetro o el patinaje ya no producen deriva. Probar con la tinta real: muchas son transparentes al infrarrojo', forWhat: 'Sincronía', alternative: 'Módulo KY-010', evidence: 'read', evidenceDate: READ_DATE, need: 'requerido' },
    );
  add(
    { id: 'psu-24v-5a', name: UNIT.psu24.label, category: 'electronic', qty: 1, process: 'buy', supplier: unit('psu24') },
    { why: 'Alimenta driver y LED; el DM542 no arranca con 12 V', forWhat: 'Alimentación', alternative: 'Mean Well LRS-75-24 (MXN 318), de mejor calidad', evidence: 'read', evidenceDate: READ_DATE, need: 'requerido' },
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
    // largo de la tira más medio metro para el empalme y las pruebas
    const meters = (d.layout.totalLengthMm / 1000 + 0.5).toFixed(1);
    add(
      { id: 'film-base-roll', name: `Rollo de PET cristal de ${(lam.baseMm * 1000).toFixed(0)} µm (o PVC rígido cristal calibre ${(lam.baseMm / 0.0254).toFixed(1).replace(/\.0$/, '')}) de al menos ${meters} m`, category: 'material', qty: 1, process: 'buy', supplier: { name: 'distribuidor de películas plásticas (PET cristal por micras)' } },
      { why: 'Base continua de la tira, sin empalmes intermedios. Rígido: el "plástico cristal" flexible se estira y su plastificante ataca la pintura y el adhesivo', forWhat: 'Película laminada', alternative: 'Las hojas transparentes empalmadas a tope: la cubierta une los tramos', evidence: 'unverified', need: 'requerido' },
    );
    add(
      { id: 'film-cover', name: `Laminado en frío brillante de 75–80 µm con adhesivo acrílico, ${meters} m, pasado en laminadora de rodillos`, category: 'material', qty: 1, process: 'buy', supplier: { name: 'tienda de rotulación o gran formato' } },
      { why: 'Tapa la tinta: los rodillos de la cara de la lente tocan la cubierta y no la pintura. Brillante, no mate: el mate vela la imagen. Pinta en una tira de unos 6 cm, deja curar, lamina y corta a la medida al final', forWhat: 'Película laminada', alternative: 'Segunda capa de la misma base pegada con adhesivo de transferencia acrílico transparente', evidence: 'unverified', need: 'requerido' },
    );
  }
  add(
    { id: 'splice-tape', name: 'Cinta de empalme transparente (poliéster, 19 mm) o cinta Scotch Magic', category: 'material', qty: 1, process: 'buy', supplier: { name: 'papelería', unitCost: 60, currency: 'MXN' } },
    { why: `${Math.max(0, plan.segments.length - 1) + 1} empalme(s): ${plan.segments.length - 1} entre segmentos y 1 de cierre del loop`, forWhat: 'Ensamblaje de la tira', alternative: 'Empalmadora de cemento para película fotográfica', evidence: 'estimated', need: 'requerido' },
  );
  add(
    { id: 'screen', name: `Pantalla blanca mate ≥ ${(orep.imageWidthMm * 1.2).toFixed(0)} × ${(orep.imageHeightMm * 1.2).toFixed(0)} mm (foam board o tela)`, category: 'material', qty: 1, process: 'buy', supplier: { name: 'papelería', unitCost: 120, currency: 'MXN' } },
    { why: 'Superficie lambertiana de ganancia 1 (la del modelo)', forWhat: 'Proyección', alternative: 'Pantalla de ganancia 1,5 si la sala no se oscurece del todo', evidence: 'estimated', need: 'requerido' },
  );
  return { parts, notes };
}

export function buildBom(p: Project, d: Derived, date = new Date().toLocaleDateString('es-MX')): BomBundle {
  const { parts, notes } = buildParts(p, d);
  const lines = bomFromParts(parts);
  return { parts, lines, notes, markdown: bomMarkdown(lines, { title: `Lista de compras · ${p.name}`, date, notes, idPrefix: 'P' }), csv: bomCsv(lines) };
}
