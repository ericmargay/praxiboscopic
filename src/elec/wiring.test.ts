import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { deriveProject } from '../core/project';
import { reelsDemoProject } from '../core/video';
import { buildBom } from '../fabricate/bom';
import { COMPONENTS, NETS, PINS, PULSES_PER_REV, STEPS, WIRES, WIRING, cableCount, checkWiring, componentsOfStep, derivedNets, holeText, parseHole, refText, resistorCount, stripOf, wiresOfStep, type Wiring } from './wiring';

describe('conexiones de la electrónica (ADR-0015)', () => {
  it('el montaje en la protoboard arma exactamente el esquema, con los rieles enteros o partidos', () => {
    expect(checkWiring()).toEqual([]);
  });

  it('detecta un cable en el agujero equivocado', () => {
    // el colector de Q1 una columna antes cae en su base
    const bad: Wiring = { ...WIRING, wires: WIRES.map((x) => (x.id === 'pul1-c' ? { ...x, from: 'bb:e12' } : x)) };
    const problems = checkWiring(bad);
    expect(problems.some((p) => p.includes('dm542-1.PUL-'))).toBe(true);
    // 12 V en el riel de lógica: con el riel entero se une con los 5 V
    const short: Wiring = { ...WIRING, wires: WIRES.map((x) => (x.id === '12-vcc' ? { ...x, to: 'bb:+a40' } : x)) };
    expect(checkWiring(short).some((p) => p.includes('une lo que el esquema no'))).toBe(true);
  });

  it('nada depende de que los rieles estén unidos a la mitad', () => {
    const key = (g: string[][]) => g.map((x) => x.join(' ')).sort();
    expect(key(derivedNets(WIRING, true))).toEqual(key(derivedNets(WIRING, false)));
    // la mitad derecha del riel azul del lado a recibe tierra por el puente y por el regulador de 12 V (IN− y OUT−
    // están unidos por dentro): sin los dos, con rieles partidos el IR2101 se queda sin tierra, y solo entonces
    const loose: Wiring = { ...WIRING, wires: WIRES.filter((x) => x.id !== 'gnd-bridge' && x.id !== '12-gnd') };
    const problems = checkWiring(loose);
    expect(problems.some((p) => p.includes('rieles partidos'))).toBe(true);
    expect(problems.filter((p) => p.includes('el montaje') && !p.includes('rieles partidos') && p.includes('ir2101'))).toEqual([]);
  });

  it('agujeros y tiras de la protoboard', () => {
    expect(parseHole('bb:a12')).toEqual({ rail: '', row: 'a', col: 12 });
    expect(parseHole('bb:-j27')).toEqual({ rail: '-', row: 'j', col: 27 });
    expect(parseHole('bb:+a8')).toBeNull(); // los rieles van en grupos de cinco: la columna 8 no tiene agujero
    expect(parseHole('bb:k3')).toBeNull();
    expect(stripOf(parseHole('bb:a12')!, true)).toBe(stripOf(parseHole('bb:e12')!, true));
    expect(stripOf(parseHole('bb:e12')!, true)).not.toBe(stripOf(parseHole('bb:f12')!, true));
    expect(stripOf(parseHole('bb:-a31')!, true)).not.toBe(stripOf(parseHole('bb:-a33')!, true));
    expect(stripOf(parseHole('bb:-a31')!, false)).toBe(stripOf(parseHole('bb:-a33')!, false));
    expect(holeText('bb:-a11', true)).toBe('riel azul (−) del lado a, hacia la columna 11');
    expect(refText('dm542-1.PUL-')).toBe('DM542 1 · PUL−');
    expect(refText('esp32.GPIO25')).toBe('ESP32 · IO25');
  });

  it('cada paso conecta algo y dice cómo probarlo', () => {
    expect(STEPS.map((s) => s.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    for (const s of STEPS) {
      expect(wiresOfStep(s.n).length, `cables del paso ${s.n}`).toBeGreaterThan(0);
      expect(s.test.length, `pruebas del paso ${s.n}`).toBeGreaterThan(0);
      expect(s.todo.length).toBeGreaterThan(0);
    }
    // hasta el paso 8 no hay nada que pueda encender el LED: sus capacitores y él entran en el 9
    expect(componentsOfStep(9).map((c) => c.id)).toEqual(['cap-1', 'cap-2', 'cap-3', 'led-resistor', 'led']);
    const before = derivedNets(WIRING, true, 8).flat();
    expect(before).not.toContain('led.+');
    // el pin 5V del ESP32 no se conecta hasta el último paso (antes se alimenta por USB)
    expect(derivedNets(WIRING, true, 9).flat()).not.toContain('esp32.5V');
    expect(WIRES.find((x) => x.to === 'esp32.5V')?.step).toBe(10);
  });

  it('los pines del ESP32 no se repiten y el de las marcas es solo entrada', () => {
    const used = Object.values(PINS);
    expect(new Set(used).size).toBe(used.length);
    expect(PINS.mark).toBeGreaterThanOrEqual(34);
    // ninguno es de arranque (0, 2, 5, 12, 15) ni del flash (6 a 11)
    for (const p of used) expect([0, 2, 5, 12, 15, 6, 7, 8, 9, 10, 11]).not.toContain(p);
    // cada uno aparece en el esquema
    for (const p of used) expect(NETS.some((n) => n.pins.includes(`esp32.GPIO${p}`)), `GPIO${p}`).toBe(true);
    // el sensor de marcas va a 3,3 V: su salida llega directo a un GPIO
    expect(NETS.find((n) => n.id === 'v33')!.pins).toContain('sensor.VCC');
    expect(NETS.find((n) => n.id === 'v5')!.pins).not.toContain('sensor.VCC');
  });

  it('el programa de prueba usa los mismos pines y pulsos por vuelta', () => {
    const ino = readFileSync(new URL('../../public/electronica/prueba-banco/prueba-banco.ino', import.meta.url), 'utf8');
    const pin = (name: string) => Number(new RegExp(`const\\s+int\\s+${name}\\s*=\\s*(\\d+)\\s*;`).exec(ino)?.[1]);
    expect({ pul1: pin('PIN_PUL1'), dir1: pin('PIN_DIR1'), pul2: pin('PIN_PUL2'), dir2: pin('PIN_DIR2'), led: pin('PIN_LED'), mark: pin('PIN_MARCA'), sda: pin('PIN_SDA'), scl: pin('PIN_SCL'), xshut2: pin('PIN_XSHUT2') }).toEqual(PINS);
    expect(Number(/const\s+long\s+PULSOS_POR_VUELTA\s*=\s*(\d+)\s*;/.exec(ino)?.[1])).toBe(PULSES_PER_REV);
    // cada comando que piden los pasos existe en el programa
    for (const s of STEPS) for (const t of s.test) if (t.cmd) expect(ino, `comando ${t.cmd}`).toContain(`case '${t.cmd[0]}'`);
  });

  it('lo que pide el montaje cabe en lo comprado', () => {
    expect(resistorCount()).toEqual({ '1 kΩ': 4, '10 kΩ': 2, '10 Ω': 1 });
    const n = cableCount();
    expect(n.hm).toBeLessThanOrEqual(40);
    expect(n.mm).toBeLessThanOrEqual(65);
    expect(n.hh).toBe(2);
    // cada componente tiene su renglón en la lista de compras de la mesa, y alcanza la cantidad
    const p = reelsDemoProject();
    const bom = buildBom(p, deriveProject(p));
    const need = new Map<string, number>();
    for (const c of COMPONENTS) need.set(c.bomId!, (need.get(c.bomId!) ?? 0) + 1);
    for (const [id, k] of need) {
      const row = bom.parts.find((r) => r.id === id);
      expect(row, `renglón ${id}`).toBeTruthy();
      expect(row!.qty, `cantidad de ${id}`).toBeGreaterThanOrEqual(k);
    }
    // las cuatro resistencias de 1 kΩ: faltaba una en la lista (traía tres para dos transistores)
    const res = bom.parts.find((r) => r.id === 'small-resistors')!;
    expect(res.name).toContain('5 × 1 kΩ');
    expect(res.qty).toBe(8);
  });
});
