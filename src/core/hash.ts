// Hash estable de valores JSON para la caché incremental de fotogramas: dos entradas iguales (mismo documento de
// animación, mismo instante, misma resolución) producen la misma clave y el fotograma no se vuelve a pintar.
// FNV-1a de 64 bits sobre una serialización canónica (claves ordenadas). Sin dependencias.

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number') return Number.isFinite(value) ? String(Math.round(value * 1e9) / 1e9) : 'null';
    return JSON.stringify(value) ?? 'undefined';
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const o = value as Record<string, unknown>;
  const keys = Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`;
}

export function hashString(s: string): string {
  // dos FNV-1a de 32 bits con semillas distintas → 16 hex; suficiente como clave de caché (no criptográfico)
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193 ^ 0x9747b28c;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= c;
    h2 = Math.imul(h2, 0x01000193) >>> 0;
    h2 = (h2 ^ (h2 >>> 13)) >>> 0;
  }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}

export function hashValue(value: unknown): string {
  return hashString(canonical(value));
}

export { canonical as canonicalJson };
