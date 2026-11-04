// Escritor PDF mínimo con dimensiones físicas reales: páginas en mm (1 pt = 1/72 in = 0.3528 mm), imágenes JPEG
// (DCTDecode) o RGB sin comprimir/Flate, y trazos vectoriales (líneas, rectángulos, texto) para marcas de corte,
// perforaciones y rótulos. Sin dependencias: lo necesario para una plantilla imprimible fiel al tamaño.

const MM_TO_PT = 72 / 25.4;

export interface PdfImage {
  /** datos JPEG (DCTDecode) o RGB crudo (3 bytes por píxel, filtrado con Flate si se pasa `deflated`) */
  data: Uint8Array;
  width: number;
  height: number;
  format: 'jpeg' | 'rgb' | 'rgb-flate';
  /** máscara alfa (gris, 1 byte por píxel) opcional, sin comprimir o Flate según `smaskFlate` */
  smask?: Uint8Array;
  smaskFlate?: boolean;
}

export interface PdfRect {
  xMm: number;
  yMm: number;
  wMm: number;
  hMm: number;
}

export type PdfOp =
  | { op: 'image'; image: number; rect: PdfRect; mirror?: boolean }
  | { op: 'rect'; rect: PdfRect; stroke?: [number, number, number]; fill?: [number, number, number]; lineMm?: number }
  | { op: 'line'; x1: number; y1: number; x2: number; y2: number; stroke?: [number, number, number]; lineMm?: number; dash?: number[] }
  | { op: 'text'; xMm: number; yMm: number; text: string; sizePt: number; color?: [number, number, number] }
  | { op: 'circle'; cx: number; cy: number; r: number; stroke?: [number, number, number]; fill?: [number, number, number]; lineMm?: number };

export interface PdfPage {
  widthMm: number;
  heightMm: number;
  ops: PdfOp[];
}

export interface PdfDoc {
  title: string;
  pages: PdfPage[];
  images: PdfImage[];
  /** perfil ICC RGB: si está, las imágenes se declaran ICCBased (p. ej. sRGB) en vez de DeviceRGB */
  iccProfile?: Uint8Array;
}

const f = (n: number) => (Math.round(n * 1000) / 1000).toString();
const col = (c: [number, number, number]) => `${f(c[0])} ${f(c[1])} ${f(c[2])}`;
/** caracteres fuera de Latin-1 que sí tiene WinAnsi (la codificación de la fuente Helvetica del PDF) */
const WIN_ANSI: Record<string, number> = { '€': 0x80, '‚': 0x82, '„': 0x84, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '™': 0x99 };
/** sustitutos legibles para lo que WinAnsi no tiene */
const FALLBACK: Record<string, string> = { '→': '->', '←': '<-', '≈': '~', '≤': '<=', '≥': '>=', '−': '-', '✓': 'ok', 'φ': 'phi', 'σ': 'sigma' };
/** cadena PDF en WinAnsi: acentos, eñes, «·», «×», «µ» y rayas se escriben como octales; lo demás, sustituto o «?» */
const pdfStr = (s: string) => {
  let out = '';
  for (const ch of s) {
    const fb = FALLBACK[ch];
    const c = fb !== undefined && fb !== ch ? fb : ch;
    for (const cc of c) {
      const code = cc.codePointAt(0)!;
      if (cc === '\\' || cc === '(' || cc === ')') out += `\\${cc}`;
      else if (code >= 0x20 && code <= 0x7e) out += cc;
      else if (WIN_ANSI[cc] !== undefined) out += `\\${WIN_ANSI[cc].toString(8).padStart(3, '0')}`;
      else if (code >= 0xa0 && code <= 0xff) out += `\\${code.toString(8).padStart(3, '0')}`;
      else out += '?';
    }
  }
  return `(${out})`;
};

/** y de PDF crece hacia arriba: convertimos desde mm con origen arriba a la izquierda */
function content(page: PdfPage): string {
  const H = page.heightMm;
  const X = (mm: number) => f(mm * MM_TO_PT);
  const Y = (mm: number) => f((H - mm) * MM_TO_PT);
  const lines: string[] = [];
  for (const o of page.ops) {
    switch (o.op) {
      case 'image': {
        const w = o.rect.wMm * MM_TO_PT;
        const h = o.rect.hMm * MM_TO_PT;
        const x = o.rect.xMm * MM_TO_PT;
        const y = (H - o.rect.yMm - o.rect.hMm) * MM_TO_PT;
        // matriz: escala w×h, y espejo horizontal opcional
        const cm = o.mirror ? `${f(-w)} 0 0 ${f(h)} ${f(x + w)} ${f(y)} cm` : `${f(w)} 0 0 ${f(h)} ${f(x)} ${f(y)} cm`;
        lines.push(`q ${cm} /Im${o.image} Do Q`);
        break;
      }
      case 'rect': {
        const parts = ['q'];
        if (o.stroke) parts.push(`${col(o.stroke)} RG`);
        if (o.fill) parts.push(`${col(o.fill)} rg`);
        parts.push(`${f((o.lineMm ?? 0.1) * MM_TO_PT)} w`);
        parts.push(`${X(o.rect.xMm)} ${f((H - o.rect.yMm - o.rect.hMm) * MM_TO_PT)} ${f(o.rect.wMm * MM_TO_PT)} ${f(o.rect.hMm * MM_TO_PT)} re`);
        parts.push(o.fill && o.stroke ? 'B' : o.fill ? 'f' : 'S', 'Q');
        lines.push(parts.join(' '));
        break;
      }
      case 'line': {
        const dash = o.dash?.length ? `[${o.dash.map((d) => f(d * MM_TO_PT)).join(' ')}] 0 d` : '[] 0 d';
        lines.push(`q ${col(o.stroke ?? [0, 0, 0])} RG ${f((o.lineMm ?? 0.1) * MM_TO_PT)} w ${dash} ${X(o.x1)} ${Y(o.y1)} m ${X(o.x2)} ${Y(o.y2)} l S Q`);
        break;
      }
      case 'circle': {
        // cuatro Béziers
        const k = 0.5523;
        const cx = o.cx * MM_TO_PT;
        const cy = (H - o.cy) * MM_TO_PT;
        const r = o.r * MM_TO_PT;
        const parts = ['q'];
        if (o.stroke) parts.push(`${col(o.stroke)} RG`);
        if (o.fill) parts.push(`${col(o.fill)} rg`);
        parts.push(`${f((o.lineMm ?? 0.1) * MM_TO_PT)} w`);
        parts.push(`${f(cx + r)} ${f(cy)} m`);
        parts.push(`${f(cx + r)} ${f(cy + r * k)} ${f(cx + r * k)} ${f(cy + r)} ${f(cx)} ${f(cy + r)} c`);
        parts.push(`${f(cx - r * k)} ${f(cy + r)} ${f(cx - r)} ${f(cy + r * k)} ${f(cx - r)} ${f(cy)} c`);
        parts.push(`${f(cx - r)} ${f(cy - r * k)} ${f(cx - r * k)} ${f(cy - r)} ${f(cx)} ${f(cy - r)} c`);
        parts.push(`${f(cx + r * k)} ${f(cy - r)} ${f(cx + r)} ${f(cy - r * k)} ${f(cx + r)} ${f(cy)} c`);
        parts.push(o.fill && o.stroke ? 'B' : o.fill ? 'f' : 'S', 'Q');
        lines.push(parts.join(' '));
        break;
      }
      case 'text':
        lines.push(`BT ${col(o.color ?? [0, 0, 0])} rg /F1 ${f(o.sizePt)} Tf ${X(o.xMm)} ${Y(o.yMm)} Td ${pdfStr(o.text)} Tj ET`);
        break;
    }
  }
  return lines.join('\n');
}

export function buildPdf(doc: PdfDoc): Uint8Array {
  const enc = new TextEncoder();
  const objects: Uint8Array[] = [];
  const add = (parts: (string | Uint8Array)[]): number => {
    const chunks = parts.map((p) => (typeof p === 'string' ? enc.encode(p) : p));
    const total = chunks.reduce((a, c) => a + c.length, 0);
    const out = new Uint8Array(total);
    let p = 0;
    for (const c of chunks) {
      out.set(c, p);
      p += c.length;
    }
    objects.push(out);
    return objects.length; // número de objeto (1-based)
  };
  // 1: catálogo, 2: páginas, 3: fuente
  objects.push(new Uint8Array(0), new Uint8Array(0), new Uint8Array(0));
  const imageIds: number[] = [];
  const iccId = doc.iccProfile ? add([`<< /N 3 /Alternate /DeviceRGB /Length ${doc.iccProfile.length} >>\nstream\n`, doc.iccProfile, '\nendstream']) : 0;
  const rgbSpace = iccId ? `[/ICCBased ${iccId} 0 R]` : '/DeviceRGB';
  for (const img of doc.images) {
    let smaskId: number | undefined;
    if (img.smask) {
      smaskId = add([`<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace /DeviceGray /BitsPerComponent 8 ${img.smaskFlate ? '/Filter /FlateDecode ' : ''}/Length ${img.smask.length} >>\nstream\n`, img.smask, '\nendstream']);
    }
    const filter = img.format === 'jpeg' ? '/Filter /DCTDecode ' : img.format === 'rgb-flate' ? '/Filter /FlateDecode ' : '';
    imageIds.push(add([`<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace ${rgbSpace} /BitsPerComponent 8 ${filter}${smaskId ? `/SMask ${smaskId} 0 R ` : ''}/Length ${img.data.length} >>\nstream\n`, img.data, '\nendstream']));
  }
  const pageIds: number[] = [];
  for (const page of doc.pages) {
    const stream = enc.encode(content(page));
    const contentId = add([`<< /Length ${stream.length} >>\nstream\n`, stream, '\nendstream']);
    const xobjects = imageIds.map((id, i) => `/Im${i} ${id} 0 R`).join(' ');
    pageIds.push(add([`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f(page.widthMm * MM_TO_PT)} ${f(page.heightMm * MM_TO_PT)}] /Contents ${contentId} 0 R /Resources << /Font << /F1 3 0 R >> /XObject << ${xobjects} >> >> >>`]));
  }
  objects[0] = enc.encode('<< /Type /Catalog /Pages 2 0 R >>');
  objects[1] = enc.encode(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`);
  objects[2] = enc.encode('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const infoId = add([`<< /Title ${pdfStr(doc.title)} /Producer (Praxiboscopic) /Creator (Praxiboscopic) >>`]);

  const parts: Uint8Array[] = [enc.encode('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n')];
  const offsets: number[] = [];
  let pos = parts[0].length;
  objects.forEach((obj, i) => {
    offsets.push(pos);
    const head = enc.encode(`${i + 1} 0 obj\n`);
    const tail = enc.encode('\nendobj\n');
    parts.push(head, obj, tail);
    pos += head.length + obj.length + tail.length;
  });
  const xref = [`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`];
  for (const o of offsets) xref.push(`${String(o).padStart(10, '0')} 00000 n \n`);
  xref.push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${infoId} 0 R >>\nstartxref\n${pos}\n%%EOF\n`);
  parts.push(enc.encode(xref.join('')));
  const total = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const part of parts) {
    out.set(part, p);
    p += part.length;
  }
  return out;
}

/** MediaBox de la primera página (mm), para pruebas de que las dimensiones físicas se respetan */
export function pdfPageSizesMm(pdf: Uint8Array): { widthMm: number; heightMm: number }[] {
  const text = new TextDecoder('latin1').decode(pdf);
  const out = [];
  const re = /\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push({ widthMm: parseFloat(m[1]) / MM_TO_PT, heightMm: parseFloat(m[2]) / MM_TO_PT });
  return out;
}

export { MM_TO_PT };
