// Fábrica de canvas para las pruebas en Node con @napi-rs/canvas (misma interfaz que el navegador).
import { createCanvas, loadImage, type Canvas } from '@napi-rs/canvas';
import type { CanvasFactory, CanvasLike } from '../frames/generator';

export const nodeCanvases: CanvasFactory = {
  create(width, height) {
    return createCanvas(Math.max(1, Math.round(width)), Math.max(1, Math.round(height))) as unknown as CanvasLike;
  },
  async toPng(canvas) {
    return new Uint8Array((canvas as unknown as Canvas).toBuffer('image/png'));
  },
};

export async function pngSize(bytes: Uint8Array): Promise<{ width: number; height: number }> {
  const img = await loadImage(Buffer.from(bytes));
  return { width: img.width, height: img.height };
}

/** lee el encabezado IHDR de un PNG sin decodificarlo */
export function pngHeader(bytes: Uint8Array): { width: number; height: number; colorType: number; bitDepth: number } {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) if (bytes[i] !== sig[i]) throw new Error('No es un PNG');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: dv.getUint32(16), height: dv.getUint32(20), bitDepth: bytes[24], colorType: bytes[25] };
}

export function imageDataOf(canvas: CanvasLike): { width: number; height: number; data: Uint8ClampedArray } {
  const ctx = canvas.getContext('2d')!;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { width: img.width, height: img.height, data: img.data };
}
