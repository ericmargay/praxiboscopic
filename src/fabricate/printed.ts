// Piezas impresas en 3D de la mesa de dos tambores (ADR-0012): sus medidas salen de `buildReelsAssembly` y su sólido
// se arma con manifold-3d, que solo carga scripts/fabricar.mjs (y las pruebas). En el navegador este módulo da los
// nombres, cantidades y el estimado de material para la lista de compras; la escena dibuja las piezas con sus
// propias primitivas a las mismas medidas.
//
// Cada sólido está ya en la orientación de impresión (z hacia arriba, apoyado en z = 0) y elegida para no necesitar
// soportes: voladizos de 45° como mucho y puentes cortos. Material: PETG (aguanta el roce y no se fatiga en los
// broches). Ajustes de presión pensados para boquilla de 0,4 mm: 608 en Ø22,05, ejes de 8 mm en Ø7,9 (a presión con
// epóxico) o Ø8,2 (holgado, pegado).
import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import type { Derived, Project } from '../core/project';
import { buildReelsAssembly, type ReelsAssembly } from '../mech/assembly';
import { hoodPins } from '../mech/structure';

export interface PrintedPart {
  /** código grabado en la lista y en el nombre del archivo */
  id: string;
  file: string;
  name: string;
  qty: number;
  role: string;
  step: number;
  /** orientación en la cama y notas para el laminador */
  print: string;
  /** volumen macizo aproximado (cm³) y fracción que llena el laminador con 3 perímetros y 20 % de relleno */
  solidCm3: number;
  fill: number;
  /** caja en la orientación de impresión (mm) */
  bboxMm: [number, number, number];
  build: (mf: ManifoldToplevel) => Manifold;
}

export const PETG_G_CM3 = 1.27;
/** gramos estimados de todas las copias de una pieza */
export const printedGrams = (p: PrintedPart): number => p.qty * p.solidCm3 * p.fill * PETG_G_CM3;

const tubeV = (ro: number, ri: number, h: number) => (Math.PI * (ro * ro - ri * ri) * h) / 1000;
const cylV = (r: number, h: number) => (Math.PI * r * r * h) / 1000;

/** primitivas en mm sobre manifold */
function kit(mf: ManifoldToplevel) {
  const { Manifold, CrossSection } = mf;
  const seg = (r: number) => Math.max(32, Math.min(256, Math.ceil((2 * Math.PI * r) / 1.0)));
  const cyl = (r: number, h: number, z0 = 0, x = 0, y = 0) => Manifold.cylinder(h, r, r, seg(r)).translate([x, y, z0]);
  const cone = (r0: number, r1: number, h: number, z0 = 0, x = 0, y = 0) => Manifold.cylinder(h, r0, r1, seg(Math.max(r0, r1))).translate([x, y, z0]);
  const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) => Manifold.cube([x1 - x0, y1 - y0, z1 - z0]).translate([x0, y0, z0]);
  /** sólido de revolución de un perfil (r, z) en sentido antihorario */
  const lathe = (pts: [number, number][]) => CrossSection.ofPolygons([pts]).revolve(seg(Math.max(...pts.map((q) => q[0]))));
  const union = (ms: Manifold[]) => Manifold.union(ms);
  return { Manifold, CrossSection, seg, cyl, cone, box, lathe, union };
}

export interface PrintedOptions {
  /** diámetro del barril de la lente que se consiga (mm) */
  lensDiameterMm?: number;
}

/** las piezas impresas de la mesa de dos tambores */
export function reelsPrintedParts(p: Project, d: Derived, opts: PrintedOptions = {}, a: ReelsAssembly = buildReelsAssembly(p, d)): PrintedPart[] {
  const gap = a.flangeHighY - a.flangeLowY;
  const deckT = a.base.deckT;
  const bossH = a.flangeLowY - a.deckBearingTopY;
  const coreRo = a.coreR;
  const coreRi = coreRo - 2;
  const R = a.R;
  const dR = a.dancerR;
  const seat = 22.05 / 2;
  const parts: PrintedPart[] = [];

  // --- I01 núcleo del tambor: anillo de 2 mm, alma arriba, cubo con boss que apoya en la pista interior del 608 -------
  parts.push({
    id: 'I01',
    file: 'I01-nucleo-tambor.stl',
    name: 'Núcleo del tambor',
    qty: 2,
    role: `La película se enrolla en él: Ø${(2 * coreRo).toFixed(1)} × ${gap} mm entre las bridas de acrílico. La cola entra por la ranura inclinada. El cubo se pega con epóxico al eje de 8 mm y su boss de Ø11,5 apoya en la pista interior del 608 de la cubierta`,
    step: 6,
    print: 'Boca abajo (el alma de 3 mm sobre la cama). Sin soportes. 3 perímetros, 20 % de relleno: el anillo de 2 mm sale macizo',
    solidCm3: tubeV(coreRo, coreRi, gap) + tubeV(coreRi, 11, 3) * 0.6 + tubeV(11, 4.1, gap) + tubeV(5.75, 4.1, bossH),
    fill: 0.92,
    bboxMm: [2 * coreRo, 2 * coreRo, gap + bossH],
    build: (mf) => {
      const k = kit(mf);
      const ring = k.cyl(coreRo, gap).subtract(k.cyl(coreRi, gap + 2, -1));
      let web = k.cyl(coreRi + 0.3, 3).subtract(k.cyl(10.7, 5, -1));
      for (let i = 0; i < 6; i++) web = web.subtract(k.cyl(10.5, 5, -1, 30 * Math.cos((i * Math.PI) / 3 + Math.PI / 6), 30 * Math.sin((i * Math.PI) / 3 + Math.PI / 6)));
      const hub = k.cyl(11, gap);
      const boss = k.cyl(5.75, bossH, gap);
      // ranura de la cola: 1,2 mm, a 30° de la tangente, de lado a lado del anillo
      const slit = k.box(-6, 6, -0.6, 0.6, -1, gap + 1).rotate([0, 0, 60]).translate([coreRo - 1, 0, 0]);
      return k.union([ring, web, hub, boss]).subtract(k.cyl(4.1, gap + bossH + 2, -1)).subtract(slit);
    },
  });

  // --- I02 cuerpo de guía --------------------------------------------------------------------------------------------
  const rollerProfile = (seatDepth: number): [number, number][] => [
    [seat, 0],
    [14, 0],
    [14, gap],
    [seat, gap],
    [seat, gap - seatDepth],
    [9, gap - seatDepth],
    [9, seatDepth + 2.025],
    [seat, seatDepth],
  ];
  parts.push({
    id: 'I02',
    file: 'I02-cuerpo-guia.stl',
    name: 'Cuerpo de guía',
    qty: 2,
    role: `Rodillo de Ø${2 * R} mm entre dos bridas de acrílico: gira libre en dos 608ZZ sobre un eje fijo de 8 mm y toca la cara de la lámpara`,
    step: 7,
    print: 'De pie, con el alma sobre la cama. Sin soportes. El asiento de abajo termina en cono de 45°',
    solidCm3: tubeV(R, R - 2, gap) + tubeV(R - 2, 14, 3) * 0.8 + tubeV(14, 9, gap),
    fill: 0.85,
    bboxMm: [2 * R, 2 * R, gap],
    build: (mf) => {
      const k = kit(mf);
      const shell = k.cyl(R, gap).subtract(k.cyl(R - 2, gap + 2, -1));
      let web = k.cyl(R - 1.7, 3).subtract(k.cyl(13.7, 5, -1));
      for (let i = 0; i < 6; i++) web = web.subtract(k.cyl(3.5, 5, -1, 21 * Math.cos((i * Math.PI) / 3), 21 * Math.sin((i * Math.PI) / 3)));
      const sleeve = k.lathe(rollerProfile(3.6));
      return k.union([shell, web, sleeve]);
    },
  });

  // --- I03 cuerpo del rodillo tensor: centro rebajado 0,5 mm, solo apoya en los márgenes -----------------------------
  parts.push({
    id: 'I03',
    file: 'I03-cuerpo-rodillo-tensor.stl',
    name: 'Cuerpo del rodillo tensor',
    qty: 1,
    role: `Rodillo de Ø${2 * dR} mm del brazo tensor: toca la cara de la cubierta solo por los márgenes (el centro va 0,5 mm rebajado). Gira en dos 608ZZ`,
    step: 7,
    print: 'De pie. Sin soportes: la cavidad interior cierra con conos de 45°',
    solidCm3: tubeV(dR, 15, gap) + tubeV(15, 9, 14),
    fill: 0.7,
    bboxMm: [2 * dR, 2 * dR, gap],
    build: (mf) => {
      const k = kit(mf);
      return k.lathe([
        [seat, 0],
        [dR, 0],
        [dR, 5.5],
        [dR - 0.5, 5.5],
        [dR - 0.5, gap - 5.5],
        [dR, gap - 5.5],
        [dR, gap],
        [seat, gap],
        [seat, gap - 4],
        [9, gap - 4],
        [9, gap - 7],
        [15, gap - 13],
        [15, 13],
        [9, 7],
        [9, 6.025],
        [seat, 4],
      ]);
    },
  });

  // --- I04 brazo del tensor: cubo en el eje del pivote, casquillo del eje del rodillo, barreno del resorte -----------
  const armT = a.pivotStack.armY[1] - a.pivotStack.armY[0];
  const sockH = a.pivotStack.bossTopY - a.pivotStack.armY[0];
  const L = a.armMm;
  parts.push({
    id: 'I04',
    file: 'I04-brazo-tensor.stl',
    name: 'Brazo del tensor',
    qty: 1,
    role: `Brazo de ${L.toFixed(1)} mm que gira dentro del hueco de la cubierta: se pega con epóxico al eje del pivote, el eje del rodillo entra a presión en su casquillo (que sube hasta y = ${a.pivotStack.bossTopY} mm y sostiene el 608 de abajo del rodillo) y el resorte se engancha en el barreno de en medio`,
    step: 7,
    print: 'Plano, sobre la cama. Sin soportes',
    solidCm3: ((Math.PI * 64 + L * 14) * armT) / 1000 + cylV(6, sockH - armT),
    fill: 0.75,
    bboxMm: [L + 14, 16, sockH],
    build: (mf) => {
      const k = kit(mf);
      const plate = k.CrossSection.hull([k.CrossSection.circle(8, 64), k.CrossSection.circle(6, 48).translate([L, 0])]).extrude(armT);
      const socket = k.cyl(6, sockH, 0, L, 0);
      return k
        .union([plate, socket])
        .subtract(k.cyl(4.1, sockH + 2, -1))
        .subtract(k.cyl(3.95, sockH + 2, -1, L, 0))
        .subtract(k.cyl(1.25, armT + 2, -1, L / 2, 0));
    },
  });

  // --- I05 copa del pivote: sostiene el 608 de la cubierta por abajo, lleva el segundo 608 y el AS5600 -------------
  const cupH = a.pivotStack.cupY[1] - a.pivotStack.cupY[0];
  const zOf = (y: number) => y - a.pivotStack.cupY[0];
  const lbz0 = zOf(a.pivotStack.lowerBearingY[0]);
  const lbz1 = zOf(a.pivotStack.lowerBearingY[1]);
  const boardZ = zOf(a.as5600.y) - 1.6;
  parts.push({
    id: 'I05',
    file: 'I05-copa-pivote.stl',
    name: 'Copa del pivote',
    qty: 1,
    role: 'Se pega bajo la contracubierta con sus tres espigas: su cara de arriba sostiene el 608 de arriba del pivote, adentro lleva el segundo 608 (entra por abajo antes que el sensor) y abajo la ranura del AS5600, a 1,5 mm del imán',
    step: 5,
    print: 'De pie, con la base cuadrada sobre la cama y las espigas hacia arriba. Sin soportes (la ranura del sensor es un puente de 23 mm)',
    solidCm3: tubeV(13.5, 10.5, cupH) + (31 * 31 * 6) / 1000 * 0.4,
    fill: 0.8,
    bboxMm: [31, 31, cupH + 5],
    build: (mf) => {
      const k = kit(mf);
      // marco de impresión: x = x de la mesa, y = −z de la mesa, z = y de la mesa − fondo de la copa
      const body = k.cyl(13.5, cupH);
      const block = k.box(-17.5, 13.5, -15.5, 15.5, 0, 6);
      const pegs = [Math.PI / 2, Math.PI, -Math.PI / 2].map((t) => ({ x: 15 * Math.cos(t), y: -15 * Math.sin(t) }));
      // orejas con la cara de abajo inclinada (menos de 45° desde la vertical): no necesitan soporte
      const ears = pegs.map((q) => k.Manifold.hull([k.cyl(5, 4, cupH - 4, q.x, q.y), k.cyl(5, 4, cupH - 4, q.x * 0.5, q.y * 0.5), k.cyl(3, 0.5, cupH - 18, q.x * 0.3, q.y * 0.3)]));
      const pins = pegs.map((q) => k.cyl(2.4, 5, cupH, q.x, q.y));
      const cavity = k.lathe([
        [0, -1],
        [11.6, -1],
        [11.6, lbz0],
        [seat, lbz0],
        [seat, lbz1],
        [9.75, lbz1 + 1.275],
        [9.75, lbz1 + 2],
        [10, lbz1 + 2],
        [10, cupH + 1],
        [0, cupH + 1],
      ]);
      const slot = k.box(-25, 11.7, -11.7, 11.7, boardZ, boardZ + 1.7);
      return k.union([body, block, ...ears, ...pins]).subtract(cavity).subtract(slot);
    },
  });

  // --- I06 tapa del imán -----------------------------------------------------------------------------------------------
  parts.push({
    id: 'I06',
    file: 'I06-tapa-iman.stl',
    name: 'Tapa del imán',
    qty: 1,
    role: 'Entra a presión (y con epóxico) en la punta de abajo del eje del pivote; el imán diametral del AS5600 va pegado en su cara de abajo, en el eje',
    step: 7,
    print: 'De pie, con la cara del imán sobre la cama. Sin soportes',
    solidCm3: cylV(7, 7.5) - cylV(3.1, 2.6) - cylV(3.95, 4.1),
    fill: 0.8,
    bboxMm: [14, 14, 7.5],
    build: (mf) => {
      const k = kit(mf);
      return k.cyl(7, 7.5).subtract(k.cyl(3.1, 3.6, -1)).subtract(k.cyl(3.95, 5, 3.4));
    },
  });

  // --- I07 tapón de eje ------------------------------------------------------------------------------------------------
  parts.push({
    id: 'I07',
    file: 'I07-tapon-eje.stl',
    name: 'Tapón de eje',
    qty: 3,
    role: 'Tapa la punta de los ejes fijos (dos guías y el rodillo tensor): su anillo de abajo toca solo la pista interior del 608 y no deja que el rodillo se salga',
    step: 7,
    print: 'Boca abajo (cara de arriba sobre la cama). Sin soportes',
    solidCm3: cylV(7, 6),
    fill: 0.8,
    bboxMm: [14, 14, 6.6],
    build: (mf) => {
      const k = kit(mf);
      return k.union([k.cyl(7, 6), k.cyl(5.5, 0.6, 6)]).subtract(k.cyl(3.95, 6, 1.5));
    },
  });

  // --- I08 y I09 postes de las tapas -------------------------------------------------------------------------------------
  const coverY = a.covers[0].y;
  const postTop = deckT + coverY;
  parts.push({
    id: 'I08',
    file: 'I08-poste-tapa.stl',
    name: 'Poste de tapa',
    qty: 2 * (a.covers[0].posts.length - 1),
    role: `Cuatro: su espiga entra ${deckT} mm en la cubierta (con epóxico) y el broche partido de arriba se abrocha en la tapa de acrílico, ${coverY} mm sobre la cubierta`,
    step: 9,
    print: 'De pie, espiga abajo. Sin soportes. El broche necesita PETG (el PLA se rompe)',
    solidCm3: cylV(4, deckT) + cylV(a.postR, coverY) + cylV(3, 4.6),
    fill: 0.75,
    bboxMm: [2 * a.postR, 2 * a.postR, postTop + 4.6],
    build: (mf) => {
      const k = kit(mf);
      const pr = a.postR;
      const solid = k.union([k.cyl(4, deckT), k.cone(4, pr, pr - 4, deckT), k.cyl(pr, coverY - (pr - 4), deckT + pr - 4), k.cyl(3, 3, postTop), k.cone(3.6, 2.6, 1.6, postTop + 3)]);
      return solid.subtract(k.box(-0.7, 0.7, -8, 8, postTop - 3, postTop + 6));
    },
  });
  const hr = a.hollowPostR;
  parts.push({
    id: 'I09',
    file: 'I09-poste-hueco.stl',
    name: 'Poste hueco',
    qty: 2,
    role: 'Dos: por dentro (Ø9) bajan los cables del sensor de mano hasta la base. Su tubo de abajo entra en la cubierta y el de arriba se abrocha en la tapa',
    step: 9,
    print: 'De pie, tubo abajo. Sin soportes',
    solidCm3: tubeV(6, 4.5, deckT) + tubeV(hr, 4.5, coverY) + tubeV(5.5, 4.5, 4.2),
    fill: 0.9,
    bboxMm: [2 * hr, 2 * hr, postTop + 4.2],
    build: (mf) => {
      const k = kit(mf);
      const solid = k.union([k.cyl(6, deckT), k.cone(6, hr, hr - 6, deckT), k.cyl(hr, coverY - (hr - 6), deckT + hr - 6), k.cyl(5.5, 3, postTop), k.cone(6.2, 5.5, 1.2, postTop + 3)]);
      return solid.subtract(k.cyl(4.5, postTop + 10, -1)).subtract(k.box(-0.7, 0.7, -9, 9, postTop - 3, postTop + 6));
    },
  });

  // --- I10 capuchón del sensor de mano con su canal -------------------------------------------------------------------
  const postAt = Math.hypot(a.covers[0].posts[0].x - a.covers[0].x, a.covers[0].posts[0].y - a.covers[0].z);
  const pins = hoodPins(0);
  parts.push({
    id: 'I10',
    file: 'I10-capuchon-sensor.stl',
    name: 'Capuchón del sensor con canal',
    qty: 2,
    role: 'Tapa la placa del VL53L4CD sobre la tapa de acrílico y deja una ventana de Ø8 sobre el sensor; su canal cubre los cables hasta el poste hueco. Dos broches del lado de atrás y la punta del canal sobre el broche del poste',
    step: 10,
    print: 'Boca abajo (techo sobre la cama): sin soportes ni puentes',
    solidCm3: (34 * 34 * 1.6 + 4 * 34 * 6.4 * 1.6 + (postAt - 17) * (19 * 1.6 + 2 * 6.4 * 1.6)) / 1000,
    fill: 1,
    bboxMm: [postAt + 9.5 + 17, 34, 12.2],
    build: (mf) => {
      const k = kit(mf);
      const h = 8;
      // la placa (25,4 mm) entra justa en la cavidad de 26; la cavidad abre hacia el canal para la tira de pines y los dupont
      const hood = k.box(-17, 17, -17, 17, 0, h).subtract(k.box(-13, 13, -13, 13, 1.6, h + 1)).subtract(k.box(10, 18, -7.9, 7.9, 1.6, h + 1));
      const canal = k.box(13, postAt + 9.5, -9.5, 9.5, 0, h).subtract(k.box(12, postAt + 7.9, -7.9, 7.9, 1.6, h + 1));
      const win = k.cyl(4, 4, -1);
      const snaps = pins.map((q) => k.union([k.cyl(2, 3, h, q.x, q.y), k.cone(2.5, 1.6, 1.2, h + 3, q.x, q.y)]).subtract(k.box(q.x - 0.5, q.x + 0.5, q.y - 3, q.y + 3, h + 1, h + 5)));
      return k.union([hood, canal, ...snaps]).subtract(win);
    },
  });

  // --- I11 cabeza del LED y I12 tubo del condensador ------------------------------------------------------------------
  const fm = a.filmMid;
  parts.push({
    id: 'I11',
    file: 'I11-cabeza-led.stl',
    name: 'Cabeza del LED',
    qty: 1,
    role: 'Detrás de la placa de la ventana: el disipador de 40 × 40 entra entre sus paredes con el LED pegado al frente, y el tubo del condensador descansa en dos cunas donde se corre para ajustar la luz. Va a la cubierta con dos espigas I16',
    step: 8,
    print: 'Con la base sobre la cama. Sin soportes',
    solidCm3: (52 * 54 * 4 + 2 * 24 * 26 * 4 + 2 * (52 * 26 - (Math.PI * 22.2 * 22.2) / 2) * 4) / 1000,
    fill: 0.6,
    bboxMm: [52, 54, 30],
    build: (mf) => {
      const k = kit(mf);
      // marco de impresión: x = x de la mesa, y = −z de la mesa (+ hacia atrás), z = y de la mesa
      const base = k.box(-26, 26, 8, 62, 0, 4);
      const ledge = k.box(-20.4, 20.4, 34, 58, 4, 6);
      const walls = [-1, 1].map((s) => k.box(s > 0 ? 20.4 : -24.4, s > 0 ? 24.4 : -20.4, 34, 58, 4, 30));
      const stop = k.box(-24.4, 24.4, 58, 60, 4, 20);
      const cradles = [11, 27].map((yc) => k.box(-26, 26, yc - 2, yc + 2, 0, fm).subtract(k.cyl(22.2, 8, -4).rotate([90, 0, 0]).translate([0, yc, fm])));
      const holes = [-18, 18].map((dx) => k.cyl(3.1, 8, -2, dx, 50));
      return k.union([base, ledge, ...walls, stop, ...cradles]).subtract(k.union(holes));
    },
  });
  parts.push({
    id: 'I12',
    file: 'I12-tubo-condensador.stl',
    name: 'Tubo del condensador',
    qty: 1,
    role: 'Lleva las dos lentes plano-convexas de Ø40 con las caras curvas juntas, separadas por un reborde; se pegan con una gota de silicón en la orilla',
    step: 8,
    print: 'De pie. Sin soportes (el reborde tiene conos de 45°)',
    solidCm3: tubeV(22, 20.2, 20) + tubeV(20.2, 18.5, 3),
    fill: 1,
    bboxMm: [44, 44, 20],
    build: (mf) => {
      const k = kit(mf);
      return k.lathe([
        [20.2, 0],
        [22, 0],
        [22, 20],
        [20.2, 20],
        [20.2, 12.7],
        [18.5, 11],
        [18.5, 10],
        [20.2, 8.3],
      ]);
    },
  });

  // --- I13 cuna de la lente ---------------------------------------------------------------------------------------------
  const lensR = (opts.lensDiameterMm ?? 64) / 2 + 0.2;
  const zF = a.base.z1;
  const lensMount = p.optics.filmToLensMm - 5;
  parts.push({
    id: 'I13',
    file: 'I13-cuna-lente.stl',
    name: 'Cuna de la lente',
    qty: 1,
    role: `Se cuelga del frente: su ceja apoya en la cubierta con dos espigas I16 que corren en las ranuras (±3 mm para enfocar) y el barril de Ø${(2 * lensR - 0.4).toFixed(0)} mm descansa en dos cunas; una liga o un cincho de velcro por sus ranuras lo sujeta`,
    step: 8,
    print: 'De lado (el costado de 80 mm sobre la cama): todo es extrusión salvo las cunas, que cierran a 45°',
    solidCm3: (80 * 23 * 4 + 80 * 44 * 4 + 64 * 70 * 4 + 2 * 64 * 30 * 4) / 1000,
    fill: 0.55,
    bboxMm: [44 + 70, 80, 80],
    build: (mf) => {
      const k = kit(mf);
      // en coordenadas de la mesa; al final se acuesta para imprimir (x de la mesa → z)
      const hook = k.box(-40, 40, 0, 4, 6, zF + 4);
      const drop = k.box(-40, 40, -40, 4, zF, zF + 4);
      const shelf = k.box(-32, 32, -40, -36, zF, zF + 70);
      const saddles = [lensMount + 6, lensMount + 30].map((zc) => k.box(-32, 32, -36, fm - 8, zc - 2, zc + 2).subtract(k.cyl(lensR, 8, zc - 4).translate([0, fm, 0])));
      const dowels = a.lensPegs.map((q) => k.cyl(3.1, 8, -2).rotate([90, 0, 0]).translate([q.x - a.gate.x, 6, q.y]));
      const straps = [-1, 1].map((s) => k.box(s * 32 - 2, s * 32 + 2, -41, -35, zF + 30, zF + 50));
      const solid = k.union([hook, drop, shelf, ...saddles]).subtract(k.union([...dowels, ...straps]));
      return solid.rotate([0, -90, 0]).translate([0, 0, 40]);
    },
  });

  // --- I14 brazo del sensor de marcas ----------------------------------------------------------------------------------
  const peg = a.f249Peg;
  const yTop = a.sensor.mouthY + 18;
  parts.push({
    id: 'I14',
    file: 'I14-brazo-sensor-marcas.stl',
    name: 'Brazo del sensor de marcas',
    qty: 1,
    role: 'Sostiene el F249 sobre el borde de arriba de la película, un fotograma antes de la ventana: la horquilla abraza el borde y el haz cruza la marca. Su espiga cuadrada entra en la cubierta; el F249 va amarrado con un cincho',
    step: 8,
    print: 'De lado (perfil en L sobre la cama). Sin soportes',
    solidCm3: (5.8 * 5.8 * deckT + 64 * yTop + 6 * 8 * 32) / 1000,
    fill: 0.85,
    bboxMm: [yTop + deckT, 34, 8],
    build: (mf) => {
      const k = kit(mf);
      const px = 0;
      const pz = 0;
      const toFilm = a.gate.z - peg.y;
      const pg = k.box(px - 2.9, px + 2.9, -deckT, 0, pz - 2.9, pz + 2.9);
      const post = k.box(px - 4, px + 4, 0, yTop, pz - 4, pz + 4);
      const arm = k.box(px - 4, px + 4, yTop - 6, yTop, pz - 4, toFilm + 8);
      const ties = [toFilm - 4, toFilm + 4].map((zz) => k.cyl(1.6, 12, -6).rotate([0, 90, 0]).translate([0, yTop - 3, zz]));
      return k.union([pg, post, arm]).subtract(k.union(ties)).rotate([0, -90, 0]).translate([0, 0, 4]);
    },
  });

  // --- I15 ancla del resorte e I16 espigas -----------------------------------------------------------------------------
  const L5 = a.base.layerT;
  parts.push({
    id: 'I15',
    file: 'I15-ancla-resorte.stl',
    name: 'Ancla del resorte',
    qty: 1,
    role: 'Su espiga entra en el piso del hueco del brazo tensor; el resorte se engancha en su cuello y jala el brazo hacia la película',
    step: 7,
    print: 'Cabeza abajo. Sin soportes',
    solidCm3: cylV(4, 4) + cylV(2.4, L5),
    fill: 0.9,
    bboxMm: [8, 8, 4 + L5],
    build: (mf) => {
      const k = kit(mf);
      return k.union([k.cyl(4, 4), k.cyl(2.4, L5, 4)]).subtract(k.cyl(5, 1.2, 1.5).subtract(k.cyl(2.5, 2, 1)));
    },
  });
  parts.push({
    id: 'I16',
    file: 'I16-espiga.stl',
    name: 'Espiga Ø5,8 × 18',
    qty: 4,
    role: 'Dos unen la cabeza del LED con la cubierta (pegadas) y dos corren en las ranuras de la cuna de la lente (pegadas solo a la cuna)',
    step: 8,
    print: 'De pie. Varias a la vez',
    solidCm3: cylV(2.9, 18),
    fill: 0.9,
    bboxMm: [5.8, 5.8, 18],
    build: (mf) => kit(mf).cyl(2.9, 18),
  });
  return parts;
}

/** gramos y piezas de toda la impresión */
export function printedTotals(parts: PrintedPart[]): { pieces: number; grams: number } {
  return { pieces: parts.reduce((s, p) => s + p.qty, 0), grams: parts.reduce((s, p) => s + printedGrams(p), 0) };
}
