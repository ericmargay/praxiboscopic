// Ensamble físico de la obra en milímetros: dónde va cada pieza real (base, motor, electrónica de potencia dentro de
// la base, caja de control sobre los rodillos, cabeza del LED, sensor y lente) y qué choca con qué. Es puro: lo usan la
// escena 3D, la lista de compras y las pruebas. Plano de la mesa = (x, z) con z = y del recorrido; y hacia arriba con la
// cara superior de la cubierta en y = 0. Ver ADR-0007.
import type { Derived, Project } from '../core/project';
import type { Vec2 } from './path';

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
