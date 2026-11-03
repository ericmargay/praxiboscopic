import { describe, expect, it } from 'vitest';
import { buildFilmLayout, defaultFilmSpec, phiForSlotAtGate } from '../film/layout';
import { buildPath, designRectangle, gateOnStraight, pointAt, rectangleLoopLength } from './path';
import { defaultDrumStrobe, defaultLedStrobe, dutyCycle, flashDuration, flashFrequency, flashesBetween, drumRpmFor } from './strobe';
import { autoSync, syncState } from './sync';
import { TimeEngine } from './timing';
import { defaultTransportSpec, filmSpeed, gateState, rpmForSpeed, torqueReport } from './transport';

describe('recorrido', () => {
  it('diseña un rectángulo de cuatro rodillos con la longitud exacta del loop', () => {
    const d = designRectangle(864, 30, 2);
    expect(d.lengthMm).toBeCloseTo(864, 6);
    expect(d.rollers.length).toBe(4);
    expect(d.aMm / d.bMm).toBeCloseTo(2, 6);
    expect(rectangleLoopLength(d.aMm, d.bMm, 30)).toBeCloseTo(864, 6);
    const geo = buildPath({ rollers: d.rollers, rollerRadiusMm: 30, driveRoller: 0, gateMm: d.gateMm, direction: 1 });
    expect(geo.lengthMm).toBeCloseTo(864, 6);
    expect(geo.segments.filter((s) => s.kind === 'arc').length).toBe(4);
    expect(gateOnStraight(geo, d.gateMm, 20).ok).toBe(true);
    expect(gateOnStraight(geo, geo.segments[1].s0 + 1, 20).ok).toBe(false);
  });

  it('pointAt recorre el camino de forma continua y vuelve al origen', () => {
    const d = designRectangle(864, 30, 2);
    const geo = buildPath({ rollers: d.rollers, rollerRadiusMm: 30, driveRoller: 0, gateMm: d.gateMm, direction: 1 });
    let prev = pointAt(geo, 0).position;
    for (let s = 1; s <= 864; s++) {
      const p = pointAt(geo, s).position;
      expect(Math.hypot(p.x - prev.x, p.y - prev.y)).toBeLessThan(1.01);
      prev = p;
    }
    const back = pointAt(geo, 864).position;
    const start = pointAt(geo, 0).position;
    expect(Math.hypot(back.x - start.x, back.y - start.y)).toBeLessThan(1e-6);
  });
});

describe('transporte y estroboscopio', () => {
  const layout = buildFilmLayout({ frameCount: 24, alongMm: 32, acrossMm: 20 }, defaultFilmSpec({ pitchMm: 36 }));

  it('24 fps con paso 36 mm exigen 864 mm/s; rodillo de 30 mm → 275 rpm', () => {
    const r = rpmForSpeed(864, 30, 1);
    expect(r.rollerRpm).toBeCloseTo((864 / 30 / (2 * Math.PI)) * 60, 6);
    const t = defaultTransportSpec({ motorRpm: r.motorRpm });
    expect(filmSpeed(t, 30)).toBeCloseTo(864, 6);
    expect(filmSpeed({ ...t, running: false }, 30)).toBe(0);
  });

  it('el tambor de 12 ranuras a 120 rpm destella 24 veces por segundo; el LED a 24 Hz igual', () => {
    const drum = defaultDrumStrobe({ slots: 12, rpm: 120 });
    expect(flashFrequency(drum)).toBeCloseTo(24, 9);
    expect(drumRpmFor(24, 12)).toBe(120);
    const led = defaultLedStrobe({ frequencyHz: 24, pulseUs: 300 });
    expect(flashFrequency(led)).toBe(24);
    expect(flashDuration(led)).toBeCloseTo(300e-6, 12);
    expect(dutyCycle(led)).toBeCloseTo(24 * 300e-6, 9);
    const flashes = flashesBetween(led, 0, 1);
    expect(flashes.length).toBe(24);
    expect(flashes[1].t - flashes[0].t).toBeCloseTo(1 / 24, 12);
  });

  it('la sincronía automática iguala transporte y proyección; un error deliberado produce deriva', () => {
    const transport = defaultTransportSpec();
    const drum = defaultDrumStrobe({ slots: 12 });
    const synced = autoSync(24, layout, transport, 30, drum);
    const st = syncState(24, layout, synced.transport, 30, synced.strobe);
    expect(st.actual.transportFps).toBeCloseTo(24, 6);
    expect(st.actual.flashHz).toBeCloseTo(24, 6);
    expect(Math.abs(st.actual.beatHz)).toBeLessThan(1e-6);
    expect(st.actual.secondsPerFrameSlip).toBe(Infinity);
    const drift = syncState(24, layout, { ...synced.transport, speedErrorPct: 1 }, 30, synced.strobe);
    expect(drift.actual.beatHz).toBeCloseTo(-0.24, 6);
    expect(drift.actual.secondsPerFrameSlip).toBeCloseTo(1 / 0.24, 4);
    expect(drift.warnings.some((w) => w.includes('deriva'))).toBe(true);
  });

  it('el par y las rpm se comprueban contra el catálogo de motores de OMEGA', () => {
    const t = defaultTransportSpec({ motorId: 'nema17-42x38' });
    const rep = torqueReport(t, 20, 400);
    expect(rep.maxRpm).toBe(300);
    expect(rep.warnings.some((w) => w.includes('supera su máximo'))).toBe(true);
    expect(torqueReport(t, 20, 100).ok).toBe(true);
  });

  it('coincidencia entre fotograma y pulso luminoso: con sincronía perfecta cada destello cae centrado', () => {
    const transport = defaultTransportSpec();
    const led = defaultLedStrobe({ frequencyHz: 24, pulseUs: 300 });
    const { transport: tr } = autoSync(24, layout, transport, 30, led);
    const v = filmSpeed(tr, 30);
    const gateMm = 100;
    const engine = new TimeEngine();
    engine.loopLengthMm = layout.loopLengthMm;
    engine.phiMm = phiForSlotAtGate(layout, gateMm, 0); // el fotograma 0 centrado en la ventana en t = 0
    let steps = 0;
    const seen = new Set<number>();
    for (let i = 0; i < 120; i++) {
      const step = engine.advance(1 / 60, v, led);
      for (const ev of step.events) {
        const mid = ev.phiMm + (ev.speedMmS * ev.flash.duration) / 2;
        const g = gateState(layout, gateMm, mid, v)!;
        expect(Math.abs(g.offsetMm)).toBeLessThan(0.05);
        seen.add(g.frameIndex);
        steps++;
      }
    }
    expect(steps).toBe(48);
    expect(seen.size).toBe(24); // en 2 s se ven los 24 fotogramas
    // y en orden: el destello n ve el fotograma n mod 24
    const engine2 = new TimeEngine();
    engine2.loopLengthMm = layout.loopLengthMm;
    engine2.phiMm = phiForSlotAtGate(layout, gateMm, 0);
    const st = engine2.advance(1, v, led);
    expect(st.events.length).toBeGreaterThan(20);
    st.events.forEach((ev) => {
      const g = gateState(layout, gateMm, ev.phiMm + (ev.speedMmS * ev.flash.duration) / 2, v)!;
      expect(g.frameIndex).toBe(ev.flash.n % 24);
    });
  });

  it('con disparo por sensor un error de velocidad no produce deriva y sin movimiento no hay destellos', () => {
    const led = defaultLedStrobe({ pulseUs: 120, trigger: 'sensor' });
    const gateMm = 100;
    const sensor = { positionsMm: layout.frames.map((f) => gateMm + f.centerMm), loopMm: layout.loopLengthMm };
    const v = 864 * 1.03; // 3 % más rápido
    const engine = new TimeEngine();
    engine.loopLengthMm = layout.loopLengthMm;
    engine.phiMm = phiForSlotAtGate(layout, gateMm, 0);
    let count = 0;
    for (let i = 0; i < 300; i++) {
      for (const ev of engine.advance(1 / 60, v, led, sensor).events) {
        const g = gateState(layout, gateMm, ev.phiMm + (ev.speedMmS * ev.flash.duration) / 2, v)!;
        expect(Math.abs(g.offsetMm)).toBeLessThan(0.01);
        count++;
      }
    }
    expect(count).toBeGreaterThan(5 * 24); // la frecuencia la impone la película
    const quiet = new TimeEngine();
    expect(quiet.advance(1, 0, led, sensor).events.length).toBe(0);
    const st = syncState(24, layout, { ...defaultTransportSpec({ motorRpm: 275, speedErrorPct: 3 }) }, 30, led);
    expect(st.actual.beatHz).toBe(0);
  });

  it('con el motor parado la posición no avanza y se repite el mismo fotograma', () => {
    const led = defaultLedStrobe({ frequencyHz: 24, pulseUs: 300 });
    const engine = new TimeEngine();
    const step = engine.advance(1, 0, led);
    expect(step.phiMm).toBe(0);
    expect(new Set(step.events.map((e) => e.phiMm)).size).toBe(1);
  });

  it('la resolución temporal es de microsegundos: un desfase de 50 µs se refleja en el instante del destello', () => {
    const a = flashesBetween(defaultLedStrobe({ frequencyHz: 24, phaseMs: 0 }), 0, 0.1)[0].t;
    const b = flashesBetween(defaultLedStrobe({ frequencyHz: 24, phaseMs: 0.05 }), 0, 0.1)[0].t;
    expect(b - a).toBeCloseTo(50e-6, 12);
  });
});
