/** Colour sets for the paint panel. */
export type PaletteId = 'solid' | 'rainbow' | 'bright' | 'contrast';

const hsl = (h: number, s: number, l: number): string => {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const x = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${x(f(0))}${x(f(8))}${x(f(4))}`;
};

export const PALETTES: Record<PaletteId, { name: string; colors: string[] }> = {
  solid: {
    name: 'Solid',
    colors: ['#000000', '#555555', '#aaaaaa', '#ffffff', '#8b1e1e', '#d0442c', '#e8892b', '#e9c84a', '#4f8a3a', '#2f6f8f', '#2b3f8c', '#6b3f8c', '#8a5a3c', '#f2e3c6'],
  },
  rainbow: { name: 'Rainbow', colors: Array.from({ length: 14 }, (_, i) => hsl((i * 360) / 14, 85, 52)) },
  bright: {
    name: 'Bright',
    colors: ['#ff1744', '#ff6d00', '#ffd600', '#c6ff00', '#00e676', '#1de9b6', '#00e5ff', '#2979ff', '#651fff', '#d500f9', '#f50057', '#ff4081', '#ffffff', '#111111'],
  },
  contrast: {
    // Okabe–Ito colour-blind-safe set plus black and white
    name: 'Contrast',
    colors: ['#000000', '#ffffff', '#e69f00', '#56b4e9', '#009e73', '#f0e442', '#0072b2', '#d55e00', '#cc79a7', '#999999'],
  },
};

function hexToHsl(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s * 100, l * 100];
}

/** Colour used on reflected tiles when "different palette" is on: opposite hue, greys inverted. */
export function alternateColor(hex: string): string {
  const v = hexToHsl(hex);
  if (!v) return hex;
  const [h, s, l] = v;
  if (s < 8) return hsl(0, 0, 100 - l);
  return hsl((h + 180) % 360, s, l);
}
