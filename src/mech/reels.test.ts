import { describe, expect, it } from 'vitest';
import { deriveProject, parseProject } from '../core/project';
import { reelsDemoProject, reelsProject } from '../core/video';
import { buildBom } from '../fabricate/bom';
import { buildReelsAssembly, reelsAssemblyProblems } from './assembly';
import { pointAt } from './path';
import { defaultReelControl, HAND_SENSORS, handFps, livePath, openPointAt, ReelController, reelEvents, reelPose, woundAngle, woundRadius, type HandInput } from './reels';

const p = reelsDemoProject();
const d = deriveProject(p);
const r = d.reels!;
const pitch = p.film.pitchMm;
const none: HandInput = { present: false, distanceMm: 150 };
const at = (cm: number): HandInput => ({ present: true, distanceMm: cm * 10 });

/** corre el programa `s` segundos en pasos de 2 ms */
function run(ctrl: ReelController, s: number, hands: [HandInput, HandInput]): void {
  for (let i = 0; i < Math.round(s / 0.002); i++) ctrl.step(0.002, hands, pitch);
}
const controller = (over = {}) => new ReelController({ phiMin: r.design.phiMin, phiMax: r.design.phiMax, centers: r.design.centers }, { ...r.spec.control, ...over }, r.sensor);
const frameAt = (phi: number) => r.design.centers.findIndex((c) => Math.abs(c - phi) < 1e-6);

describe('dos tambores: enrollado y recorrido (ADR-0011)', () => {
  it('el radio crece con la película: 4,65 m de laminada de 0,217 mm llenan el núcleo de Ø103,1 hasta Ø109,2', () => {
    expect(2 * woundRadius(r.design.geometry.coreR, 4650, 0.217)).toBeCloseTo(109.2, 1);
    expect(2 * r.design.fullR).toBeCloseTo(109.2, 1);
    // lleno solo cambia un 5,9 %: el ESP32 ajusta las vueltas al radio contando marcas
    expect(r.design.fullR / r.design.geometry.coreR).toBeLessThan(1.06);
    // con grosor casi nulo el giro es ℓ / r0
    expect(woundAngle(50, 100, 1e-6)).toBeCloseTo(2, 4);
  });

  it('recorrido abierto continuo: cada tramo empieza donde acaba el anterior y la ventana cae en el tramo recto del frente', () => {
    const path = r.design.path;
    for (let i = 1; i < path.segments.length; i++) {
      const prev = path.segments[i - 1];
      const end = pointAt(path, prev.s0 + prev.length - 1e-6).position;
      const start = pointAt(path, path.segments[i].s0 + 1e-6).position;
      expect(Math.hypot(end.x - start.x, end.y - start.y)).toBeLessThan(0.01);
    }
    const g = pointAt(path, r.design.gateMm);
    expect(g.onRoller).toBeNull();
    expect(g.position.y).toBeCloseTo(0, 6);
    // la normal de la ventana mira a la lente (+y) y la película corre de derecha a izquierda, como en el loop
    expect(g.normal.y).toBeCloseTo(1, 6);
    expect(g.tangent.x).toBeCloseTo(-1, 6);
    // fuera del recorrido la película sigue enrollada en cada tambor
    const before = openPointAt(path, -10).position;
    expect(Math.hypot(before.x - r.design.geometry.reel2.x, before.y - r.design.geometry.reel2.y)).toBeCloseTo(path.circles[0].r, 6);
  });

  it('las colas dejan una vuelta en cada núcleo con la película en cualquier extremo', () => {
    const wrap = r.design.wrapMinMm;
    expect(reelPose(r.design, r.design.phiMin).on1).toBeGreaterThanOrEqual(wrap - 1e-6);
    expect(reelPose(r.design, r.design.phiMax).on2).toBeGreaterThanOrEqual(wrap - 1e-6);
    // la película total: 4,32 m de fotogramas y las dos colas, unos 5,6 m
    expect(r.design.totalMm / 1000).toBeCloseTo(5.61, 1);
    expect(r.filmToBuyM).toBeCloseTo(6.1, 1);
  });

  it('el recorrido de este instante deja el fotograma de la ventana donde lo pone el modelo', () => {
    const phi = r.design.centers[60];
    const lp = livePath(r.design, phi, 0.03);
    const sigma = phi - r.design.gateMm;
    const q = lp.at(sigma).position;
    const g = pointAt(r.design.path, r.design.gateMm).position;
    expect(Math.hypot(q.x - g.x, q.y - g.y)).toBeLessThan(0.01);
  });
});

describe('dos tambores: la mano mueve la película', () => {
  it('la tabla de la propuesta: 35 cm → 6 fps, 25 → 15, 15 → 24, 3 cm o menos → 30, sin mano → quieta', () => {
    const map = defaultReelControl().speedMap;
    expect(handFps(350, map)).toBe(6);
    expect(handFps(250, map)).toBe(15);
    expect(handFps(150, map)).toBe(24);
    expect(handFps(20, map)).toBe(30);
    expect(handFps(200, map)).toBeCloseTo(19.5, 6);
    expect(handFps(400, map)).toBe(0);
    expect(handFps(null, map)).toBe(0);
  });

  it('mano a 15 cm sobre el tambor 1: espera un instante, llega a 24 fps en unos 0,43 s y la animación avanza', () => {
    const c = controller();
    run(c, 0.1, [at(15), none]);
    expect(c.live.vMmS).toBe(0);
    run(c, 0.6, [at(15), none]);
    expect(c.live.vMmS).toBeCloseTo(24 * pitch, 3);
    expect(c.live.owner).toBe(0);
    expect(c.live.state).toBe('hacia el tambor 1');
    expect(c.live.phiMm).toBeGreaterThan(r.design.phiMin + 100);
  });

  it('al retirar la mano frena y se queda con un fotograma centrado, iluminado con pulsos rápidos', () => {
    const c = controller();
    run(c, 1, [at(15), none]);
    run(c, 1.2, [none, none]);
    expect(c.live.vMmS).toBe(0);
    expect(frameAt(c.live.phiMm)).toBeGreaterThan(0);
    expect(c.live.still).toBe(true);
    expect(c.live.state).toBe('quieta');
  });

  it('llega al final con el último fotograma centrado y no se pasa; con la mano del otro tambor regresa', () => {
    const c = controller();
    c.reset(r.design.centers[110]);
    run(c, 3, [at(3), none]);
    expect(c.live.phiMm).toBeCloseTo(r.design.phiMax, 6);
    expect(c.live.state).toBe('al final');
    run(c, 1, [none, at(15)]);
    expect(c.live.vMmS).toBeLessThan(0);
    expect(c.live.state).toBe('hacia el tambor 2');
  });

  it('«regresa sola»: al llegar al final con la mano, vuelve al otro extremo y ahí se queda', () => {
    const c = controller({ atEnd: 'return' });
    c.reset(r.design.centers[115]);
    run(c, 4, [at(10), none]);
    expect(c.live.auto).toBe(-1);
    expect(c.live.state).toBe('regresa sola');
    run(c, 10, [at(10), none]);
    expect(c.live.phiMm).toBeCloseTo(r.design.phiMin, 6);
    expect(c.live.auto).toBe(0);
  });

  it('dos manos: manda la primera que llegó, o la más cercana, o se detiene, según el programa', () => {
    const first = controller();
    run(first, 0.5, [at(15), none]);
    run(first, 0.5, [at(15), at(5)]);
    expect(first.live.owner).toBe(0);
    const near = controller({ twoHands: 'nearest' });
    run(near, 0.5, [at(15), none]);
    run(near, 0.5, [at(15), at(5)]);
    expect(near.live.owner).toBe(1);
    const stop = controller({ twoHands: 'stop' });
    run(stop, 0.5, [at(15), none]);
    run(stop, 1.5, [at(15), at(5)]);
    expect(stop.live.owner).toBeNull();
    expect(stop.live.vMmS).toBe(0);
  });

  it('el VL53L0X pierde la mano a menos de 3 cm; el VL53L4CD la sigue leyendo', () => {
    const l0 = new ReelController({ phiMin: r.design.phiMin, phiMax: r.design.phiMax, centers: r.design.centers }, r.spec.control, HAND_SENSORS.vl53l0x);
    run(l0, 0.5, [at(2), none]);
    expect(l0.live.sensed[0]).toBeNull();
    const l4 = controller();
    run(l4, 0.5, [at(2), none]);
    expect(l4.live.sensed[0]).toBeCloseTo(20, 3);
  });

  it('una cabeza que pasa en menos de 150 ms no mueve la película', () => {
    const c = controller();
    run(c, 0.12, [at(30), none]);
    run(c, 0.5, [none, none]);
    expect(c.live.phiMm).toBe(r.design.phiMin);
  });
});

describe('dos tambores: la luz sigue a la velocidad', () => {
  const base = { centers: r.design.centers, control: r.spec.control, pitchMm: pitch, markAlongMm: p.film.syncMarks.alongMm, led: { ...p.led, jitterUs: 0 } };

  it('en marcha cada fotograma centrado dispara un destello de 0,1 mm / v; quieta, pulsos a 200 Hz con la misma luz', () => {
    const phi0 = r.design.centers[10] - 1;
    const ev = reelEvents({ ...base, t0: 0, dt: 0.5, phi0, phi1: phi0 + 0.5 * 864, still: false });
    expect(ev.length).toBe(12);
    expect(ev[0].flash.duration * 1e6).toBeCloseTo(115.7, 1);
    expect(ev[0].speedMmS * ev[0].flash.duration).toBeCloseTo(0.1, 6);
    const still = reelEvents({ ...base, t0: 0, dt: 0.1, phi0: r.design.centers[5], phi1: r.design.centers[5], still: true });
    expect(still.length).toBe(20);
    // luz promedio igual: 24 destellos de 115,7 µs por segundo = 200 de 13,9 µs
    expect(still[0].flash.duration * 200).toBeCloseTo(24 * ev[0].flash.duration, 9);
  });

  it('en reversa, sin compensar el borde de la marca, el destello llega 3 mm antes; compensado cae centrado', () => {
    const phi0 = r.design.centers[20] + 10;
    const ok = reelEvents({ ...base, t0: 0, dt: 0.02, phi0, phi1: phi0 - 20, still: false });
    const mid = ok[0].phiMm + (ok[0].speedMmS * ok[0].flash.duration) / 2;
    expect(mid).toBeCloseTo(r.design.centers[20], 6);
    const raw = reelEvents({ ...base, control: { ...r.spec.control, compensateMarkEdge: false }, t0: 0, dt: 0.02, phi0, phi1: phi0 - 20, still: false });
    const midRaw = raw[0].phiMm + (raw[0].speedMmS * raw[0].flash.duration) / 2;
    expect(midRaw - r.design.centers[20]).toBeCloseTo(3, 6);
  });

  it('destellos de la propuesta: 463 µs a 6 fps, 116 µs a 24 fps, 93 µs a 30 fps y 13,9 µs quieta', () => {
    expect(r.pulseUs.slow).toBeCloseTo(463, 0);
    expect(r.pulseUs.normal).toBeCloseTo(115.7, 1);
    expect(r.pulseUs.fast).toBeCloseTo(92.6, 1);
    expect(r.pulseUs.still).toBeCloseTo(13.9, 1);
    expect(r.duty).toBeCloseTo(0.1 / 36, 9);
  });
});

describe('dos tambores: la mesa', () => {
  it('la demostración no tiene errores ni advertencias: solo notas', () => {
    expect(d.warnings.filter((w) => w.level !== 'info')).toEqual([]);
    expect(d.coherence.ok).toBe(true);
    expect(d.clearance.ok).toBe(true);
  });

  it('motores: de 151 a 160 rpm a 24 fps y 200 rpm a 30 fps, con par de sobra (margen de 1,8)', () => {
    expect(r.rpm.normalCore).toBeCloseTo(160, 1);
    expect(r.rpm.maxCore).toBeCloseTo(200, 1);
    expect(r.rpm.normalFull).toBeCloseTo(151, 0);
    expect(r.torque.tensionNcm).toBeCloseTo(8.2, 1);
    expect(r.torque.margin).toBeGreaterThan(1.5);
  });

  it('todo cabe en una base de 394 × 268 mm: sin choques, la fuente de pie atrás y los drivers delante de los motores', () => {
    const a = buildReelsAssembly(p, d);
    expect(reelsAssemblyProblems(a, d)).toEqual([]);
    // a la derecha manda el 608 del pivote, con 3 mm de MDF antes de la ranura de la pared de acrílico; piso y cubierta
    // sobresalen 8 mm de las paredes al frente y a los lados (ADR-0012)
    expect(a.base.x1 - a.base.x0).toBeCloseTo(394.2, 0);
    expect(a.base.z1 - a.base.z0).toBeCloseTo(267.5, 0);
    expect(a.base.wallT).toBe(a.base.acrT);
    expect(a.base.deckT).toBeCloseTo(2 * a.base.mdfT, 6);
    // la cara del sensor de mano queda unos 6 cm sobre la cubierta, encima de la tapa
    expect(a.sensorFaceY).toBeGreaterThan(a.flangeHighY + a.flangeT);
  });

  it('sin laminar es un error: en el tambor cada vuelta roza la tinta de la anterior', () => {
    const plain = reelsProject({ ...p, film: { ...p.film, laminate: undefined } });
    // reelsProject lamina por omisión: se quita después
    const dd = deriveProject({ ...plain, film: { ...plain.film, laminate: undefined } });
    expect(dd.warnings.some((w) => w.level === 'error' && w.source === 'película')).toBe(true);
  });

  it('bridas chicas para la película son un error', () => {
    const small = deriveProject({ ...p, reels: { ...p.reels!, flangeDiameterMm: 110 } });
    expect(small.warnings.some((w) => w.level === 'error' && w.source === 'tambores')).toBe(true);
  });

  it('el proyecto se guarda y se lee igual', () => {
    expect(parseProject(JSON.parse(JSON.stringify(p)))).toEqual(p);
  });

  it('la lista de compras: dos motores, dos drivers, trabajos de taller por cotizar, brazo tensor con AS5600, sensores de mano y 12 rodamientos', () => {
    const bom = buildBom(p, d, '5/11/2026');
    const q = (id: string) => bom.lines.find((l) => l.id === id)?.qty;
    expect(q('motor-17hs8401')).toBe(2);
    expect(q('driver-dm542')).toBe(2);
    expect(q('npn-s8050')).toBe(5);
    expect(q('coupling-5-8')).toBe(2);
    expect(q('bearing-608')).toBe(12);
    expect(q('hand-sensor')).toBe(2);
    expect(q('as5600')).toBe(1);
    const ids = bom.lines.map((l) => l.id);
    // sin tornillos (ADR-0012): la estructura y las piezas impresas van en cuatro trabajos de taller
    for (const id of ['laser-mdf', 'laser-acrylic', 'laser-black', 'print-petg', 'cable-ties', 'washers-m8', 'glue-wood', 'epoxy', 'dancer-spring', 'jumpers-hh']) expect(ids).toContain(id);
    for (const id of ['bracket-nema17', 'm3-kit', 'base-box', 'reels', 'rollers', 'dancer', 'reel-covers', 'gate-plate', 'printed-supports', 'control-box', 'tensioner']) expect(ids).not.toContain(id);
    // los trabajos de taller y la película se cotizan: su estimado no se publica (private/costos)
    expect(bom.lines.filter((l) => l.unitCost === undefined).map((l) => l.id).sort()).toEqual(['film-base-roll', 'film-cover', 'laser-acrylic', 'laser-black', 'laser-mdf', 'print-petg']);
    expect(bom.markdown).not.toMatch(/FIC|Maxicopias|\$9\/min/);
    expect(bom.markdown).toContain('6.1 m');
  });
});
