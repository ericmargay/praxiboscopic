// Figura humana caminando: ciclo de marcha con cadera, muslos, pantorrillas, brazos y rebote del torso.
// `steps` pasos (zancadas dobles) por ciclo; todas las rotaciones son senos con fases, así el loop es exacto.
import { identityTransform, makeLayer, type Item, type Track } from '../model';
import { TIME_PARAMS, bool, num, str, timeOf, type GeneratorDef, type ParamValue } from './types';

export const walkerGenerator: GeneratorDef = {
  id: 'walker',
  label: 'Figura caminando',
  description: 'Ciclo de marcha articulado (cadera, rodillas, hombros, codos) con rebote del torso y suelo que se desplaza.',
  params: [
    { key: 'size', label: 'Estatura', type: 'number', min: 80, max: 280, step: 1, unit: 'px', group: 'Figura' },
    { key: 'color', label: 'Color', type: 'color', group: 'Figura' },
    { key: 'thickness', label: 'Grosor de extremidades', type: 'number', min: 2, max: 24, step: 1, unit: 'px', group: 'Figura' },
    { key: 'steps', label: 'Zancadas dobles por ciclo', type: 'number', min: 1, max: 4, step: 1, group: 'Marcha' },
    { key: 'stride', label: 'Amplitud de la zancada', type: 'number', min: 10, max: 50, step: 1, unit: '°', group: 'Marcha' },
    { key: 'kneeBend', label: 'Flexión de rodilla', type: 'number', min: 0, max: 80, step: 1, unit: '°', group: 'Marcha' },
    { key: 'armSwing', label: 'Balanceo de brazos', type: 'number', min: 0, max: 50, step: 1, unit: '°', group: 'Marcha' },
    { key: 'bob', label: 'Rebote del torso', type: 'number', min: 0, max: 20, step: 1, unit: 'px', group: 'Marcha' },
    { key: 'ground', label: 'Suelo con marcas que se mueven', type: 'boolean', group: 'Escena' },
    ...TIME_PARAMS,
  ],
  defaults: { size: 220, color: '#1f2430', thickness: 10, steps: 1, stride: 32, kneeBend: 50, armSwing: 28, bob: 8, ground: true, fps: 24, frames: 24 },
  build(p: Record<string, ParamValue>) {
    const { fps, duration } = timeOf(p);
    const width = 480;
    const height = 300;
    const H = num(p, 'size', 220);
    const u = H / 220;
    const color = str(p, 'color', '#1f2430');
    const th = num(p, 'thickness', 10) * u;
    const steps = Math.max(1, Math.round(num(p, 'steps', 1)));
    const stride = num(p, 'stride', 32);
    const knee = num(p, 'kneeBend', 50);
    const arm = num(p, 'armSwing', 28);
    const bob = num(p, 'bob', 8) * u;
    const floorY = height - 24;
    const legLen = 60 * u; // muslo y pantorrilla
    const torsoLen = 70 * u;
    const hipY = floorY - 2 * legLen - 4 * u;
    const cx = width / 2;

    const sin = (amp: number, phase: number, cycles = steps, offset = 0): Track => ({ expr: { kind: 'sin', amp, cycles, phase, offset } });
    const absSin = (amp: number, phase: number, cycles = steps, offset = 0): Track => ({ expr: { kind: 'abs-sin', amp, cycles, phase, offset } });
    const limb = (id: string, len: number, w: number): Item => ({ id, name: id, type: 'rect', w, h: len, radius: w / 2, transform: identityTransform({ y: len / 2 }), style: { fill: color } });

    // pierna: grupo cadera (rotación = seno) → muslo; grupo rodilla (rotación = |seno| con fase) → pantorrilla
    const leg = (side: 'l' | 'r'): Item => {
      const phase = side === 'l' ? 0 : 0.5;
      return {
        id: `leg-${side}`,
        name: side === 'l' ? 'Pierna izquierda' : 'Pierna derecha',
        type: 'group',
        transform: identityTransform({ x: side === 'l' ? -4 * u : 4 * u, rotation: sin(stride, phase), opacity: side === 'l' ? 0.75 : 1 }),
        style: {},
        children: [
          limb(`thigh-${side}`, legLen, th),
          {
            id: `knee-${side}`,
            name: 'Rodilla',
            type: 'group',
            // la rodilla se flexiona cuando la pierna va hacia atrás y se recoge (fase adelantada 0.25)
            transform: identityTransform({ y: legLen, rotation: absSin(-knee, phase + 0.25, steps / 2) }),
            style: {},
            children: [limb(`shin-${side}`, legLen, th * 0.9), { id: `foot-${side}`, name: 'Pie', type: 'rect', w: 26 * u, h: th * 0.8, radius: th * 0.4, transform: identityTransform({ x: 8 * u, y: legLen }), style: { fill: color } }],
          },
        ],
      };
    };
    const armItem = (side: 'l' | 'r'): Item => {
      const phase = side === 'l' ? 0.5 : 0; // los brazos van en contrafase con las piernas del mismo lado
      return {
        id: `arm-${side}`,
        name: side === 'l' ? 'Brazo izquierdo' : 'Brazo derecho',
        type: 'group',
        transform: identityTransform({ x: side === 'l' ? -10 * u : 10 * u, y: -torsoLen + 6 * u, rotation: sin(arm, phase), opacity: side === 'l' ? 0.75 : 1 }),
        style: {},
        children: [
          limb(`upperarm-${side}`, 46 * u, th * 0.8),
          { id: `elbow-${side}`, name: 'Codo', type: 'group', transform: identityTransform({ y: 46 * u, rotation: absSin(arm * 0.9, phase + 0.1, steps / 2, 10) }), style: {}, children: [limb(`forearm-${side}`, 42 * u, th * 0.7)] },
        ],
      };
    };

    const figure: Item = {
      id: 'figure',
      name: 'Figura',
      type: 'group',
      transform: identityTransform({ x: cx, y: bob > 0 ? absSin(-bob, 0, steps * 2, hipY) : hipY }),
      style: {},
      children: [
        leg('l'),
        armItem('l'),
        { id: 'torso', name: 'Torso', type: 'rect', w: th * 2.2, h: torsoLen, radius: th, transform: identityTransform({ y: -torsoLen / 2, rotation: sin(3, 0.25) }), style: { fill: color } },
        { id: 'head', name: 'Cabeza', type: 'circle', rx: 16 * u, ry: 17 * u, transform: identityTransform({ y: -torsoLen - 20 * u, rotation: sin(4, 0.5) }), style: { fill: color } },
        leg('r'),
        armItem('r'),
      ],
    };

    const layers = [];
    if (bool(p, 'ground', true)) {
      const marks: Item[] = [];
      const spacing = 80 * u;
      // velocidad del suelo = zancada: cada zancada doble avanza 2 × longitud de paso ≈ 2 · 2 · legLen · sin(stride)
      const stepLen = 2 * 2 * legLen * Math.sin((stride * Math.PI) / 180);
      const travel = steps * stepLen;
      // para que el suelo cierre el loop, el recorrido por ciclo debe ser múltiplo del espaciado: ajustamos el espaciado
      const n = Math.max(1, Math.round(travel / spacing));
      const sp = travel / n;
      const count = Math.ceil(width / sp) + 2;
      const total = count * sp;
      // cada marca recorre `n` separaciones hacia la izquierda y envuelve (periodo count·sp): el conjunto es invariante
      for (let i = 0; i < count; i++) {
        marks.push({ id: `mark-${i}`, name: `Marca ${i}`, type: 'rect', w: 18 * u, h: 4, transform: identityTransform({ x: { expr: { kind: 'saw', from: -sp, to: -sp + total, cycles: -n / count, phase: i / count } }, y: floorY + 8 }), style: { fill: '#8a8a8a' } });
      }
      marks.push({ id: 'floor', name: 'Suelo', type: 'line', x1: 0, y1: floorY, x2: width, y2: floorY, transform: identityTransform(), style: { fill: null, stroke: '#3a3a3a', strokeWidth: 2 } });
      layers.push(makeLayer('Suelo', marks, { id: 'layer-ground', procedural: true }));
    }
    layers.push(makeLayer('Figura', [figure], { id: 'layer-figure', procedural: true }));
    return { width, height, fps, duration, layers };
  },
};
