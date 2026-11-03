// Fábrica de canvas y proveedor de recursos para el navegador: HTMLCanvasElement (OffscreenCanvas cuando existe),
// codificación PNG, carga de imágenes (data URL o URL) con aviso al terminar, y render de elementos 3D (glTF) con
// three.js a un canvas offscreen compartido.
import type { CanvasFactory, CanvasLike } from '../frames/generator';
import type { ResourceProvider } from '../animation/render2d';
import type { Geometry } from '../animation/evaluate';

export const browserCanvases: CanvasFactory = {
  create(width, height) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(width));
    c.height = Math.max(1, Math.round(height));
    return c as unknown as CanvasLike;
  },
  async toPng(canvas) {
    const c = canvas as unknown as HTMLCanvasElement;
    const blob = await new Promise<Blob | null>((resolve) => c.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('No se pudo codificar el PNG');
    return new Uint8Array(await blob.arrayBuffer());
  },
  dispose(canvas) {
    const c = canvas as unknown as HTMLCanvasElement;
    c.width = 1;
    c.height = 1;
  },
};

export async function canvasToJpeg(canvas: CanvasLike, quality = 0.95): Promise<Uint8Array> {
  const c = canvas as unknown as HTMLCanvasElement;
  const blob = await new Promise<Blob | null>((resolve) => c.toBlob(resolve, 'image/jpeg', quality));
  if (!blob) throw new Error('No se pudo codificar el JPEG');
  return new Uint8Array(await blob.arrayBuffer());
}

export function canvasToDataUrl(canvas: CanvasLike, type = 'image/png'): string {
  return (canvas as unknown as HTMLCanvasElement).toDataURL(type);
}

export type Render3dHook = (geometry: Extract<Geometry, { kind: 'model3d' }>, widthPx: number, heightPx: number) => CanvasImageSource | null;

/** Recursos del navegador: caché de imágenes decodificadas; avisa (onReady) cuando llega una nueva para repintar. */
export class BrowserResources implements ResourceProvider {
  private images = new Map<string, HTMLImageElement | ImageBitmap | null>();
  private loading = new Set<string>();
  onReady: (() => void) | null = null;
  render3dHook: Render3dHook | null = null;

  getImage(src: string): CanvasImageSource | null {
    const hit = this.images.get(src);
    if (hit) return hit;
    if (hit === null) return null;
    if (!this.loading.has(src)) {
      this.loading.add(src);
      const img = new Image();
      if (!src.startsWith('data:')) img.crossOrigin = 'anonymous';
      img.onload = () => {
        this.images.set(src, img);
        this.loading.delete(src);
        this.onReady?.();
      };
      img.onerror = () => {
        this.images.set(src, null);
        this.loading.delete(src);
      };
      img.src = src;
    }
    return null;
  }

  has(src: string): boolean {
    return !!this.images.get(src);
  }

  render3d(geometry: Extract<Geometry, { kind: 'model3d' }>, widthPx: number, heightPx: number): CanvasImageSource | null {
    return this.render3dHook?.(geometry, widthPx, heightPx) ?? null;
  }
}

/** lee un File como data URL */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

/** dimensiones naturales de una imagen */
export function imageSize(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('No se pudo leer la imagen'));
    img.src = src;
  });
}
