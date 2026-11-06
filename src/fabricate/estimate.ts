// Cuánto cobrarán los talleres por las piezas de la mesa de dos tambores (ADR-0012), antes de que coticen: minutos de
// corte láser y hojas de material a partir de los contornos reales, y gramos y horas de impresión a partir de las
// piezas. Las tarifas son las publicadas en CDMX el 5-nov-2026 (fuentes abajo); el resultado es un rango bajo–medio–alto
// para saber qué tan lejos queda cada cotización real. Es puro: lo usan la lista de compras y scripts/fabricar.mjs.
import { nest, type NestResult } from '@aminoacid/omega/fabricate';
import { SHEET_MATERIALS, structureSummary, type ReelsStructure, type SheetMaterial } from '../mech/structure';
import { PETG_G_CM3, type PrintedPart } from './printed';

export interface Range {
  low: number;
  mid: number;
  high: number;
}

/** de dónde sale cada tarifa (leídas el 5-nov-2026) */
export const RATE_SOURCES = {
  laserFic: { label: 'FIC Corte Láser (Polanco): $9/min lun–sáb de 8 a 20 h, material aparte, cama de 87 × 57 cm, recolección $60', url: 'https://fic-cortelaser.mx/' },
  laserOthers: { label: 'Otros talleres de CDMX: Estudio Aragón $6–9/min, Impresiones DE desde $8/min, Preciso $10/min', url: 'https://estudioaragon.com/' },
  speeds: { label: 'Velocidades de referencia de un CO2 de 100 W (Forza): MDF 6 mm 10 mm/s, acrílico 3 mm 24 mm/s; ×1,3 por traslados y perforaciones', url: 'https://support.forzalaser.com/wp-content/uploads/2025/02/PARAMETROSREFERENCIALES-FORZA100W.pdf' },
  sheetsFic: { label: 'Hojas de 90 × 60 cm en FIC: MDF 5,5 mm $170, acrílico transparente 3 mm $594; acrílico de color $0,23/cm²', url: 'https://fic-cortelaser.mx/' },
  print3d: { label: 'Impresora 3D México (Anzures): PLA $1,20/min y PETG $1,80/min de máquina', url: 'https://www.impresora3dmexico.com.mx/precios-por-impresion-3D.php' },
  printGram: { label: 'Por gramo: PLA desde $2/g en MercadoLibre; el PETG cuesta 1,5 veces el PLA', url: 'https://www.mercadolibre.com.mx/' },
} as const;

/** tarifa por minuto de corte láser en CDMX (MXN) */
export const LASER_MXN_MIN: Range = { low: 7, mid: 9, high: 10 };
/** minutos por metro de corte (sin traslados) y factor de traslados y perforaciones */
export const LASER_MIN_PER_M: Record<SheetMaterial, number> = { mdf: 1.67, 'acrilico-3': 0.69, 'acrilico-negro-3': 0.69 };
export const LASER_TRAVEL = 1.3;
/** hoja que vende el taller y su precio (MXN); la cama útil es la de FIC */
export const SHEET_STOCK: Record<SheetMaterial, { label: string; widthMm: number; heightMm: number; mxn: number; perCm2?: number }> = {
  mdf: { label: 'MDF de 5,5 mm de 90 × 60 cm', widthMm: 870, heightMm: 570, mxn: 170 },
  'acrilico-3': { label: 'acrílico transparente de 3 mm de 90 × 60 cm', widthMm: 870, heightMm: 570, mxn: 594, perCm2: 594 / 5400 },
  'acrilico-negro-3': { label: 'acrílico negro de 3 mm (retazo, por cm²)', widthMm: 300, heightMm: 200, mxn: 0, perCm2: 0.23 },
};
/** impresión: por minuto de máquina en PETG, por gramo, y la velocidad con que se estiman los minutos */
export const PRINT_MXN_MIN: Range = { low: 1.2, mid: 1.5, high: 1.8 };
export const PRINT_MXN_G: Range = { low: 2.5, mid: 3, high: 4 };
/** mm³/s sostenidos de una impresora de servicio (entre una Ender-3 y una Bambu A1) y el 30 % de traslados */
export const PRINT_MM3_S = 8;

export interface LaserEstimate {
  material: SheetMaterial;
  label: string;
  pieces: number;
  cutM: number;
  minutes: number;
  sheets: number;
  sheetMxn: number;
  materialMxn: number;
  mxn: Range;
  nest: NestResult;
}

/** minutos, hojas y costo de cortar cada material de la estructura */
export function estimateLaser(s: ReelsStructure): LaserEstimate[] {
  return structureSummary(s).map((m) => {
    const stock = SHEET_STOCK[m.material];
    const parts = s.parts.filter((p) => p.material === m.material).map((p) => ({ id: p.id, shape: p.profile, qty: p.qty, label: p.id }));
    const nr = nest(parts, { sheet: { widthMm: stock.widthMm, heightMm: stock.heightMm }, marginMm: 5, spacingMm: 4, kerfMm: SHEET_MATERIALS[m.material].kerfMm });
    const sheets = nr.sheets.length;
    const minutes = (m.cutM * LASER_MIN_PER_M[m.material] + m.scoreM * 0.3) * LASER_TRAVEL;
    // acrílico: o la hoja completa, o lo que ocupan las piezas cobrado por cm² con 30 % de desperdicio
    const byArea = stock.perCm2 ? ((m.bboxAreaMm2 / 100) * stock.perCm2 * 1.3) : Infinity;
    const materialMxn = Math.min(sheets * stock.mxn || Infinity, byArea);
    const cut = (r: number) => Math.max(r, minutes * r);
    const mxn = { low: cut(LASER_MXN_MIN.low) + Math.min(materialMxn, byArea), mid: cut(LASER_MXN_MIN.mid) + materialMxn, high: cut(LASER_MXN_MIN.high) + (sheets * stock.mxn || materialMxn) + 60 };
    return { material: m.material, label: SHEET_MATERIALS[m.material].label, pieces: m.pieces, cutM: m.cutM, minutes, sheets, sheetMxn: stock.mxn, materialMxn, mxn, nest: nr };
  });
}

export interface PrintEstimate {
  pieces: number;
  grams: number;
  hours: number;
  mxn: Range;
  /** las piezas que más pesan, para negociar o cambiar de proceso */
  heaviest: { id: string; name: string; grams: number }[];
}

/** gramos, horas de máquina y costo de imprimir todas las piezas */
export function estimatePrint(parts: PrintedPart[]): PrintEstimate {
  const per = parts.map((p) => {
    const cm3 = p.qty * p.solidCm3 * p.fill;
    return { id: p.id, name: p.name, grams: cm3 * PETG_G_CM3, seconds: ((cm3 * 1000) / PRINT_MM3_S) * 1.3 + p.qty * (p.bboxMm[2] / 0.2) * 2 };
  });
  const grams = per.reduce((s, q) => s + q.grams, 0);
  const hours = per.reduce((s, q) => s + q.seconds, 0) / 3600;
  const byGram = (r: number) => grams * r;
  const byMin = (r: number) => hours * 60 * r;
  const mxn = { low: Math.min(byGram(PRINT_MXN_G.low), byMin(PRINT_MXN_MIN.low)), mid: (byGram(PRINT_MXN_G.mid) + byMin(PRINT_MXN_MIN.mid)) / 2, high: Math.max(byGram(PRINT_MXN_G.high), byMin(PRINT_MXN_MIN.high)) };
  return { pieces: parts.reduce((s, p) => s + p.qty, 0), grams, hours, mxn, heaviest: [...per].sort((a, b) => b.grams - a.grams).slice(0, 3).map(({ id, name, grams: g }) => ({ id, name, grams: g })) };
}

export const fmtMxn = (n: number): string => `$${Math.round(n).toLocaleString('es-MX')}`;
export const fmtRange = (r: Range): string => `${fmtMxn(r.low)}–${fmtMxn(r.high)}`;
