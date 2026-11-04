// Perfil ICC sRGB (IEC 61966-2.1) construido en código: versión 2.1, clase monitor, primarios adaptados a D50 con
// Bradford y curva de transferencia sRGB tabulada (1024 puntos). Sirve para etiquetar las imágenes del PDF como sRGB
// (ICCBased): sin perfil, cada visor e impresora interpreta DeviceRGB a su manera y los colores saturados se corren.
// Sin dependencias ni archivos de terceros.

const enc = new TextEncoder();

function s15(v: number): number {
  return Math.round(v * 65536) | 0;
}

/** perfil sRGB v2 (≈ 2,6 KB) */
export function srgbIccProfile(): Uint8Array {
  const tags: { sig: string; data: Uint8Array }[] = [];
  const xyz = (x: number, y: number, z: number) => {
    const b = new Uint8Array(20);
    const dv = new DataView(b.buffer);
    b.set(enc.encode('XYZ '), 0);
    dv.setInt32(8, s15(x));
    dv.setInt32(12, s15(y));
    dv.setInt32(16, s15(z));
    return b;
  };
  const desc = (text: string) => {
    // textDescriptionType: ASCII + Unicode (vacío) + ScriptCode (67 bytes)
    const ascii = enc.encode(text + '\0');
    const b = new Uint8Array(12 + ascii.length + 8 + 3 + 67);
    const dv = new DataView(b.buffer);
    b.set(enc.encode('desc'), 0);
    dv.setUint32(8, ascii.length);
    b.set(ascii, 12);
    return b;
  };
  const text = (t: string) => {
    const ascii = enc.encode(t + '\0');
    const b = new Uint8Array(8 + ascii.length);
    b.set(enc.encode('text'), 0);
    b.set(ascii, 8);
    return b;
  };
  const curve = () => {
    const n = 1024;
    const b = new Uint8Array(12 + n * 2);
    const dv = new DataView(b.buffer);
    b.set(enc.encode('curv'), 0);
    dv.setUint32(8, n);
    for (let i = 0; i < n; i++) {
      const v = i / (n - 1);
      const lin = v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      dv.setUint16(12 + i * 2, Math.round(lin * 65535));
    }
    return b;
  };
  tags.push({ sig: 'desc', data: desc('sRGB IEC61966-2.1') });
  tags.push({ sig: 'cprt', data: text('No copyright, use freely') });
  tags.push({ sig: 'wtpt', data: xyz(0.9642, 1.0, 0.82491) });
  tags.push({ sig: 'rXYZ', data: xyz(0.4360747, 0.2225045, 0.0139322) });
  tags.push({ sig: 'gXYZ', data: xyz(0.3850649, 0.7168786, 0.0971045) });
  tags.push({ sig: 'bXYZ', data: xyz(0.1430804, 0.0606169, 0.7141733) });
  const trc = curve();

  const headerSize = 128;
  const tableSize = 4 + 12 * (tags.length + 3);
  let offset = headerSize + tableSize;
  const placed: { sig: string; offset: number; size: number; data?: Uint8Array }[] = [];
  const align = (n: number) => (n + 3) & ~3;
  for (const t of tags) {
    placed.push({ sig: t.sig, offset, size: t.data.length, data: t.data });
    offset = align(offset + t.data.length);
  }
  const trcOffset = offset;
  for (const sig of ['rTRC', 'gTRC', 'bTRC']) placed.push({ sig, offset: trcOffset, size: trc.length });
  offset = align(offset + trc.length);
  const total = offset;

  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, total);
  out.set(enc.encode('lcms'), 4);
  dv.setUint32(8, 0x02100000);
  out.set(enc.encode('mntr'), 12);
  out.set(enc.encode('RGB '), 16);
  out.set(enc.encode('XYZ '), 20);
  // fecha: 2026-11-03 00:00:00
  [2026, 11, 3, 0, 0, 0].forEach((v, i) => dv.setUint16(24 + i * 2, v));
  out.set(enc.encode('acsp'), 36);
  out.set(enc.encode('APPL'), 40);
  dv.setUint32(64, 0); // intención perceptual
  dv.setInt32(68, s15(0.9642));
  dv.setInt32(72, s15(1.0));
  dv.setInt32(76, s15(0.82491));
  out.set(enc.encode('lcms'), 80);
  dv.setUint32(headerSize, placed.length);
  placed.forEach((p, i) => {
    const at = headerSize + 4 + i * 12;
    out.set(enc.encode(p.sig), at);
    dv.setUint32(at + 4, p.offset);
    dv.setUint32(at + 8, p.size);
    if (p.data) out.set(p.data, p.offset);
  });
  out.set(trc, trcOffset);
  return out;
}
