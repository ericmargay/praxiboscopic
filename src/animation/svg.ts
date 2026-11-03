// Exportación vectorial de una DisplayList a SVG (solo cuando el contenido lo permite: ver isVectorOnly).
// Dimensiones en px lógicos con viewBox; `widthMm/heightMm` opcionales fijan el tamaño físico real.
import type { DisplayList, DrawNode } from './evaluate';
import type { Vec2 } from './model';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const f = (n: number) => (Math.abs(n) < 1e-9 ? '0' : String(Math.round(n * 1000) / 1000));

export interface SvgOptions {
  widthMm?: number;
  heightMm?: number;
  /** incluir el color de fondo como rectángulo */
  background?: boolean;
}

export function displayListToSvg(list: DisplayList, options: SvgOptions = {}): string {
  const parts: string[] = [];
  const sizeAttr = options.widthMm && options.heightMm ? `width="${f(options.widthMm)}mm" height="${f(options.heightMm)}mm"` : `width="${list.width}" height="${list.height}"`;
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" ${sizeAttr} viewBox="0 0 ${list.width} ${list.height}">`);
  if ((options.background ?? true) && !list.background.transparent) parts.push(`<rect width="${list.width}" height="${list.height}" fill="${esc(list.background.color)}"/>`);
  parts.push(`<clipPath id="lienzo"><rect width="${list.width}" height="${list.height}"/></clipPath><g clip-path="url(#lienzo)">`);
  for (const node of list.nodes) {
    const el = nodeToSvg(node);
    if (el) parts.push(el);
  }
  parts.push('</g></svg>');
  return parts.join('\n');
}

function styleAttrs(node: DrawNode, fillAllowed = true): string {
  const s = node.style;
  const a: string[] = [];
  a.push(`fill="${fillAllowed && s.fill ? esc(s.fill) : 'none'}"`);
  if (s.stroke && s.strokeWidth > 0) {
    a.push(`stroke="${esc(s.stroke)}" stroke-width="${f(s.strokeWidth)}" stroke-linecap="${s.lineCap}" stroke-linejoin="${s.lineJoin}"`);
    if (s.dash.length) a.push(`stroke-dasharray="${s.dash.map(f).join(' ')}"`);
  } else if (!fillAllowed && s.fill) {
    // polilínea abierta sin stroke: el renderizador usa el fill como trazo
    a.push(`stroke="${esc(s.fill)}" stroke-width="${f(s.strokeWidth || 2)}" stroke-linecap="${s.lineCap}" stroke-linejoin="${s.lineJoin}"`);
  }
  if (node.opacity < 1) a.push(`opacity="${f(node.opacity)}"`);
  if (s.blend !== 'source-over') a.push(`style="mix-blend-mode:${blendToCss(s.blend)}"`);
  return a.join(' ');
}

function blendToCss(b: GlobalCompositeOperation): string {
  return ['multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity'].includes(b) ? b : 'normal';
}

function nodeToSvg(node: DrawNode): string | null {
  const m = node.matrix;
  const tr = `transform="matrix(${m.map(f).join(' ')})"`;
  const g = node.geometry;
  switch (g.kind) {
    case 'ellipse':
      return `<ellipse cx="${f(g.cx)}" cy="${f(g.cy)}" rx="${f(g.rx)}" ry="${f(g.ry)}" ${styleAttrs(node)} ${tr}/>`;
    case 'rect':
      return `<rect x="${f(g.x)}" y="${f(g.y)}" width="${f(g.w)}" height="${f(g.h)}"${g.radius > 0 ? ` rx="${f(g.radius)}"` : ''} ${styleAttrs(node)} ${tr}/>`;
    case 'polyline': {
      const d = pathFromPolyline(g.points, g.closed);
      return `<path d="${d}" ${styleAttrs(node, g.closed)} ${tr}/>`;
    }
    case 'bezier': {
      const d = pathFromBezier(g.points, g.closed);
      return `<path d="${d}" ${styleAttrs(node, g.closed)} ${tr}/>`;
    }
    case 'text':
      return `<text x="${f(g.x)}" y="${f(g.y)}" font-size="${f(g.fontSize)}" font-family="${esc(g.font)}" text-anchor="${g.align === 'center' ? 'middle' : g.align === 'right' || g.align === 'end' ? 'end' : 'start'}" dominant-baseline="${g.baseline === 'middle' ? 'central' : g.baseline === 'top' || g.baseline === 'hanging' ? 'hanging' : 'alphabetic'}" ${styleAttrs(node)} ${tr}>${esc(g.text)}</text>`;
    case 'image':
      return `<image href="${esc(g.src)}" x="${f(g.x)}" y="${f(g.y)}" width="${f(g.w)}" height="${f(g.h)}"${node.opacity < 1 ? ` opacity="${f(node.opacity)}"` : ''} ${tr}/>`;
    case 'model3d':
      return null;
  }
}

export function pathFromPolyline(points: Vec2[], closed: boolean): string {
  if (!points.length) return '';
  let d = `M${f(points[0].x)} ${f(points[0].y)}`;
  for (let i = 1; i < points.length; i++) d += ` L${f(points[i].x)} ${f(points[i].y)}`;
  return closed ? `${d} Z` : d;
}

export function pathFromBezier(points: Vec2[], closed: boolean): string {
  if (points.length < 4) return pathFromPolyline(points, closed);
  let d = `M${f(points[0].x)} ${f(points[0].y)}`;
  let i = 1;
  for (; i + 2 < points.length; i += 3) d += ` C${f(points[i].x)} ${f(points[i].y)} ${f(points[i + 1].x)} ${f(points[i + 1].y)} ${f(points[i + 2].x)} ${f(points[i + 2].y)}`;
  if (closed) {
    if (i + 1 < points.length) d += ` C${f(points[i].x)} ${f(points[i].y)} ${f(points[i + 1].x)} ${f(points[i + 1].y)} ${f(points[0].x)} ${f(points[0].y)}`;
    d += ' Z';
  }
  return d;
}
