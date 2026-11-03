// Utilidades numéricas compartidas.

export const TAU = Math.PI * 2;

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const degToRad = (d: number): number => (d * Math.PI) / 180;
export const radToDeg = (r: number): number => (r * 180) / Math.PI;

/** módulo siempre positivo */
export const mod = (a: number, n: number): number => ((a % n) + n) % n;

/** redondeo a `decimals` decimales */
export const round = (v: number, decimals = 3): number => {
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
};

/** rpm ↔ rad/s */
export const rpmToRadS = (rpm: number): number => (rpm * TAU) / 60;
export const radSToRpm = (w: number): number => (w * 60) / TAU;

/** mayor común divisor (enteros) */
export function gcd(a: number, b: number): number {
  a = Math.abs(Math.round(a));
  b = Math.abs(Math.round(b));
  while (b) [a, b] = [b, a % b];
  return a;
}

/** interpolación suave de Hermite (smoothstep) */
export const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = clamp((x - e0) / (e1 - e0 || 1e-12), 0, 1);
  return t * t * (3 - 2 * t);
};

/** convierte un color CSS #rrggbb[aa] a [r,g,b,a] en 0..1 */
export function parseHexColor(hex: string): [number, number, number, number] {
  let h = hex.trim().replace('#', '');
  if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.padEnd(8, 'f').slice(0, 8), 16);
  return [((n >>> 24) & 255) / 255, ((n >>> 16) & 255) / 255, ((n >>> 8) & 255) / 255, (n & 255) / 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => clamp(Math.round(v * 255), 0, 255).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** luminancia relativa de un color sRGB (0..1) */
export function luminance(r: number, g: number, b: number): number {
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
