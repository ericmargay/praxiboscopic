// Lo que se le pide a cada taller para fabricar la mesa de dos tambores (ADR-0012): el mensaje para cotizar el corte
// láser y el de impresión 3D, las tablas de piezas y el README del paquete (public/fabricacion/tambores). Es puro: lo
// usan la página de compras (sección «Fabricación») y scripts/fabricar.mjs, así que los dos dicen lo mismo.
import { SHEET_MATERIALS, type ReelsStructure, type SheetMaterial } from '../mech/structure';
import type { LaserQuantities, PrintQuantities } from './quantities';
import { PETG_G_CM3, printedGrams, type PrintedPart } from './printed';

/** carpeta del paquete dentro de public/ (la sirve Vite y va al sitio) */
export const FAB_DIR = 'fabricacion/tambores';
/** prefijo de los archivos de corte por material */
export const LASER_PREFIX: Record<SheetMaterial, string> = { mdf: 'mesa-tambores-mdf-5.5mm', 'acrilico-3': 'mesa-tambores-acrilico-transparente-3mm', 'acrilico-negro-3': 'mesa-tambores-acrilico-negro-3mm' };
export const ZIP_NAME = 'mesa-tambores-taller.zip';

/** decimales con coma, como el resto de la obra */
const n1 = (x: number) => (Math.round(x * 10) / 10).toString().replace('.', ',');
const n2 = (x: number) => (Math.round(x * 100) / 100).toString().replace('.', ',');

/** «Archivo x-hoja-1» o «Archivos x-hoja-1 y -hoja-2» */
function sheetFiles(e: LaserQuantities | undefined, prefix: string): string {
  const n = e?.sheets ?? 1;
  return n === 1 ? `Archivo ${prefix}-hoja-1` : `Archivos ${prefix}-hoja-1 a -hoja-${n}`;
}

/** mensaje para cotizar el corte láser (WhatsApp o correo) */
export function laserRequestText(st: ReelsStructure, laser: LaserQuantities[]): string {
  const L = (m: SheetMaterial) => laser.find((x) => x.material === m);
  const mdf = L('mdf');
  const acr = L('acrilico-3');
  const blk = L('acrilico-negro-3');
  const t = st.mdfMm;
  const lines = [
    'Hola, buen día. Quiero cotizar un corte láser CO2 con material incluido, para recoger en CDMX.',
    '',
    `1) MDF de ${n1(t)} mm (el que venden como «de 6»): ${mdf?.pieces ?? 0} piezas (piso, cubierta en dos capas y piezas interiores) en ${mdf?.sheets ?? 0} hoja${mdf?.sheets === 1 ? '' : 's'} de 90 × 60 cm, unos ${Math.round(mdf?.cutM ?? 0)} m de corte. ${sheetFiles(mdf, LASER_PREFIX.mdf)}.`,
    `2) Acrílico transparente de ${n1(st.asm.base.acrT)} mm: ${acr?.pieces ?? 0} piezas en ${acr?.sheets ?? 0} hoja${acr?.sheets === 1 ? '' : 's'} de 90 × 60 cm, unos ${Math.round(acr?.cutM ?? 0)} m de corte: las cuatro paredes de la caja (con dientes, van a la vista), dos tapas de Ø170 y bridas de Ø130, Ø64 y Ø44. ${sheetFiles(acr, LASER_PREFIX['acrilico-3'])}.`,
    `3) Acrílico negro de 3 mm: ${blk?.pieces ?? 0} piezas chicas (una placa de 60 × 70 mm con ventana y dos tiras de 60 × 3 mm) en un retazo de 20 × 30 cm. Archivo ${LASER_PREFIX['acrilico-negro-3']}-hoja-1.`,
    '',
    'Detalles:',
    '- Archivos a escala real en milímetros: DXF R12 (abre en AutoCAD 2010/2013, CorelDRAW y LightBurn), y los mismos en SVG y PDF. Rojo = corte, azul = marcado vectorial ligero, negro = rótulo grabado (opcional).',
    `- Las piezas encajan a presión por dientes y ranuras, sin tornillos. Los archivos ya traen compensado un kerf de ${n2(SHEET_MATERIALS.mdf.kerfMm)} mm en MDF y ${n2(SHEET_MATERIALS['acrilico-3'].kerfMm)} mm en acrílico: si el de su máquina es distinto, avísenme y se los mando ajustados.`,
    `- Antes de cortar todo, por favor midan con vernier el espesor real del MDF y del acrílico, y corten primero las piezas de prueba E10 y E11 (MDF) y A10 y A11 (acrílico). Si la ranura que entra justa no es la del centro (${n1(t)} mm de MDF y ${n1(st.asm.base.acrT)} mm de acrílico), les mando los archivos con el espesor que midan; se regeneran en un minuto.`,
    '- El acrílico con su película protectora por las dos caras: las paredes van a la vista y no deben rayarse. No hace falta pulir cantos.',
    '- Por favor cotícenme por separado material y minutos de corte, y el tiempo de entrega.',
    '',
    'Gracias.',
  ];
  return lines.join('\n');
}

/** mensaje para cotizar la impresión 3D */
export function printRequestText(parts: PrintedPart[], pe: PrintQuantities): string {
  const lines = [
    `Hola, buen día. Quiero cotizar la impresión 3D en PETG de ${parts.length} piezas distintas (${pe.pieces} en total), para recoger en CDMX.`,
    '',
    ...parts.map((p) => `- ${p.file} × ${p.qty}`),
    '',
    'Detalles:',
    '- STL en milímetros, ya orientados para imprimir (z hacia arriba) y revisados: son sólidos cerrados y no necesitan soportes.',
    '- Material: PETG, no PLA: varias piezas llevan broches que se flexionan y otras van pegadas a ejes de acero. Color gris oscuro o negro; los núcleos y los rodillos pueden ir en blanco o natural.',
    '- Ajustes: boquilla de 0,4 mm, capa de 0,2 mm, 3 perímetros y 20 % de relleno (4 perímetros en los postes con broche).',
    '- Tolerancias que importan: los asientos de rodamiento miden Ø22,05 mm para un 608ZZ a presión y los barrenos de eje Ø7,9 (a presión) u Ø8,2 mm (holgado). Si su máquina saca los barrenos más chicos, díganme cuánto y los ajusto.',
    `- Peso estimado: unos ${Math.round(pe.grams)} g; unas ${Math.round(pe.hours)} h de máquina a velocidad normal.`,
    '- Por favor cotícenme el total y el tiempo de entrega; si cobran por minuto, el tiempo que les da su laminador.',
    '',
    'Gracias.',
  ];
  return lines.join('\n');
}

/** tabla de piezas de corte (Markdown) */
export function laserTableMd(st: ReelsStructure): string {
  const rows = st.parts.map((p) => {
    const xs = p.profile.outer.map((q) => q.x);
    const ys = p.profile.outer.map((q) => q.y);
    const w = Math.max(...xs) - Math.min(...xs);
    const h = Math.max(...ys) - Math.min(...ys);
    return `| ${p.id} | ${p.name} | ${p.qty} | ${SHEET_MATERIALS[p.material].short} | ${w.toFixed(0)} × ${h.toFixed(0)} | ${p.step || 'prueba'} | ${p.role}${p.glue ? ` · ${p.glue}` : ''} |`;
  });
  return ['| Código | Pieza | Cant. | Material | mm | Paso | Qué hace |', '|---|---|---|---|---|---|---|', ...rows].join('\n');
}

/** tabla de piezas impresas (Markdown) */
export function printTableMd(parts: PrintedPart[]): string {
  const rows = parts.map((p) => `| ${p.id} | \`${p.file}\` | ${p.name} | ${p.qty} | ${Math.round(printedGrams(p) / p.qty)} | ${p.bboxMm.map((x) => x.toFixed(0)).join(' × ')} | ${p.print} |`);
  return ['| Código | Archivo | Pieza | Cant. | g c/u | Caja (mm) | Cómo imprimir |', '|---|---|---|---|---|---|---|', ...rows].join('\n');
}

/** README del paquete para los talleres (también va a docs/FABRICACION-TAMBORES.md) */
export function fabricationReadme(o: { st: ReelsStructure; laser: LaserQuantities[]; parts: PrintedPart[]; pe: PrintQuantities; files: { laser: string[]; stl: string[]; zip: string }; date: string; checks?: string[] }): string {
  const { st, laser, parts, pe } = o;
  const steps = st.steps.map((s) => [`**${s.n}. ${s.title}**`, ...s.text.map((t) => `   - ${t}`), `   - Entran: ${s.parts.join(', ')}`].join('\n')).join('\n\n');
  return [
    '<!-- Generado por scripts/fabricar.mjs (ADR-0012); vuelve a generarlo tras cambiar la mesa: node scripts/fabricar.mjs [--mdf=5.5] -->',
    '',
    '# Mesa de dos tambores · paquete para los talleres',
    '',
    `${o.date} · piso y cubierta de MDF de ${n1(st.mdfMm)} mm, paredes de acrílico transparente de ${n1(st.asm.base.acrT)} mm · ${st.parts.reduce((s, p) => s + p.qty, 0)} piezas de corte láser y ${pe.pieces} impresas en 3D. Armado a mano, sin tornillos: las paredes quedan atrapadas en ranuras del piso y de la cubierta, la tapa trasera lleva dos cuñas, las tapas se abrochan y lo demás se pega donde se indica. El único tornillo es el prisionero del cople de cada motor.`,
    '',
    '## Qué hay aquí',
    '',
    `- \`laser/\`: ${o.files.laser.length} archivos. Cada hoja en DXF R12 y SVG, y un PDF a escala 1:1 por material. Las piezas van acomodadas en hojas de 90 × 60 cm (87 × 57 útiles), con el kerf ya compensado.`,
    `- \`impresion-3d/\`: ${o.files.stl.length} STL, uno por pieza, ya orientados para imprimir.`,
    `- \`${o.files.zip}\`: todo lo anterior y este README, para mandarlo de una vez.`,
    '',
    '## Texto para el taller de corte láser',
    '',
    '```text',
    laserRequestText(st, laser),
    '```',
    '',
    '## Texto para el servicio de impresión 3D',
    '',
    '```text',
    printRequestText(parts, pe),
    '```',
    '',
    '## Piezas de corte láser',
    '',
    'Cada pieza lleva su código grabado en la cara que no se ve con la mesa armada. Las de prueba (E10, E11, A10 y A11) se cortan primero.',
    '',
    laserTableMd(st),
    '',
    '## Piezas impresas',
    '',
    `PETG (${PETG_G_CM3} g/cm³), boquilla de 0,4 mm, capa de 0,2 mm, 3 perímetros y 20 % de relleno.`,
    '',
    printTableMd(parts),
    ...(o.checks?.length ? ['', 'Revisión de los STL (OMEGA `checkPrint`):', '', ...o.checks.map((c) => `- ${c}`)] : []),
    '',
    '## Cómo se arma',
    '',
    'Los mismos pasos que muestra *Mechanical Simulation → Ensamble sin tornillos* (`?demo=tambores&ensamble=1`).',
    '',
    steps,
    '',
    '## Si el MDF o el acrílico no miden lo que dicen',
    '',
    'Mide el espesor con vernier en tres puntos de cada hoja y regenera todo con esos valores: `node scripts/fabricar.mjs --mdf=5.7 --acrilico=2.8`. Dientes, ranuras, alturas y la lista de compras se recalculan.',
    '',
  ].join('\n');
}
