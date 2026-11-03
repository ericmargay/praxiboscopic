// Pinta una DisplayList en cualquier contexto 2D compatible con CanvasRenderingContext2D (navegador, OffscreenCanvas
// o @napi-rs/canvas en Node para las pruebas). Las imágenes y los modelos 3D llegan a través de un `ResourceProvider`
// que el host rellena (en Node no hay imágenes: se dibuja un marcador).
import type { DisplayList, DrawNode, Geometry } from './evaluate';
import type { Vec2 } from './model';

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface ResourceProvider {
  /** imagen decodificada para `src` (data URL o URL) o null si aún no está */
  getImage(src: string): CanvasImageSource | null;
  /** render del elemento 3D en el instante dado, como imagen compuesta, o null */
  render3d?(geometry: Extract<Geometry, { kind: 'model3d' }>, widthPx: number, heightPx: number): CanvasImageSource | null;
}

export const NO_RESOURCES: ResourceProvider = { getImage: () => null };

export interface RenderOptions {
  /** escala lienzo lógico → píxeles de salida */
  scale?: number;
  offsetX?: number;
  offsetY?: number;
  /** pinta el color de fondo aunque el documento sea transparente (para previsualizar) */
  forceBackground?: string | null;
  resources?: ResourceProvider;
  /** opacidad global (onion skin) */
  globalAlpha?: number;
  /** sustituye todos los colores por este (onion skin tintado) */
  tint?: string | null;
}

export function renderDisplayList(ctx: Ctx2D, list: DisplayList, options: RenderOptions = {}): void {
  const scale = options.scale ?? 1;
  const ox = options.offsetX ?? 0;
  const oy = options.offsetY ?? 0;
  const resources = options.resources ?? NO_RESOURCES;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (options.forceBackground) {
    ctx.fillStyle = options.forceBackground;
    ctx.fillRect(ox, oy, list.width * scale, list.height * scale);
  } else if (!list.background.transparent) {
    ctx.fillStyle = list.background.color;
    ctx.fillRect(ox, oy, list.width * scale, list.height * scale);
  }
  // recorte al lienzo lógico
  ctx.beginPath();
  ctx.rect(ox, oy, list.width * scale, list.height * scale);
  ctx.clip();
  const g = options.globalAlpha ?? 1;
  for (const node of list.nodes) drawNode(ctx, node, scale, ox, oy, g, resources, options.tint ?? null);
  ctx.restore();
}

function drawNode(ctx: Ctx2D, node: DrawNode, scale: number, ox: number, oy: number, globalAlpha: number, resources: ResourceProvider, tint: string | null): void {
  const m = node.matrix;
  ctx.save();
  ctx.setTransform(scale * m[0], scale * m[1], scale * m[2], scale * m[3], scale * m[4] + ox, scale * m[5] + oy);
  ctx.globalAlpha = Math.max(0, Math.min(1, node.opacity * globalAlpha));
  ctx.globalCompositeOperation = node.style.blend;
  const fill = tint ?? node.style.fill;
  const stroke = tint ?? node.style.stroke;
  ctx.lineWidth = node.style.strokeWidth;
  ctx.lineCap = node.style.lineCap;
  ctx.lineJoin = node.style.lineJoin;
  if (node.style.dash.length) ctx.setLineDash(node.style.dash);
  const geo = node.geometry;
  switch (geo.kind) {
    case 'ellipse':
      ctx.beginPath();
      ctx.ellipse(geo.cx, geo.cy, Math.max(0, geo.rx), Math.max(0, geo.ry), 0, 0, Math.PI * 2);
      paint(ctx, fill, stroke, node.style.strokeWidth);
      break;
    case 'rect':
      ctx.beginPath();
      if (geo.radius > 0) roundRect(ctx, geo.x, geo.y, geo.w, geo.h, geo.radius);
      else ctx.rect(geo.x, geo.y, geo.w, geo.h);
      paint(ctx, fill, stroke, node.style.strokeWidth);
      break;
    case 'polyline':
      ctx.beginPath();
      polylinePath(ctx, geo.points, geo.closed);
      paint(ctx, geo.closed ? fill : null, stroke ?? (geo.closed ? null : fill), node.style.strokeWidth || (geo.closed ? 0 : 2));
      break;
    case 'bezier':
      ctx.beginPath();
      bezierPath(ctx, geo.points, geo.closed);
      paint(ctx, geo.closed ? fill : null, stroke ?? (geo.closed ? null : fill), node.style.strokeWidth || (geo.closed ? 0 : 2));
      break;
    case 'image': {
      const img = resources.getImage(geo.src);
      ctx.imageSmoothingEnabled = geo.smoothing;
      if (img) {
        if (tint) {
          ctx.fillStyle = tint;
          ctx.fillRect(geo.x, geo.y, geo.w, geo.h);
        } else ctx.drawImage(img, geo.x, geo.y, geo.w, geo.h);
      } else placeholder(ctx, geo.x, geo.y, geo.w, geo.h, 'imagen');
      break;
    }
    case 'model3d': {
      const img = resources.render3d?.(geo, Math.max(1, Math.round(geo.w * scale)), Math.max(1, Math.round(geo.h * scale))) ?? null;
      if (img) ctx.drawImage(img, geo.x, geo.y, geo.w, geo.h);
      else placeholder(ctx, geo.x, geo.y, geo.w, geo.h, '3D');
      break;
    }
    case 'text':
      ctx.font = `${geo.fontSize}px ${geo.font}`;
      ctx.textAlign = geo.align;
      ctx.textBaseline = geo.baseline;
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fillText(geo.text, geo.x, geo.y);
      }
      if (stroke && node.style.strokeWidth > 0) {
        ctx.strokeStyle = stroke;
        ctx.strokeText(geo.text, geo.x, geo.y);
      }
      break;
  }
  ctx.restore();
}

function paint(ctx: Ctx2D, fill: string | null, stroke: string | null, strokeWidth: number): void {
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke && strokeWidth > 0) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = strokeWidth;
    ctx.stroke();
  }
}

export function polylinePath(ctx: Ctx2D, points: Vec2[], closed: boolean): void {
  if (!points.length) return;
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  if (closed) ctx.closePath();
}

export function bezierPath(ctx: Ctx2D, points: Vec2[], closed: boolean): void {
  if (points.length < 4) {
    polylinePath(ctx, points, closed);
    return;
  }
  ctx.moveTo(points[0].x, points[0].y);
  let i = 1;
  for (; i + 2 < points.length; i += 3) ctx.bezierCurveTo(points[i].x, points[i].y, points[i + 1].x, points[i + 1].y, points[i + 2].x, points[i + 2].y);
  if (closed) {
    // cierra con los dos controles restantes (si los hay) hacia el primer punto
    if (i + 1 < points.length) ctx.bezierCurveTo(points[i].x, points[i].y, points[i + 1].x, points[i + 1].y, points[0].x, points[0].y);
    ctx.closePath();
  }
}

function roundRect(ctx: Ctx2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function placeholder(ctx: Ctx2D, x: number, y: number, w: number, h: number, label: string): void {
  ctx.save();
  ctx.strokeStyle = '#888';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(x, y, w, h);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y + h);
  ctx.moveTo(x + w, y);
  ctx.lineTo(x, y + h);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#888';
  ctx.font = `${Math.max(8, Math.min(w, h) / 6)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y + h / 2);
  ctx.restore();
}
