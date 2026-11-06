// Ensamble físico de la obra en milímetros: dónde va cada pieza real (base, motor, electrónica de potencia dentro de
// la base, caja de control sobre los rodillos, cabeza del LED, sensor y lente) y qué choca con qué. Es puro: lo usan la
// escena 3D, la lista de compras y las pruebas. Plano de la mesa = (x, z) con z = y del recorrido; y hacia arriba con la
// cara superior de la cubierta en y = 0. Ver ADR-0007.
import type { Derived, Project } from '../core/project';
import { pointAt, type Vec2 } from './path';

/** altura de la cinta sobre la cubierta (mm) */
export const FILM_LIFT = 6;

export interface Rect {
  id: string;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  y0: number;
  y1: number;
}

export interface Assembly {
  R: number;
  rollerBodyH: number;
  filmBottom: number;
  filmTop: number;
  filmMid: number;
  base: { x0: number; x1: number; z0: number; z1: number; deckT: number; wallT: number; floorT: number; innerH: number; floorTop: number; bottom: number };
  /**
   * motor colgado bajo el rodillo motriz con acoplamiento directo. El eje del motriz gira en dos 608: uno en la cubierta
   * y otro en un alojamiento impreso bajo ella (`housingY`); el soporte en L cuelga de ese alojamiento
   */
  motor: { x: number; z: number; faceY: number; couplingY: number; housingY: number };
  psu: { x: number; z: number };
  dm542: { x: number; z: number };
  bucks: { x: number; z: number; volts: number }[];
  fuse: { x: number; z: number };
  /** caja de control de acrílico sobre los rodillos */
  box: { x: number; z: number; w: number; d: number; h: number; y: number };
  standoffs: Vec2[];
  /** paso de cables de la base a la caja (agujero en la cubierta y en el piso de la caja) */
  bundle: Vec2;
  /** cabeza del LED en el marco de la ventana: distancias detrás de la película (mm) */
  ledHead: { condenserFront: number; ledBack: number; heatsinkFront: number; depth: number; width: number };
  /** el sensor lee la marca un paso antes de la ventana: equivale a leer la del fotograma que está en ella */
  sensor: { sMm: number; mouthY: number; beamY: number };
  /** cajas de ocupación para comprobar choques */
  volumes: Rect[];
}

const rect = (id: string, cx: number, cz: number, w: number, d: number, y0: number, y1: number): Rect => ({ id, x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2, y0, y1 });

export function buildAssembly(p: Project, d: Derived): Assembly {
  const R = d.pathSpec.rollerRadiusMm;
  const rollerBodyH = p.film.stripWidthMm + 10;
  const filmBottom = FILM_LIFT;
  const filmTop = FILM_LIFT + p.film.stripWidthMm;
  const rollers = d.pathSpec.rollers;

  // base: envuelve los rodillos (con pestañas) con 12 mm de margen. La lente (Ø64) no cabe sobre la cubierta porque el
  // centro de la película está a 26 mm: cuelga fuera del borde en una cuna impresa atornillada a la pared frontal
  const margin = 12;
  const xs = [...rollers.map((r) => r.x - R - 2), ...rollers.map((r) => r.x + R + 2)];
  const zs = [...rollers.map((r) => r.y - R - 2), ...rollers.map((r) => r.y + R + 2)];
  const deckT = 9;
  const wallT = 6;
  const floorT = 6;
  const innerH = 110;
  const base = { x0: Math.min(...xs) - margin, x1: Math.max(...xs) + margin, z0: Math.min(...zs) - margin, z1: Math.max(...zs) + margin, deckT, wallT, floorT, innerH, floorTop: -deckT - innerH, bottom: -deckT - innerH - floorT };

  const drive = rollers[d.pathSpec.driveRoller] ?? rollers[0];
  const motor = { x: drive.x, z: drive.y, faceY: -68, couplingY: -44, housingY: -27 };

  // electrónica de potencia sobre el piso de la base: fuente atrás, driver adelante a la derecha, reguladores al frente
  const inX0 = base.x0 + wallT + 4;
  const inX1 = base.x1 - wallT - 4;
  const inZ0 = base.z0 + wallT + 4;
  const inZ1 = base.z1 - wallT - 4;
  const psu = { x: (inX0 + inX1) / 2, z: inZ0 + 49 };
  // 132 × 92 mm contando pestañas y bornes: en la esquina frontal derecha
  const dm542 = { x: inX1 - 66, z: inZ1 - 46 };
  // reguladores y fusible entre el motor y el driver, delante de la fuente
  const midX = (drive.x + 24.5 + dm542.x - 66) / 2;
  const front0 = psu.z + 49 + 6;
  const bucks = [
    { x: midX, z: front0 + 12, volts: 5 },
    { x: midX, z: front0 + 40, volts: 12 },
  ];
  const fuse = { x: midX, z: front0 + 68 };

  // caja de control: encima de los rodillos, centrada en el loop
  const cx = rollers.reduce((a, r) => a + r.x, 0) / rollers.length;
  const cz = rollers.reduce((a, r) => a + r.y, 0) / rollers.length;
  const box = { x: cx, z: cz, w: 190, d: 140, h: 48, y: 80 };
  const standoffs = [-1, 1].flatMap((sx) => [-1, 1].map((sz) => ({ x: cx + sx * 20, y: cz + sz * 40 })));
  const bundle = { x: cx, y: cz };

  const ledHead = { condenserFront: 3, ledBack: 36, heatsinkFront: 36, depth: 56, width: 44 };
  // boca de la horquilla: la película entra 5,5 mm; el haz queda a 2,6 mm de la boca, ~2,9 mm bajo el borde
  const mouthY = filmTop - 5.5;
  const sensor = { sMm: d.pathSpec.gateMm - p.film.pitchMm, mouthY, beamY: mouthY + 2.6 };

  const volumes: Rect[] = [
    rect('motor', motor.x, motor.z, 49, 49, motor.faceY - 48, -deckT),
    rect('bundle', cx, cz, 16, 16, -30, -deckT),
    rect('psu', psu.x, psu.z, 199, 98, base.floorTop, base.floorTop + 42),
    rect('dm542', dm542.x, dm542.z, 132, 92, base.floorTop, base.floorTop + 34),
    ...bucks.map((b, i) => rect(`buck${i}`, b.x, b.z, 43, 21, base.floorTop, base.floorTop + 16)),
    rect('fuse', fuse.x, fuse.z, 30, 14, base.floorTop, base.floorTop + 14),
  ];
  return { R, rollerBodyH, filmBottom, filmTop, filmMid: (filmBottom + filmTop) / 2, base, motor, psu, dm542, bucks, fuse, box, standoffs, bundle, ledHead, sensor, volumes };
}

/**
 * Mesa de dos tambores (ADR-0011, armada sin tornillos según ADR-0012): los tambores atrás, cada uno sobre su NEMA 17;
 * las guías y la ventana al frente; el brazo tensor entre el tambor 2 y su guía, con el AS5600 bajo la cubierta; una
 * tapa fija sobre cada tambor con el sensor de mano encima. Las manos necesitan el espacio sobre los tambores, así que
 * la electrónica baja a la base: la fuente de pie contra la tapa trasera, un DM542 delante de cada motor y la
 * protoboard con el ESP32 al centro.
 *
 * Desde ADR-0012 la caja es de MDF de 6 mm cortado con láser y ensamblado con dientes: la cubierta son dos capas (la de
 * arriba lleva los rodamientos y la de abajo les hace tope), cada motor se para en el piso dentro de una torre que
 * también sostiene el segundo rodamiento de su tambor, y el brazo tensor gira en un hueco de la capa de arriba.
 */
export interface ReelsAssembly {
  /** radio de las guías y alto de su cuerpo (como los rodillos del loop) */
  R: number;
  rollerBodyH: number;
  filmBottom: number;
  filmTop: number;
  filmMid: number;
  /** `deckT` = dos capas de `layerT`; `mdfT` es el espesor de todo el MDF */
  base: Assembly['base'] & { layerT: number; mdfT: number };
  /** tambor 1 (−x) y tambor 2 (+x) */
  reels: Vec2[];
  coreR: number;
  flangeR: number;
  /** bridas de acrílico de 3 mm */
  flangeT: number;
  /** caras de las bridas: la de abajo termina y la de arriba empieza (y) */
  flangeLowY: number;
  flangeHighY: number;
  /** cara de arriba de los 608 de la cubierta: el cubo del tambor apoya ahí, en la pista interior */
  deckBearingTopY: number;
  /**
   * motores parados en el piso, dentro de su torre: cara del motor, cople (centro y alto), extremo de abajo del eje del
   * tambor y la placa del segundo 608
   */
  motor: { x: number; z: number; faceY: number; couplingY: number; couplingH: number; reelShaftBottomY: number; bearingPlateY: [number, number] };
  /** torre de cada motor: dos costados (centro x) y dos placas (collar del motor y segundo rodamiento) */
  towers: { x: number; z: number; sideX: [number, number]; z0: number; z1: number; collarY: [number, number]; bearingY: [number, number] }[];
  guides: Vec2[];
  dancer: Vec2;
  pivot: Vec2;
  armMm: number;
  dancerR: number;
  /** pila del pivote: brazo dentro del hueco de la capa de arriba, copa impresa debajo con el segundo 608 y el AS5600 */
  pivotStack: { armY: [number, number]; bossTopY: number; upperBearingY: [number, number]; lowerBearingY: [number, number]; magnetFaceY: number; cupY: [number, number]; anchor: Vec2; hook: Vec2; pocket: Vec2[] };
  /** tapas sobre los tambores, con sus tres postes (`hollow` = el que lleva los cables), y la cara del sensor de mano (y) */
  covers: { x: number; z: number; y: number; r: number; posts: Vec2[]; hollow: number }[];
  postR: number;
  hollowPostR: number;
  sensorFaceY: number;
  psu: { x: number; z: number };
  /** marco de MDF delante de la fuente y topes a los lados */
  psuFrame: { x0: number; x1: number; z0: number; z1: number };
  psuStops: Vec2[];
  dm542: { x: number; z: number; rotY: number }[];
  bucks: Assembly['bucks'];
  fuse: Assembly['fuse'];
  breadboard: Vec2;
  expansion: Vec2;
  res10: Vec2;
  as5600: { x: number; z: number; y: number };
  /** paso de cables a la cabeza del LED y al sensor de marcas */
  bundle: Vec2;
  ledHead: Assembly['ledHead'];
  sensor: Assembly['sensor'];
  /** placa de la ventana (acrílico negro) con sus guías, en una ranura de la cubierta; z de sus caras */
  gate: { x: number; z: number; plateZ: [number, number]; railZ: [number, number] };
  /** espigas de la cabeza del LED, del brazo del sensor de marcas y de la cuna de la lente (centros en la cubierta) */
  ledPegs: Vec2[];
  f249Peg: Vec2;
  lensPegs: Vec2[];
  volumes: Rect[];
}

/** espesor del MDF que se consigue en México (Trupan, Arauco): el «de 6» mide 5,5 mm */
export const MDF_MM = 5.5;

export function buildReelsAssembly(p: Project, d: Derived, opts: { mdfMm?: number } = {}): ReelsAssembly {
  const r = d.reels!;
  const g = r.design.geometry;
  const filmBottom = FILM_LIFT;
  const filmTop = FILM_LIFT + p.film.stripWidthMm;
  const flangeT = 3;
  // bridas a 1 mm de los bordes de la película: el tambor la guía sin dejarla subir
  const flangeLowY = filmBottom - 1;
  const flangeHighY = filmTop + 1;
  const reels = [g.reel1, g.reel2];
  // dientes y ranuras se dibujan con el espesor real del MDF (se mide con vernier antes de cortar)
  const mdfT = opts.mdfMm ?? MDF_MM;
  const layerT = mdfT;
  const deckT = 2 * layerT;
  const wallT = mdfT;
  const floorT = mdfT;
  const innerH = 125 - deckT - floorT;
  const margin = 12;
  // a la derecha manda el pivote: su 608 (Ø22) necesita 3 mm de MDF antes de los dientes de la pared
  const x1 = Math.max(g.reel2.x + g.flangeR + 10, g.dancer.x + g.dancerR + 12, g.pivot.x + 14 + mdfT);
  const floorTop = -deckT - innerH;
  const base = { x0: -x1, x1, z0: Math.min(...reels.map((q) => q.y)) - g.flangeR - margin, z1: 25, deckT, wallT, floorT, innerH, floorTop, bottom: floorTop - floorT, layerT, mdfT };
  // el 608 de la cubierta va en la capa de arriba (6 mm) y sobresale 1 mm; la de abajo le hace tope
  const deckBearingTopY = 7 - layerT;
  // el motor se para en el piso; el cople toma 13 mm del eje del motor y 11 del eje del tambor
  const faceY = floorTop + 48;
  const couplingH = 25;
  const couplingY = faceY + 2 + 9 + couplingH / 2 - 1;
  const bearingPlateY: [number, number] = [couplingY + couplingH / 2 + 4, couplingY + couplingH / 2 + 4 + mdfT];
  const motor = { x: 0, z: 0, faceY, couplingY, couplingH, reelShaftBottomY: faceY + 24 + 1, bearingPlateY };
  // torre: dos costados a ±31 mm del eje, de 54 mm de fondo (la fuente queda 1 mm detrás y el DM542 delante)
  const towers = reels.map((q) => ({ x: q.x, z: q.y, sideX: [q.x - 31, q.x + 31] as [number, number], z0: q.y - 27, z1: q.y + 27, collarY: [floorTop + 21, floorTop + 21 + mdfT] as [number, number], bearingY: bearingPlateY }));
  // tapa fija a 8 mm sobre la brida de arriba, con tres postes: dos atrás y uno al frente. La película sale por el lado
  // de afuera de cada tambor, donde no hay poste. El poste de atrás del lado de adentro es hueco: por él bajan los cables
  const coverY = flangeHighY + flangeT + 8;
  const postR = 6;
  const hollowPostR = 7;
  const postAt = g.flangeR + 10;
  const coverR = postAt + 10;
  const covers = reels.map((q, i) => {
    const posts = [(-3 * Math.PI) / 4, -Math.PI / 4, Math.PI / 2].map((t) => ({ x: q.x + postAt * Math.cos(t), y: q.y + postAt * Math.sin(t) }));
    return { x: q.x, z: q.y, y: coverY, r: coverR, posts, hollow: i === 0 ? 1 : 0 };
  });
  // la placa del sensor apoya en la tapa; su cara queda a 3,2 mm de la tapa, bajo la ventana del capuchón
  const sensorFaceY = coverY + 3 + 3.2;
  // dentro de la base: fuente de pie contra la tapa trasera, un DM542 delante de cada motor, protoboard al centro
  const inX1 = base.x1 - wallT - 4;
  const psu = { x: 0, z: base.z0 + wallT + 1 + 21 };
  const psuFrame = { x0: -58, x1: 58, z0: psu.z + 21, z1: psu.z + 21 + mdfT };
  const psuStops = [-1, 1].map((s) => ({ x: s * (99.5 + mdfT / 2), y: psu.z - 6 }));
  const dmX = inX1 - 46;
  const dm542 = [
    { x: -dmX, z: -60, rotY: Math.PI / 2 },
    { x: dmX, z: -60, rotY: -Math.PI / 2 },
  ];
  const breadboard = { x: 0, y: -98 };
  const expansion = { x: -40, y: -35 };
  const res10 = { x: 40, y: -55 };
  const bucks = [
    { x: 40, z: -28, volts: 5 },
    { x: 40, z: -4, volts: 12 },
  ];
  const fuse = { x: -40, z: 6 };
  // pivote: el 608 de arriba en la capa de abajo, sobresale dentro del hueco; el brazo gira sobre su pista interior y
  // asoma 1,5 mm sobre la cubierta, bajo la brida del rodillo. La copa impresa sostiene el 608 desde abajo y lleva el
  // segundo 608 y el AS5600
  const piv = g.pivot;
  const arm = Math.atan2(g.dancer.y - piv.y, g.dancer.x - piv.x);
  const toward = { x: Math.cos(arm - Math.PI / 2), y: Math.sin(arm - Math.PI / 2) };
  // el resorte jala el brazo a la mitad hacia donde el rodillo empuja la película
  const hook = { x: piv.x + (g.armMm / 2) * Math.cos(arm), y: piv.y + (g.armMm / 2) * Math.sin(arm) };
  const anchor = { x: hook.x + 25 * toward.x, y: hook.y + 25 * toward.y };
  const anchorAng = Math.atan2(anchor.y - piv.y, anchor.x - piv.x);
  const a0 = Math.min(arm - (25 * Math.PI) / 180, anchorAng - (10 * Math.PI) / 180);
  const a1 = arm + (27 * Math.PI) / 180;
  const pocket: Vec2[] = [];
  for (let k = 0; k <= 24; k++) {
    const t = a1 + ((2 * Math.PI - (a1 - a0)) * k) / 24;
    pocket.push({ x: piv.x + 10 * Math.cos(t), y: piv.y + 10 * Math.sin(t) });
  }
  for (let k = 0; k <= 24; k++) {
    const t = a0 + ((a1 - a0) * k) / 24;
    pocket.push({ x: piv.x + 52 * Math.cos(t), y: piv.y + 52 * Math.sin(t) });
  }
  const pivotStack = { armY: [-deckT + 7, 1.5] as [number, number], bossTopY: flangeLowY - flangeT, upperBearingY: [-deckT, -deckT + 7] as [number, number], lowerBearingY: [-34, -27] as [number, number], magnetFaceY: -42, cupY: [-48, -deckT] as [number, number], anchor, hook, pocket };
  const as5600 = { x: piv.x, z: piv.y, y: -44.4 };
  const bundle = { x: 0, y: -80 };
  const ledHead = { condenserFront: 3, ledBack: 36, heatsinkFront: 36, depth: 56, width: 44 };
  const mouthY = filmTop - 5.5;
  const sensor = { sMm: d.pathSpec.gateMm - p.film.pitchMm, mouthY, beamY: mouthY + 2.6 };
  // la ventana: las guías de acrílico tocan el dorso de la película (cara de la lámpara) por sus márgenes
  const gp = pointAt(d.path, d.pathSpec.gateMm);
  const filmBack = -(p.film.laminate ? p.film.laminate.baseMm + p.film.laminate.coverMm : 0.13) / 2;
  const gate = { x: gp.position.x, z: gp.position.y, railZ: [filmBack - 3, filmBack] as [number, number], plateZ: [filmBack - 6, filmBack - 3] as [number, number] };
  const ledPegs = [-18, 18].map((dx) => ({ x: gate.x + dx, y: gate.z - 50 }));
  const sp = pointAt(d.path, sensor.sMm);
  const f249Peg = { x: sp.position.x + 12, y: sp.position.y - 22 };
  const lensPegs = [-30, 30].map((dx) => ({ x: gate.x + dx, y: base.z1 - 13 }));
  const floor = base.floorTop;
  const volumes: Rect[] = [
    ...reels.map((q, i) => rect(`motor${i + 1}`, q.x, q.y, 43, 43, floor, motor.faceY + 2)),
    ...towers.flatMap((t, i) => t.sideX.map((x, k) => rect(`torre${i + 1}-${k + 1}`, x, (t.z0 + t.z1) / 2, mdfT, t.z1 - t.z0, floor, -deckT))),
    rect('psu', psu.x, psu.z, 199, 42, floor, floor + 98),
    rect('marco-fuente', 0, (psuFrame.z0 + psuFrame.z1) / 2, psuFrame.x1 - psuFrame.x0, mdfT, floor, -deckT),
    ...psuStops.map((s, i) => rect(`tope-fuente${i + 1}`, s.x, s.y, mdfT, 30, floor, floor + 20)),
    ...dm542.map((m, i) => rect(`dm542-${i + 1}`, m.x, m.z, 92, 132, floor, floor + 34)),
    rect('breadboard', breadboard.x, breadboard.y, 165, 55, floor, floor + 36),
    rect('esp32', expansion.x, expansion.y, 77, 53, floor, floor + 26),
    rect('res10w', res10.x, res10.y, 42, 22, floor, floor + 15),
    ...bucks.map((b, i) => rect(`buck${i}`, b.x, b.z, 43, 21, floor, floor + 16)),
    rect('fuse', fuse.x, fuse.z, 30, 14, floor, floor + 14),
    rect('copa-pivote', piv.x, piv.y, 28, 28, pivotStack.cupY[0], pivotStack.cupY[1]),
  ];
  return { R: g.guideR, rollerBodyH: p.film.stripWidthMm + 10, filmBottom, filmTop, filmMid: (filmBottom + filmTop) / 2, base, reels, coreR: g.coreR, flangeR: g.flangeR, flangeT, flangeLowY, flangeHighY, deckBearingTopY, motor, towers, guides: [g.guide1, g.guide2], dancer: g.dancer, pivot: g.pivot, armMm: g.armMm, dancerR: g.dancerR, pivotStack, covers, postR, hollowPostR, sensorFaceY, psu, psuFrame, psuStops, dm542, bucks, fuse, breadboard, expansion, res10, as5600, bundle, ledHead, sensor, gate, ledPegs, f249Peg, lensPegs, volumes };
}

/** choques en la mesa de dos tambores (vacío = todo cabe) */
export function reelsAssemblyProblems(a: ReelsAssembly, d: Derived): string[] {
  const out: string[] = [];
  const v = a.volumes;
  for (let i = 0; i < v.length; i++)
    for (let j = i + 1; j < v.length; j++) {
      const A = v[i];
      const B = v[j];
      if (A.x0 < B.x1 && B.x0 < A.x1 && A.z0 < B.z1 && B.z0 < A.z1 && A.y0 < B.y1 && B.y0 < A.y1) out.push(`${A.id} choca con ${B.id}`);
    }
  const inner = { x0: a.base.x0 + a.base.wallT, x1: a.base.x1 - a.base.wallT, z0: a.base.z0 + a.base.wallT, z1: a.base.z1 - a.base.wallT };
  for (const r of v) if (r.x0 < inner.x0 || r.x1 > inner.x1 || r.z0 < inner.z0 || r.z1 > inner.z1) out.push(`${r.id} se sale de la base`);
  if (a.motor.couplingY + a.motor.couplingH / 2 > a.motor.bearingPlateY[0]) out.push('el cople toca la placa del segundo rodamiento');
  if (a.motor.bearingPlateY[1] > -a.base.deckT - 5) out.push('la placa del segundo rodamiento queda pegada a la cubierta');
  // las bridas, las guías y el brazo tensor caben en la cubierta
  for (const q of a.reels) if (q.x - a.flangeR < a.base.x0 || q.x + a.flangeR > a.base.x1 || q.y - a.flangeR < a.base.z0) out.push('un tambor se sale de la cubierta');
  // los postes de las tapas no tocan bridas, guías, brazo tensor ni película
  const circles = [...a.reels.map((q) => ({ ...q, r: a.flangeR })), ...a.guides.map((q) => ({ ...q, r: a.R + 2 })), { ...a.dancer, r: a.dancerR + 2 }];
  for (const c of a.covers)
    c.posts.forEach((s, k) => {
      const pr = k === c.hollow ? a.hollowPostR : a.postR;
      for (const q of circles) if (Math.hypot(s.x - q.x, s.y - q.y) < q.r + pr + 2) out.push(`un poste de la tapa toca una pieza en (${q.x.toFixed(0)}, ${q.y.toFixed(0)})`);
      for (const seg of d.path.segments) {
        if (seg.kind !== 'line') continue;
        const ex = seg.b.x - seg.a.x;
        const ey = seg.b.y - seg.a.y;
        const u = Math.max(0, Math.min(1, ((s.x - seg.a.x) * ex + (s.y - seg.a.y) * ey) / (ex * ex + ey * ey || 1)));
        if (Math.hypot(seg.a.x + ex * u - s.x, seg.a.y + ey * u - s.y) < pr + 2) out.push(`un poste de la tapa corta la película en (${s.x.toFixed(0)}, ${s.y.toFixed(0)})`);
      }
      if (s.x < a.base.x0 + a.base.wallT + pr || s.x > a.base.x1 - a.base.wallT - pr || s.y < a.base.z0 + a.base.wallT + pr) out.push('un poste de la tapa queda fuera de la cubierta');
      if (Math.hypot(s.x - c.x, s.y - c.z) + pr + 2 > c.r) out.push('un poste de la tapa queda en la orilla del acrílico');
    });
  // el hueco del brazo tensor no toca la guía 2 ni la orilla de la cubierta
  for (const q of a.pivotStack.pocket) {
    if (q.x > a.base.x1 - a.base.wallT - 1) out.push('el hueco del brazo tensor llega a la pared');
    for (const gd of a.guides) if (Math.hypot(q.x - gd.x, q.y - gd.y) < 4 + 3) out.push('el hueco del brazo tensor toca el eje de una guía');
  }
  return out;
}

/** choques y piezas fuera de la base (vacío = todo cabe) */
export function assemblyProblems(a: Assembly, d: Derived): string[] {
  const out: string[] = [];
  const v = a.volumes;
  for (let i = 0; i < v.length; i++)
    for (let j = i + 1; j < v.length; j++) {
      const A = v[i];
      const B = v[j];
      if (A.x0 < B.x1 && B.x0 < A.x1 && A.z0 < B.z1 && B.z0 < A.z1 && A.y0 < B.y1 && B.y0 < A.y1) out.push(`${A.id} choca con ${B.id}`);
    }
  const inner = { x0: a.base.x0 + a.base.wallT, x1: a.base.x1 - a.base.wallT, z0: a.base.z0 + a.base.wallT, z1: a.base.z1 - a.base.wallT };
  for (const r of v) if (r.x0 < inner.x0 || r.x1 > inner.x1 || r.z0 < inner.z0 || r.z1 > inner.z1) out.push(`${r.id} se sale de la base`);
  if (a.motor.faceY - 48 < a.base.floorTop) out.push('el motor toca el piso de la base');
  // la caja de control debe librar rodillos, ejes y tensor (rodillos de 1 + cuerpo + 15 mm de eje y tuerca)
  const rollerTop = 1 + a.rollerBodyH + 5 + 15;
  if (a.box.y <= rollerTop) out.push(`la caja de control (y = ${a.box.y} mm) toca los ejes de los rodillos (${rollerTop} mm)`);
  for (const s of a.standoffs)
    for (const r of d.pathSpec.rollers) if (Math.hypot(s.x - r.x, s.y - r.y) < a.R + 2 + 3) out.push(`un separador de la caja toca el rodillo en (${r.x.toFixed(0)}, ${r.y.toFixed(0)})`);
  // en el festón la película cruza el interior: ningún separador puede quedar sobre un tramo
  for (const s of a.standoffs)
    for (const seg of d.path.segments) {
      if (seg.kind !== 'line') continue;
      const ex = seg.b.x - seg.a.x;
      const ey = seg.b.y - seg.a.y;
      const u = Math.max(0, Math.min(1, ((s.x - seg.a.x) * ex + (s.y - seg.a.y) * ey) / (ex * ex + ey * ey || 1)));
      if (Math.hypot(seg.a.x + ex * u - s.x, seg.a.y + ey * u - s.y) < 3 + 2) out.push(`un separador de la caja corta la película en (${s.x.toFixed(0)}, ${s.y.toFixed(0)})`);
    }
  return out;
}
