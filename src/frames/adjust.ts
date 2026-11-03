// Ajustes de color sobre píxeles RGBA (deterministas, sin depender de ctx.filter): brillo, contraste, saturación,
// inversión, escala de grises y umbral. Trabajan en sRGB sobre los canales premultiplicados tal como los entrega
// getImageData (no premultiplicado), respetando el alfa.
import type { ColorAdjust } from './settings';

export function applyColorAdjust(data: Uint8ClampedArray, c: ColorAdjust): void {
  const bright = c.brightness * 255;
  const contrast = c.contrast;
  const sat = c.saturation;
  const thr = c.threshold * 255;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];
    if (sat !== 1 || c.grayscale) {
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (c.grayscale) {
        r = g = b = l;
      } else {
        r = l + (r - l) * sat;
        g = l + (g - l) * sat;
        b = l + (b - l) * sat;
      }
    }
    if (contrast !== 1) {
      r = (r - 128) * contrast + 128;
      g = (g - 128) * contrast + 128;
      b = (b - 128) * contrast + 128;
    }
    if (bright !== 0) {
      r += bright;
      g += bright;
      b += bright;
    }
    if (c.invert) {
      r = 255 - r;
      g = 255 - g;
      b = 255 - b;
    }
    if (thr > 0) {
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const v = l >= thr ? 255 : 0;
      r = g = b = v;
    }
    data[i] = r < 0 ? 0 : r > 255 ? 255 : r;
    data[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
    data[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
  }
}
