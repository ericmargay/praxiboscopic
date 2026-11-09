// Cuánto trabajo de taller lleva la mesa de dos tambores (ADR-0012): metros de corte, hojas de material y piezas por
// material a partir de los contornos reales, y gramos y horas de impresión a partir de las piezas. Solo cantidades: lo
// que también dicen los textos que se mandan a los talleres. Los precios estimados no van en el sitio ni en el
// repositorio; se calculan aparte, en privado. Es puro: lo usan la lista de compras, la página de compras y
// scripts/fabricar.mjs.
import { nest, type NestResult } from '@aminoacid/omega/fabricate';
import { SHEET_MATERIALS, structureSummary, type ReelsStructure, type SheetMaterial } from '../mech/structure';
import { PETG_G_CM3, type PrintedPart } from './printed';

/** cama del láser donde se acomodan las piezas (mm): hojas de 90 × 60 cm con margen; el acrílico negro va en un retazo */
export const SHEET_BED: Record<SheetMaterial, { label: string; widthMm: number; heightMm: number }> = {
  mdf: { label: 'MDF de 5,5 mm de 90 × 60 cm', widthMm: 870, heightMm: 570 },
  'acrilico-3': { label: 'acrílico transparente de 3 mm de 90 × 60 cm', widthMm: 870, heightMm: 570 },
  'acrilico-negro-3': { label: 'retazo de acrílico negro de 3 mm de 30 × 20 cm', widthMm: 300, heightMm: 200 },
};
/** mm³/s sostenidos de una impresora de servicio (entre una Ender-3 y una Bambu A1), con 30 % de traslados */
export const PRINT_MM3_S = 8;

export interface LaserQuantities {
  material: SheetMaterial;
  label: string;
  pieces: number;
  /** metros de corte (contornos y huecos) y de marcado vectorial */
  cutM: number;
  scoreM: number;
  pierces: number;
  /** área de las cajas de las piezas, mm² */
  bboxAreaMm2: number;
  sheets: number;
  nest: NestResult;
}

/** piezas, metros de corte y hojas de cada material de la estructura */
export function laserQuantities(s: ReelsStructure): LaserQuantities[] {
  return structureSummary(s).map((m) => {
    const bed = SHEET_BED[m.material];
    const parts = s.parts.filter((p) => p.material === m.material).map((p) => ({ id: p.id, shape: p.profile, qty: p.qty, label: p.id }));
    const nr = nest(parts, { sheet: { widthMm: bed.widthMm, heightMm: bed.heightMm }, marginMm: 5, spacingMm: 4, kerfMm: SHEET_MATERIALS[m.material].kerfMm });
    return { material: m.material, label: SHEET_MATERIALS[m.material].label, pieces: m.pieces, cutM: m.cutM, scoreM: m.scoreM, pierces: m.pierces, bboxAreaMm2: m.bboxAreaMm2, sheets: nr.sheets.length, nest: nr };
  });
}

export interface PrintQuantities {
  pieces: number;
  grams: number;
  hours: number;
  /** gramos y segundos de máquina por pieza distinta (todas sus copias) */
  per: { id: string; name: string; grams: number; seconds: number }[];
}

/** gramos de PETG y horas de máquina de todas las piezas impresas */
export function printQuantities(parts: PrintedPart[]): PrintQuantities {
  const per = parts.map((p) => {
    const cm3 = p.qty * p.solidCm3 * p.fill;
    return { id: p.id, name: p.name, grams: cm3 * PETG_G_CM3, seconds: ((cm3 * 1000) / PRINT_MM3_S) * 1.3 + p.qty * (p.bboxMm[2] / 0.2) * 2 };
  });
  return { pieces: parts.reduce((s, p) => s + p.qty, 0), grams: per.reduce((s, q) => s + q.grams, 0), hours: per.reduce((s, q) => s + q.seconds, 0) / 3600, per };
}
