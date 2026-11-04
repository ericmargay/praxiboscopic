// Catálogo de piezas reales a escala 1:1, en milímetros (eje Y hacia arriba). Cada tipo trae sus medidas de catálogo,
// material, especificaciones, conexiones y de dónde salen los datos, y un constructor de geometría que no usa el DOM
// (se prueba en Node y lo reutiliza el visor de la lista de compras). La escena (`mechScene.ts`) coloca las piezas,
// las etiqueta para seleccionarlas y las une con cables; aquí solo vive la forma de cada una.
//
// Convención: el origen de cada pieza está en el centro de su cara de apoyo (abajo), salvo que el tipo diga otra cosa.
// Las medidas marcadas `approx` no vienen de una hoja de datos: hay que confirmarlas con la pieza en mano.
import * as THREE from 'three';

export type PartCategory = 'estructura' | 'transporte' | 'pelicula' | 'optica' | 'control' | 'potencia' | 'cableado';

export const CATEGORY_LABEL: Record<PartCategory, string> = {
  estructura: 'Estructura',
  transporte: 'Transporte',
  pelicula: 'Película',
  optica: 'Óptica y luz',
  control: 'Control (caja superior)',
  potencia: 'Potencia (dentro de la base)',
  cableado: 'Cableado',
};

export interface KindSpec {
  name: string;
  /** medidas de catálogo ancho × fondo × alto (mm) */
  realMm?: [number, number, number];
  material?: string;
  specs?: string[];
  /** conexiones (pines, bornes, cables) */
  pins?: string[];
  /** de dónde salen las medidas */
  source?: string;
  /** medidas aproximadas: confirmar con la pieza */
  approx?: boolean;
  build: () => THREE.Group;
}

// --- materiales compartidos (paleta clara, sin dorados) -------------------------------------------------------------
type MatKey = 'pla' | 'plaDark' | 'mdf' | 'acrylic' | 'alu' | 'steel' | 'black' | 'anod' | 'rubber' | 'pcbBlack' | 'pcbBlue' | 'pcbGreen' | 'bread' | 'hole' | 'red' | 'blue' | 'epoxy' | 'tin' | 'copper' | 'capBlue' | 'terminal' | 'header' | 'phosphor' | 'white' | 'glass' | 'brass' | 'label' | 'pot';
let MATS: Record<MatKey, THREE.Material> | null = null;
export function mat(k: MatKey): THREE.Material {
  if (!MATS) {
    const std = (color: number, roughness = 0.6, metalness = 0, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
    MATS = {
      pla: std(0xe4e7ea, 0.55),
      plaDark: std(0x3d4246, 0.6),
      mdf: std(0xd6d1c9, 0.85),
      acrylic: new THREE.MeshPhysicalMaterial({ color: 0xe8f3f6, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }),
      alu: std(0xbcc3ca, 0.35, 0.8),
      steel: std(0x9aa3ab, 0.3, 0.9),
      black: std(0x26292d, 0.55, 0.3),
      anod: std(0x33373c, 0.45, 0.6),
      rubber: std(0x1f2124, 0.9),
      pcbBlack: std(0x1d2024, 0.6),
      pcbBlue: std(0x1d4f91, 0.55),
      pcbGreen: std(0x1f6b45, 0.55),
      bread: std(0xf3f2ee, 0.75),
      hole: std(0x44484c, 0.9),
      red: std(0xc8372d, 0.6),
      blue: std(0x1b6c86, 0.6),
      epoxy: std(0x18191b, 0.5),
      tin: std(0xc9ccd0, 0.3, 0.9),
      copper: std(0xb7835a, 0.35, 0.8),
      capBlue: std(0x24457f, 0.45),
      terminal: std(0x2b8a4b, 0.6),
      header: std(0x111214, 0.7),
      phosphor: new THREE.MeshStandardMaterial({ color: 0xf1e9c4, roughness: 0.4, emissive: 0xfff3d6, emissiveIntensity: 0 }),
      white: std(0xf5f5f2, 0.8),
      glass: new THREE.MeshPhysicalMaterial({ color: 0xdfeefa, roughness: 0.02, metalness: 0, transparent: true, opacity: 0.35, depthWrite: false }),
      brass: std(0xb9a26e, 0.4, 0.8),
      label: std(0xe9edf0, 0.9),
      pot: std(0x2a6fb5, 0.5),
    };
  }
  return MATS[k];
}

// --- primitivas en mm ----------------------------------------------------------------------------------------------
/** caja centrada en (x, y, z) */
export function box(w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
/** cilindro de eje Y centrado en (x, y, z) */
export function cyl(r: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 28): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
/** prisma de base cuadrada con esquinas achaflanadas (perfil NEMA), alto en Y, centrado */
function chamferBox(w: number, h: number, d: number, c: number, m: THREE.Material): THREE.Mesh {
  const s = new THREE.Shape();
  const x = w / 2;
  const z = d / 2;
  s.moveTo(-x + c, -z);
  s.lineTo(x - c, -z);
  s.lineTo(x, -z + c);
  s.lineTo(x, z - c);
  s.lineTo(x - c, z);
  s.lineTo(-x + c, z);
  s.lineTo(-x, z - c);
  s.lineTo(-x, -z + c);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  g.translate(0, -h / 2, 0);
  const mesh = new THREE.Mesh(g, m);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
function group(...children: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group();
  g.add(...children);
  return g;
}
/** fila de pines o tornillos como una sola malla instanciada */
function instanced(geo: THREE.BufferGeometry, m: THREE.Material, pts: [number, number, number][]): THREE.InstancedMesh {
  const im = new THREE.InstancedMesh(geo, m, pts.length);
  const o = new THREE.Object3D();
  pts.forEach((p, i) => {
    o.position.set(p[0], p[1], p[2]);
    o.updateMatrix();
    im.setMatrixAt(i, o.matrix);
  });
  im.instanceMatrix.needsUpdate = true;
  im.computeBoundingBox();
  im.computeBoundingSphere();
  return im;
}
/** puntos de anclaje para cables, en el marco local de la pieza */
function anchor(g: THREE.Object3D, name: string, x: number, y: number, z: number): void {
  (g.userData.anchors ??= {})[name] = new THREE.Vector3(x, y, z);
}

export const PITCH = 2.54;

// --- protoboard ----------------------------------------------------------------------------------------------------
/** 830 puntos: 63 columnas × (a–e, f–j) y dos rieles por lado. Origen en el centro de la cara inferior. */
export const BREADBOARD = { w: 165, d: 55, h: 8.5, cols: 63 } as const;
/** posición (x, z) de un agujero de la protoboard: columna 1–63 y fila a–j, o riel '+'/'-' arriba (t) o abajo (b) */
export function breadboardHole(col: number, row: string): { x: number; z: number } {
  const x = (col - 32) * PITCH;
  const rows = 'abcdefghij';
  const i = rows.indexOf(row);
  if (i >= 0) return { x, z: i < 5 ? -3.81 - (4 - i) * PITCH : 3.81 + (i - 5) * PITCH };
  // rieles: el exterior es '+' en el borde superior (z > 0) y '-' en el inferior, como la serigrafía roja/azul
  const rail: Record<string, number> = { 't+': 22.4, 't-': 19.86, 'b-': -19.86, 'b+': -22.4 };
  return { x, z: rail[row] ?? 0 };
}
function buildBreadboard(): THREE.Group {
  const { w, d, h } = BREADBOARD;
  const g = group(box(w, h, d, mat('bread'), 0, h / 2, 0));
  g.add(box(w - 4, 0.6, 2.2, mat('hole'), 0, h + 0.05, 0)); // canal central
  const pts: [number, number, number][] = [];
  for (let c = 1; c <= 63; c++) for (const r of 'abcdefghij') {
    const p = breadboardHole(c, r);
    pts.push([p.x, h + 0.05, p.z]);
  }
  for (let c = 3; c <= 61; c++) {
    if ((c - 3) % 6 === 5) continue; // los rieles van en grupos de 5
    for (const r of ['t+', 't-', 'b-', 'b+']) {
      const p = breadboardHole(c, r);
      pts.push([p.x, h + 0.05, p.z]);
    }
  }
  g.add(instanced(new THREE.BoxGeometry(1, 0.3, 1), mat('hole'), pts));
  for (const [z, m] of [[24.2, 'red'], [18.1, 'blue'], [-18.1, 'blue'], [-24.2, 'red']] as const) g.add(box(w - 10, 0.15, 0.5, mat(m), 0, h + 0.05, z));
  return g;
}

// --- motor NEMA 17 17HS8401 ----------------------------------------------------------------------------------------
/** origen en el centro de la cara inferior del cuerpo; la cara de montaje está en y = 48 y el eje sube 24 mm */
export const NEMA17 = { side: 42.3, length: 48, cap: 9, boss: 22, bossH: 2, shaftD: 5, shaftL: 24, holes: 31 } as const;
function buildNema17(): THREE.Group {
  const n = NEMA17;
  const g = new THREE.Group();
  const capB = chamferBox(n.side, n.cap, n.side, 4, mat('alu'));
  capB.position.y = n.cap / 2;
  const stack = chamferBox(n.side - 0.4, n.length - 2 * n.cap, n.side - 0.4, 4, mat('black'));
  stack.position.y = n.length / 2;
  const capT = chamferBox(n.side, n.cap, n.side, 4, mat('alu'));
  capT.position.y = n.length - n.cap / 2;
  g.add(capB, stack, capT);
  g.add(cyl(n.boss / 2, n.bossH, mat('alu'), 0, n.length + n.bossH / 2, 0, 36));
  const shaft = new THREE.Group();
  shaft.name = 'motor-shaft';
  shaft.add(cyl(n.shaftD / 2, n.shaftL, mat('steel'), 0, n.length + n.shaftL / 2, 0, 16));
  shaft.add(box(n.shaftD * 0.6, n.shaftL - 6, 0.6, mat('black'), 0, n.length + n.shaftL / 2 + 3, n.shaftD / 2 - 0.25)); // cara plana en D
  g.add(shaft);
  g.userData.spin = shaft;
  const holes = instanced(new THREE.CylinderGeometry(1.5, 1.5, 0.4, 12), mat('hole'), [-1, 1].flatMap((sx) => [-1, 1].map((sz) => [(sx * n.holes) / 2, n.length + 0.15, (sz * n.holes) / 2] as [number, number, number])));
  g.add(holes);
  // conector JST-PH de 6 vías y etiqueta
  g.add(box(13, 5.5, 6, mat('white'), 0, 7, n.side / 2 + 3));
  g.add(box(30, 18, 0.2, mat('label'), 0, n.length / 2, -n.side / 2 - 0.15));
  anchor(g, 'conn', 0, 7, n.side / 2 + 6);
  return g;
}

// --- DM542 ---------------------------------------------------------------------------------------------------------
/** 118 × 75,5 × 34 mm (hoja de datos de Leadshine); bornes en la cara +z */
function buildDm542(): THREE.Group {
  const L = 118;
  const W = 75.5;
  const H = 34;
  const g = group(box(L, H - 6, W, mat('anod'), 0, (H - 6) / 2, 0));
  for (let i = 0; i < 9; i++) g.add(box(L - 6, 6, 1.6, mat('anod'), 0, H - 3, -W / 2 + 6 + i * ((W - 12) / 8)));
  for (const s of [-1, 1]) g.add(box(7, 2, W - 10, mat('anod'), s * (L / 2 + 3.5), 1, 0)); // pestañas de montaje
  // dos bornas verdes de 6 vías (señal y potencia)
  const block = (x0: number) => {
    g.add(box(31, 9, 8, mat('terminal'), x0, 9, W / 2 + 4));
    g.add(instanced(new THREE.CylinderGeometry(1.4, 1.4, 1, 10), mat('tin'), Array.from({ length: 6 }, (_, k) => [x0 - 12.7 + k * 5.08, 13.8, W / 2 + 4] as [number, number, number])));
  };
  block(-30);
  block(30);
  g.add(box(20, 1, 9, mat('red'), 30, H + 0.1, -18)); // interruptores DIP
  g.add(box(46, 0.2, 30, mat('label'), -22, H + 0.1, 10));
  const names = ['PUL+', 'PUL-', 'DIR+', 'DIR-', 'ENA+', 'ENA-'];
  names.forEach((nm, k) => anchor(g, nm, -30 - 12.7 + k * 5.08, 13, W / 2 + 8));
  ['GND', '+V', 'A+', 'A-', 'B+', 'B-'].forEach((nm, k) => anchor(g, nm, 30 - 12.7 + k * 5.08, 13, W / 2 + 8));
  return g;
}

// --- fuente conmutada 24 V 5 A ---------------------------------------------------------------------------------------
function buildPsu(): THREE.Group {
  const L = 199;
  const W = 98;
  const H = 42;
  const g = group(box(L, H, W, mat('alu'), 0, H / 2, 0));
  // perforado superior
  const pts: [number, number, number][] = [];
  for (let i = 0; i < 14; i++) for (let j = 0; j < 7; j++) pts.push([-L / 2 + 30 + i * 9, H + 0.05, -W / 2 + 14 + j * 11]);
  g.add(instanced(new THREE.CylinderGeometry(2.6, 2.6, 0.2, 6), mat('hole'), pts));
  // regleta de 7 bornes en el extremo +x
  g.add(box(12, 14, 80, mat('black'), L / 2 - 6, H - 7, 0));
  g.add(instanced(new THREE.CylinderGeometry(1.8, 1.8, 1, 10), mat('tin'), Array.from({ length: 7 }, (_, k) => [L / 2 - 6, H + 0.4, -34 + k * 11.33] as [number, number, number])));
  ['L', 'N', 'PE', '-V', '-V', '+V', '+V'].forEach((nm, k) => anchor(g, k === 3 ? '-V' : k === 5 ? '+V' : `${nm}${k}`, L / 2 - 6, H + 1, -34 + k * 11.33));
  g.add(cyl(1.4, 1.2, mat('terminal'), L / 2 - 16, H + 0.5, 40, 10)); // LED de encendido
  return g;
}

// --- LM2596 ----------------------------------------------------------------------------------------------------------
function buildLm2596(): THREE.Group {
  const g = group(box(43, 1.6, 21, mat('pcbBlue'), 0, 0.8, 0));
  g.add(box(12, 7, 12, mat('black'), -8, 5.1, 2)); // bobina blindada
  g.add(cyl(4, 11, mat('black'), -18, 7.1, -5, 16), cyl(4, 11, mat('black'), 15, 7.1, -5, 16));
  g.add(box(10, 4.5, 9, mat('epoxy'), 5, 3.85, 4)); // LM2596 TO-263
  g.add(box(9.5, 10, 4.8, mat('pot'), 12, 6.6, -6)); // potenciómetro multivuelta
  g.add(cyl(1.3, 1, mat('brass'), 9, 12, -6, 10));
  anchor(g, 'IN+', -20, 2, 9);
  anchor(g, 'IN-', -20, 2, -9);
  anchor(g, 'OUT+', 20, 2, 9);
  anchor(g, 'OUT-', 20, 2, -9);
  return g;
}

// --- ESP32 DevKitC V4 y su placa de expansión ----------------------------------------------------------------------
/** separación entre filas de pines del DevKitC (25,4 mm): por eso no deja agujeros libres en una protoboard */
export const ESP32_ROW = 25.4;
function buildEsp32(): THREE.Group {
  const L = 54.4;
  const W = 27.9;
  const g = group(box(L, 1.6, W, mat('pcbBlack'), 0, 0.8, 0));
  // módulo WROOM-32D con su blindaje; la antena sobresale por el extremo +x
  g.add(box(25.5, 0.8, 18, mat('pcbBlack'), L / 2 - 12.75, 2, 0)); // la antena queda al ras del borde
  g.add(box(17.6, 2.4, 16, mat('tin'), L / 2 - 16.7, 3.6, 0));
  g.add(box(8, 3, 7.5, mat('tin'), -L / 2 + 4, 3.1, 0)); // micro USB
  g.add(box(4, 1.5, 3, mat('black'), -L / 2 + 10, 2.35, -9), box(4, 1.5, 3, mat('black'), -L / 2 + 10, 2.35, 9)); // EN y BOOT
  // dos filas de 19 pines hacia abajo
  for (const s of [-1, 1]) {
    g.add(box(48.3, 2.5, 2.5, mat('header'), 0, -1.25, (s * ESP32_ROW) / 2));
    g.add(instanced(new THREE.BoxGeometry(0.64, 6, 0.64), mat('tin'), Array.from({ length: 19 }, (_, k) => [-22.86 + k * PITCH, -5.5, (s * ESP32_ROW) / 2] as [number, number, number])));
  }
  return g;
}
/** placa de expansión de 38 pines: el ESP32 se inserta arriba en y = 10 (encima de los zócalos hembra) */
export const EXPANSION = { w: 77, d: 53, socketTop: 10 } as const;
function buildExpansion(): THREE.Group {
  const { w, d } = EXPANSION;
  const g = group(box(w, 1.6, d, mat('pcbBlack'), 0, 0.8, 0));
  for (const s of [-1, 1]) {
    g.add(box(48.3, 8.4, 2.6, mat('header'), 0, 5.8, (s * ESP32_ROW) / 2)); // zócalos hembra
    // tres filas macho por lado: GPIO, V, G
    for (let r = 0; r < 3; r++) g.add(instanced(new THREE.BoxGeometry(0.64, 6, 0.64), mat('tin'), Array.from({ length: 19 }, (_, k) => [-22.86 + k * PITCH, 4.6, s * (17.8 + r * PITCH)] as [number, number, number])));
    g.add(box(48.3, 2.5, 3 * PITCH, mat('header'), 0, 2.85, s * (17.8 + PITCH)));
  }
  g.add(box(14, 11, 9, mat('black'), w / 2 - 7, 7.1, 0)); // jack DC
  g.add(box(8, 8, 7.5, mat('terminal'), -w / 2 + 5, 5.6, -14));
  // pines usados (GPIO en la fila exterior, a partir del extremo −x)
  const gpio = (name: string, k: number, side: 1 | -1) => anchor(g, name, -22.86 + k * PITCH, 8, side * 17.8);
  gpio('GPIO25', 9, -1); // PUL
  gpio('GPIO26', 10, -1); // DIR
  gpio('GPIO27', 11, -1); // LED (al IR2101)
  gpio('GPIO34', 4, -1); // sensor
  anchor(g, '5V', -22.86 + 18 * PITCH, 8, -(17.8 + PITCH));
  anchor(g, 'GND', -22.86 + 18 * PITCH, 8, -(17.8 + 2 * PITCH));
  anchor(g, 'GND2', -22.86 + 1 * PITCH, 8, 17.8 + 2 * PITCH);
  return g;
}

// --- semiconductores y pasivos (origen = superficie de la protoboard en el pin central) ------------------------------
function legs(xs: number[], z: number, top: number): THREE.InstancedMesh {
  return instanced(new THREE.BoxGeometry(0.6, top + 2, 0.5), mat('tin'), xs.map((x) => [x, top / 2 - 1, z] as [number, number, number]));
}
function buildTo220(): THREE.Group {
  // IRLZ44N de pie: patas G D S a 2,54 mm, aleta metálica atrás
  const g = group(legs([-PITCH, 0, PITCH], 0, 4), box(10.2, 9.2, 4.5, mat('epoxy'), 0, 4 + 4.6, 0));
  const tab = box(10.2, 6.5, 1.3, mat('tin'), 0, 4 + 9.2 + 3.25, -1.6);
  g.add(tab, cyl(1.8, 1.4, mat('hole'), 0, 4 + 9.2 + 3.6, -1.6, 12).rotateX(Math.PI / 2));
  return g;
}
function buildDip8(): THREE.Group {
  // IR2101 sobre el canal central: filas a 7,62 mm
  const xs = [-1.5, -0.5, 0.5, 1.5].map((k) => k * PITCH);
  const g = group(legs(xs, -3.81, 1.2), legs(xs, 3.81, 1.2), box(9.8, 3.3, 6.35, mat('epoxy'), 0, 1.2 + 1.65, 0));
  g.add(cyl(0.6, 0.2, mat('hole'), -3.6, 4.6, -2, 10));
  return g;
}
function buildTo92(): THREE.Group {
  const body = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 4.8, 20, 1, false, -Math.PI / 2, Math.PI), mat('epoxy'));
  body.position.y = 3 + 2.4;
  body.castShadow = true;
  return group(legs([-PITCH, 0, PITCH], 0, 3), body, box(4.8, 4.8, 0.2, mat('epoxy'), 0, 5.4, 0));
}
function buildCap1000(): THREE.Group {
  const g = group(cyl(8, 25, mat('capBlue'), 0, 1.5 + 12.5, 0, 32), cyl(7.6, 0.4, mat('tin'), 0, 26.7, 0, 32));
  g.add(box(3, 24, 0.4, mat('white'), 0, 14, 7.9)); // franja del negativo
  g.add(legs([-3.75, 3.75], 0, 1.5));
  return g;
}
function buildRes10w(): THREE.Group {
  // resistencia de potencia en cuerpo de aluminio con aletas; se atornilla y se suelda con cable
  const g = group(box(42, 2, 22, mat('alu'), 0, 1, 0), box(29, 13, 16, mat('alu'), 0, 2 + 6.5, 0));
  for (const s of [-1, 1]) g.add(box(29, 11, 1.4, mat('alu'), 0, 2 + 5.5, s * 9.5));
  for (const s of [-1, 1]) g.add(box(5, 1, 3, mat('tin'), s * 17.5, 9, 0), cyl(1.6, 2.2, mat('hole'), s * 17.5, 1, 7.5, 10));
  anchor(g, 'a', -19, 9, 0);
  anchor(g, 'b', 19, 9, 0);
  return g;
}
function buildResistor(): THREE.Group {
  // 1/4 W acostada entre dos agujeros a 10,16 mm
  const body = cyl(1.2, 6.3, mat('label'), 0, 3.5, 0, 14);
  body.rotation.z = Math.PI / 2;
  const lead = cyl(0.3, 10.2, mat('tin'), 0, 3.5, 0, 8);
  lead.rotation.z = Math.PI / 2;
  return group(body, lead, cyl(0.3, 3.5, mat('tin'), -5.08, 1.75, 0, 8), cyl(0.3, 3.5, mat('tin'), 5.08, 1.75, 0, 8));
}

// --- óptica y luz ----------------------------------------------------------------------------------------------------
/** LED de 10 W tipo COB sobre su base; el emisor mira a +Z; origen en la cara trasera */
function buildLed10(): THREE.Group {
  const g = group(box(20, 20, 1.6, mat('alu'), 0, 0, 0.8), box(15, 15, 0.8, mat('white'), 0, 0, 2));
  const emitter = box(10.8, 10.8, 0.5, mat('phosphor'), 0, 0, 2.6);
  g.add(emitter);
  g.userData.emitter = emitter.material;
  g.add(box(4, 3, 0.3, mat('copper'), -7.5, 0, 1.75), box(4, 3, 0.3, mat('copper'), 7.5, 0, 1.75));
  anchor(g, '+', -8.5, 0, 2);
  anchor(g, '-', 8.5, 0, 2);
  return g;
}
/** disipador de 40 × 40 mm con aletas hacia −Z; origen en su cara delantera */
function buildHeatsink(): THREE.Group {
  const g = group(box(40, 40, 4, mat('alu'), 0, 0, -2));
  for (let i = 0; i < 9; i++) g.add(box(1.2, 40, 16, mat('alu'), -18 + i * 4.5, 0, -12));
  return g;
}
/** dos plano-convexas Ø40 en un tubo impreso; origen en la cara trasera, la luz sale hacia +Z */
function buildCondenser(): THREE.Group {
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(22, 22, 24, 40, 1, true), mat('plaDark'));
  tube.rotation.x = Math.PI / 2;
  tube.position.z = 12;
  (tube.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
  const lens = (z: number, flip: boolean) => {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(42, 40, 8, 0, Math.PI * 2, 0, Math.asin(20 / 42)), mat('glass'));
    cap.rotation.x = flip ? -Math.PI / 2 : Math.PI / 2;
    cap.position.z = flip ? z - 42 * Math.cos(Math.asin(20 / 42)) : z + 42 * Math.cos(Math.asin(20 / 42));
    const flat = new THREE.Mesh(new THREE.CircleGeometry(20, 40), mat('glass'));
    flat.position.z = z;
    flat.rotation.y = flip ? 0 : Math.PI;
    return [cap, flat];
  };
  return group(tube, ...lens(6, true), ...lens(18, false));
}
/** objetivo de 50 mm f/1.8 para réflex: Ø64 × 40 mm; eje +Z hacia la pantalla; origen en la montura */
function buildLens(): THREE.Group {
  const barrel = cyl(32, 40, mat('black'), 0, 0, 0, 48);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.z = 20;
  const ring = cyl(32.6, 10, mat('rubber'), 0, 0, 0, 48);
  ring.rotation.x = Math.PI / 2;
  ring.position.z = 26;
  const mount = cyl(24, 4, mat('steel'), 0, 0, 0, 40);
  mount.rotation.x = Math.PI / 2;
  mount.position.z = -2;
  const front = new THREE.Mesh(new THREE.CircleGeometry(20, 40), mat('glass'));
  front.position.z = 40.1;
  return group(barrel, ring, mount, front);
}

// --- sensor de barrera F249 ----------------------------------------------------------------------------------------
/** horquilla ITR9608 con ranura de 5 mm; aquí la abertura mira hacia −Y (cuelga sobre el borde de la película) */
export const F249 = { slotW: 5, slotDepth: 8, beamFromMouth: 2.6 } as const;
function buildF249(): THREE.Group {
  const g = new THREE.Group();
  // PCB arriba, horquilla colgando: la boca de la ranura queda en y = 0
  const pcbY = 11 + 0.8;
  g.add(box(32, 1.6, 14, mat('pcbBlue'), 4, pcbY, 0));
  for (const s of [-1, 1]) g.add(box(6.3, 11, 9.75, mat('epoxy'), 0, 5.5, s * (F249.slotW / 2 + 9.75 / 2)));
  g.add(box(6.3, 3, F249.slotW + 19.5, mat('epoxy'), 0, 11 - 1.5, 0));
  g.add(box(5, 1.5, 4, mat('epoxy'), 10, pcbY + 1.55, 3)); // LM393
  g.add(box(2.5, 8.5, 7.6, mat('header'), 18.5, pcbY + 5, 0)); // conector de 3 pines
  anchor(g, 'VCC', 18.5, pcbY + 9, -PITCH);
  anchor(g, 'GND', 18.5, pcbY + 9, 0);
  anchor(g, 'DO', 18.5, pcbY + 9, PITCH);
  return g;
}

// --- transmisión ---------------------------------------------------------------------------------------------------
/** cople flexible D19L25 de aluminio, eje Y centrado */
function buildCoupling(): THREE.Group {
  const g = group(cyl(9.5, 25, mat('alu'), 0, 0, 0, 32));
  for (let k = 0; k < 4; k++) {
    const t = new THREE.Mesh(new THREE.TorusGeometry(9.55, 0.45, 6, 32), mat('black'));
    t.rotation.x = Math.PI / 2;
    t.position.y = -7.5 + k * 5;
    g.add(t);
  }
  g.add(box(1.6, 3, 3, mat('black'), 9.3, 9, 0), box(1.6, 3, 3, mat('black'), 9.3, -9, 0)); // prisioneros
  return g;
}
/** rodamiento 608ZZ (8 × 22 × 7), eje Y centrado */
function buildBearing(): THREE.Group {
  const outer = new THREE.Mesh(new THREE.CylinderGeometry(11, 11, 7, 36, 1, true), mat('steel'));
  const shield = new THREE.Mesh(new THREE.RingGeometry(4, 11, 36), mat('steel'));
  shield.rotation.x = -Math.PI / 2;
  shield.position.y = 3.5;
  const shield2 = shield.clone();
  shield2.position.y = -3.5;
  shield2.rotation.x = Math.PI / 2;
  return group(outer, shield, shield2, new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 7, 20, 1, true), mat('steel')));
}
/** soporte en L de acero para NEMA 17: placa horizontal de 3 mm con el motor colgando y ala vertical hacia la tabla */
function buildBracket(): THREE.Group {
  const g = group(box(49, 3, 49, mat('steel'), 0, 1.5, 0), box(49, 38, 3, mat('steel'), 0, 3 + 19, -26));
  g.add(cyl(11.5, 3.2, mat('hole'), 0, 1.5, 0, 24));
  return g;
}

/**
 * Rodillo impreso: cuerpo Ø2R, pestañas guía de +2 mm, cubo para dos 608ZZ y aligeramientos. Eje Y, origen en la base
 * del cuerpo. `drive` añade la banda de goma de agarre.
 */
export function buildRoller(R: number, bodyH: number, drive = false): THREE.Group {
  const g = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(R, R, bodyH, 72, 1, true), mat('pla'));
  shell.position.y = bodyH / 2;
  (shell.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
  shell.castShadow = true;
  g.add(shell);
  for (const y of [0, bodyH]) {
    const f = new THREE.Mesh(new THREE.CylinderGeometry(R + 2, R + 2, 1.6, 72), mat('pla'));
    f.position.y = y;
    f.castShadow = true;
    g.add(f);
  }
  // disco central con seis aligeramientos y cubo
  const disc = new THREE.Shape();
  disc.absarc(0, 0, R - 0.5, 0, Math.PI * 2, false);
  for (let k = 0; k < 6; k++) {
    const a = (k * Math.PI) / 3;
    const hole = new THREE.Path();
    hole.absarc(Math.cos(a) * R * 0.58, Math.sin(a) * R * 0.58, R * 0.22, 0, Math.PI * 2, true);
    disc.holes.push(hole);
  }
  const hub = new THREE.Path();
  hub.absarc(0, 0, 11, 0, Math.PI * 2, true);
  disc.holes.push(hub);
  const dg = new THREE.ExtrudeGeometry(disc, { depth: 3, bevelEnabled: false, curveSegments: 36 });
  dg.rotateX(-Math.PI / 2);
  for (const y of [bodyH * 0.25, bodyH * 0.75]) {
    const d = new THREE.Mesh(dg, mat('pla'));
    d.position.y = y - 1.5;
    d.castShadow = true;
    g.add(d);
  }
  const hubTube = new THREE.Mesh(new THREE.CylinderGeometry(13, 13, bodyH, 32, 1, true), mat('pla'));
  hubTube.position.y = bodyH / 2;
  g.add(hubTube);
  if (drive) {
    const grip = cyl(R + 0.4, bodyH - 8, mat('rubber'), 0, bodyH / 2, 0, 72);
    g.add(grip);
  }
  g.add(box(R * 0.5, 0.6, 2, mat('red'), R * 0.62, bodyH + 0.9, 0)); // marca de giro
  return g;
}

// --- caja de control y base ----------------------------------------------------------------------------------------
/** caja de acrílico transparente de 3 mm: origen en el centro de la cara inferior */
export function buildAcrylicBox(w: number, d: number, h: number): THREE.Group {
  const t = 3;
  const a = mat('acrylic');
  const g = group(box(w, t, d, a, 0, t / 2, 0), box(w, t, d, a, 0, h - t / 2, 0));
  g.add(box(w, h - 2 * t, t, a, 0, h / 2, d / 2 - t / 2), box(w, h - 2 * t, t, a, 0, h / 2, -d / 2 + t / 2));
  g.add(box(t, h - 2 * t, d - 2 * t, a, w / 2 - t / 2, h / 2, 0), box(t, h - 2 * t, d - 2 * t, a, -w / 2 + t / 2, h / 2, 0));
  // aristas visibles
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)), new THREE.LineBasicMaterial({ color: 0x7d9aa4, transparent: true, opacity: 0.8 }));
  edges.position.y = h / 2;
  edges.raycast = () => {};
  g.add(edges);
  return g;
}
function buildStandoff(): THREE.Group {
  return group(cyl(2.9, 80, mat('brass'), 0, 40, 0, 6));
}

// --- catálogo --------------------------------------------------------------------------------------------------------
export const KINDS: Record<string, KindSpec> = {
  nema17: {
    name: 'Motor paso a paso NEMA 17 17HS8401',
    realMm: [42.3, 42.3, 48],
    material: 'Carcasa de aluminio y paquete de chapas',
    specs: ['1,8° por paso (200 pasos/vuelta)', '1,8 A por fase · 52 N·cm', 'Eje Ø5 × 24 mm con cara plana en D', 'Centrador Ø22 × 2 mm · 4 × M3 a 31 mm', 'Masa ≈ 350 g'],
    pins: ['A+ negro', 'A− verde', 'B+ rojo', 'B− azul (confirmar colores con un multímetro: cada par mide unos ohms)'],
    source: 'Ficha de UNIT Electronics (17HS8401, 48 mm) y patrón NEMA 17',
    build: buildNema17,
  },
  dm542: {
    name: 'Driver de motor DM542',
    realMm: [118, 75.5, 34],
    material: 'Carcasa de aluminio anodizado (disipador)',
    specs: ['20–50 V DC · hasta 4,2 A', 'Microstepping por interruptores DIP', 'Entradas optoacopladas de 5 V'],
    pins: ['PUL+ / DIR+ a 5 V', 'PUL− / DIR− a los colectores de los S8050', 'A+ A− B+ B− al motor', '+V y GND a 24 V'],
    source: 'Hoja de datos de Leadshine DM542 (118 × 75,5 × 34 mm)',
    build: buildDm542,
  },
  psu: {
    name: 'Fuente conmutada 24 V 5 A (UE-120-24)',
    realMm: [199, 98, 42],
    material: 'Chasis de lámina perforada',
    specs: ['Entrada 100–240 V AC', 'Salida 24 V · 5 A · 120 W', 'Ajuste fino de voltaje con potenciómetro'],
    pins: ['L · N · tierra (cable AC)', '+V / −V a DM542, LM2596 y riel del LED'],
    source: 'Formato habitual de las fuentes de 120 W; UNIT no publica medidas',
    approx: true,
    build: buildPsu,
  },
  lm2596: {
    name: 'Regulador LM2596 step-down',
    realMm: [43, 21, 14],
    material: 'PCB con bobina blindada',
    specs: ['Entrada 4,5–40 V', 'Salida ajustable 1,25–30 V · 3 A', 'Ajustar con multímetro antes de conectar la carga'],
    pins: ['IN+ / IN− desde 24 V', 'OUT+ / OUT− a 5 V (uno) o 12 V (otro)'],
    source: 'Módulo estándar de 43 × 21 mm',
    approx: true,
    build: buildLm2596,
  },
  esp32: {
    name: 'ESP32 DevKitC V4 (WROOM-32D)',
    realMm: [54.4, 27.9, 10],
    material: 'PCB negra con módulo blindado',
    specs: ['Se programa desde el IDE de Arduino: hace de «Arduino» en este montaje', 'Temporizadores de hardware para los pasos y el pulso del LED', 'Filas de pines a 25,4 mm: en una protoboard no deja agujeros libres en uno de los lados; por eso va en su placa de expansión'],
    pins: ['GPIO25 → PUL (por S8050)', 'GPIO26 → DIR (por S8050)', 'GPIO27 → LIN del IR2101', 'GPIO34 ← salida del sensor F249', '5V y GND desde el LM2596 de 5 V'],
    source: 'Documentación de Espressif (ESP32-DevKitC V4)',
    build: buildEsp32,
  },
  expansion: {
    name: 'Placa de expansión para ESP32 de 38 pines',
    realMm: [77, 53, 12],
    material: 'PCB con zócalos hembra',
    specs: ['Cada GPIO sale con sus pines de voltaje y tierra', 'Jack de alimentación DC y bornera'],
    pins: ['Jumpers hembra-macho de sus pines GPIO a la protoboard'],
    source: 'UNIT Placa de Expansión para ESP32 38 pines; medidas de una placa equivalente',
    approx: true,
    build: buildExpansion,
  },
  breadboard: {
    name: 'Protoboard de 830 puntos',
    realMm: [165, 55, 8.5],
    material: 'Plástico ABS con contactos de bronce fosforado',
    specs: ['63 columnas × 10 filas y dos rieles por lado', 'Contactos de ~1 A: el pulso de 4 A dura 115 µs y su valor eficaz es ~0,2 A'],
    pins: ['Riel superior: +24 V y GND del LED', 'Riel inferior: +5 V, +12 V y GND de la lógica'],
    source: 'Formato estándar MB-102',
    build: buildBreadboard,
  },
  irlz44n: {
    name: 'MOSFET IRLZ44N (TO-220)',
    realMm: [10.2, 4.5, 15.7],
    material: 'Encapsulado TO-220 con aleta',
    specs: ['55 V · 47 A · R_DS(on) 22 mΩ a 5 V', 'Conmuta el pulso del LED en el lado bajo'],
    pins: ['G ← LO del IR2101 por 10 Ω', 'D ← cátodo del LED', 'S → GND'],
    source: 'Hoja de datos de Infineon (TO-220AB)',
    build: buildTo220,
  },
  ir2101: {
    name: 'Driver de compuerta IR2101 (DIP-8)',
    realMm: [9.8, 6.35, 4.5],
    material: 'Encapsulado DIP-8',
    specs: ['Solo se usa el canal bajo', 'VCC 12 V con 100 nF y 10 µF junto al pin', 'Confirmar en la hoja de datos que LIN acepte 3,3 V'],
    pins: ['1 VCC 12 V', '2 HIN a GND', '3 LIN ← GPIO27', '4 COM GND', '5 LO → compuerta', '6–8 sin usar'],
    source: 'Hoja de datos de Infineon (PDIP-8)',
    build: buildDip8,
  },
  s8050: {
    name: 'Transistor NPN S8050 (TO-92)',
    realMm: [4.8, 3.8, 8],
    material: 'Encapsulado TO-92',
    specs: ['Convierte 3,3 V del ESP32 en las entradas de 5 V del DM542', 'Base con 1 kΩ'],
    pins: ['E → GND', 'B ← GPIO por 1 kΩ', 'C → PUL− o DIR−'],
    source: 'Encapsulado TO-92 estándar',
    build: buildTo92,
  },
  cap1000: {
    name: 'Capacitor electrolítico 1000 µF 50 V',
    realMm: [16, 16, 25],
    material: 'Aluminio con funda',
    specs: ['Tres en paralelo entregan el pico del LED', 'La franja blanca marca el negativo'],
    pins: ['+ al riel de 24 V', '− a GND'],
    source: 'Tamaño habitual de 1000 µF a 50 V',
    approx: true,
    build: buildCap1000,
  },
  res10w: {
    name: 'Resistencia de aluminio 10 W (3,3 Ω)',
    realMm: [42, 22, 15],
    material: 'Cuerpo de aluminio con aletas',
    specs: ['Limita el pulso a ~3,6 A', 'No entra en la protoboard: va atornillada y con cable soldado'],
    pins: ['a ← +24 V', 'b → ánodo del LED'],
    source: 'Formato de las resistencias de aluminio de 10 W',
    approx: true,
    build: buildRes10w,
  },
  resistor: {
    name: 'Resistencia 1/4 W',
    realMm: [6.3, 2.4, 2.4],
    material: 'Película de carbón',
    specs: ['1 kΩ en las bases de los S8050; 10 Ω y 10 kΩ en la compuerta del MOSFET'],
    build: buildResistor,
  },
  led10: {
    name: 'LED blanco frío de 10 W',
    realMm: [20, 20, 3],
    material: 'Base de aluminio con emisor de fósforo',
    specs: ['Emisor de 10,8 × 10,8 mm: la lente f/1.8 admite ~42 % de su luz', 'Pulso de ~4 A durante 115 µs, disparado por la marca de cada fotograma', 'Flujo de pico estimado en 3000 lm: medir en banco'],
    pins: ['+ ← resistencia de 3,3 Ω', '− → drenador del IRLZ44N'],
    source: 'Ficha de UNIT Electronics; base de 20 mm aproximada',
    approx: true,
    build: buildLed10,
  },
  heatsink: {
    name: 'Disipador de aluminio 40 × 40 mm',
    realMm: [40, 20, 40],
    material: 'Aluminio extruido',
    specs: ['La potencia media es pequeña (pulsos de 115 µs a 24 Hz): basta con este disipador, sin ventilador'],
    approx: true,
    build: buildHeatsink,
  },
  condenser: {
    name: 'Condensador: dos lentes plano-convexas Ø40 mm',
    realMm: [44, 44, 24],
    material: 'Vidrio óptico en tubo impreso',
    specs: ['Concentra la luz del LED en la ventana', 'Ø40 mm cubre la diagonal de 37,7 mm del fotograma'],
    approx: true,
    build: buildCondenser,
  },
  lens: {
    name: 'Objetivo de 50 mm f/1.8 para réflex de 35 mm',
    realMm: [64, 64, 40],
    material: 'Barril metálico',
    specs: ['Cubre la diagonal de 37,7 mm del fotograma (una lente CCTV no)', 'Enfoque moviendo la distancia película–lente'],
    source: 'Medidas típicas de un 50 mm f/1.8',
    approx: true,
    build: buildLens,
  },
  f249: {
    name: 'Sensor de barrera F249 (horquilla ITR9608)',
    realMm: [32, 14, 13],
    material: 'PCB con horquilla óptica',
    specs: ['Ranura de 5 mm: el borde superior de la película pasa por ella', 'El haz queda a ~2,6 mm de la boca: la marca de sincronía mide 5 mm desde el borde', 'Probar con la tinta real: muchas tintas son transparentes al infrarrojo'],
    pins: ['VCC 5 V', 'GND', 'DO → GPIO34 (confirmar serigrafía)'],
    source: 'Módulo de horquilla común; medidas aproximadas',
    approx: true,
    build: buildF249,
  },
  coupling: {
    name: 'Cople flexible D19L25 5 × 8 mm',
    realMm: [19, 19, 25],
    material: 'Aluminio',
    specs: ['Une el eje de 5 mm del motor con el de 8 mm del rodillo', 'Tolera desalineación: no hacen falta bandas'],
    build: buildCoupling,
  },
  bearing: {
    name: 'Rodamiento 608ZZ',
    realMm: [22, 22, 7],
    material: 'Acero con tapas metálicas',
    specs: ['8 × 22 × 7 mm', 'Dos por rodillo'],
    build: buildBearing,
  },
  bracket: {
    name: 'Soporte de acero para NEMA 17',
    realMm: [49, 49, 41],
    material: 'Acero de 3 mm',
    specs: ['Cuelga el motor bajo la cubierta, alineado con el eje del rodillo motriz'],
    approx: true,
    build: buildBracket,
  },
  standoff: {
    name: 'Separador hexagonal M3 × 80 mm (dos de 40)',
    realMm: [5.8, 5.8, 80],
    material: 'Latón',
    specs: ['Sostienen la caja de control por encima de los rodillos'],
    build: buildStandoff,
  },
};

/** construye una pieza del catálogo con sus metadatos en userData */
export function buildKind(kind: string): THREE.Group {
  const spec = KINDS[kind];
  if (!spec) throw new Error(`Pieza desconocida: ${kind}`);
  const g = spec.build();
  g.userData.kind = kind;
  return g;
}

/** caja que envuelve la pieza en su propio marco (mm) */
export function localBox(root: THREE.Object3D): THREE.Box3 {
  const out = new THREE.Box3();
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const tmp = new THREE.Box3();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.visible) return;
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    if ((m as unknown as THREE.InstancedMesh).isInstancedMesh) {
      const im = m as unknown as THREE.InstancedMesh;
      if (!im.boundingBox) im.computeBoundingBox();
      tmp.copy(im.boundingBox!);
    } else tmp.copy(m.geometry.boundingBox!);
    tmp.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
    out.union(tmp);
  });
  return out;
}

/**
 * Pieza del catálogo que dibuja cada renglón de la lista de compras (para el visor 3D de la página de compras).
 * Los renglones sin forma propia (película, cinta, servicios) no aparecen.
 */
export const BOM_KIND: Record<string, string> = {
  'motor-17hs8401': 'nema17',
  'driver-dm542': 'dm542',
  'npn-s8050': 's8050',
  'bracket-nema17': 'bracket',
  rollers: 'roller',
  'bearing-608': 'bearing',
  'coupling-5-8': 'coupling',
  'lens-50mm': 'lens',
  condenser: 'condenser',
  'led-10w': 'led10',
  'led-heatsink': 'heatsink',
  'led-mosfet': 'irlz44n',
  'led-gate-driver': 'ir2101',
  'led-caps': 'cap1000',
  'led-resistor': 'res10w',
  'small-resistors': 'resistor',
  esp32: 'esp32',
  'esp32-expansion': 'expansion',
  'breadboard-kit': 'breadboard',
  'sensor-f249': 'f249',
  'psu-24v-5a': 'psu',
  'buck-lm2596': 'lm2596',
  standoffs: 'standoff',
};
