import { attr, kids, num, type El } from './xml.ts';

export interface Theme {
  colors: Record<string, string>;
  majorFont: string;
  minorFont: string;
}

/** Correspondance bg1/tx1… -> lt1/dk1… définie par le masque. */
export type ClrMap = Record<string, string>;

export interface ColorCtx {
  theme: Theme;
  clrMap: ClrMap;
  /** Couleur de substitution pour phClr (styles de thème). */
  phClr?: string;
}

export interface ResolvedColor {
  hex: string;
  alpha?: number;
}

const PRESET: Record<string, string> = {
  black: '000000', white: 'FFFFFF', red: 'FF0000', green: '008000', blue: '0000FF',
  yellow: 'FFFF00', gray: '808080', grey: '808080', orange: 'FFA500',
};

const COLOR_TAGS = new Set(['srgbClr', 'schemeClr', 'sysClr', 'prstClr', 'scrgbClr', 'hslClr']);

/** Résout la couleur contenue dans `parent` (ex. un <a:solidFill>). */
export function resolveColor(parent: El | null | undefined, ctx: ColorCtx): ResolvedColor | undefined {
  if (!parent) return undefined;
  const node = kids(parent).find((k) => COLOR_TAGS.has(k.localName));
  if (!node) return undefined;
  return resolveColorNode(node, ctx);
}

export function resolveColorNode(node: El, ctx: ColorCtx): ResolvedColor | undefined {
  let hex: string | undefined;
  switch (node.localName) {
    case 'srgbClr':
      hex = attr(node, 'val');
      break;
    case 'sysClr':
      hex = attr(node, 'lastClr') ?? (attr(node, 'val') === 'window' ? 'FFFFFF' : '000000');
      break;
    case 'prstClr':
      hex = PRESET[attr(node, 'val') ?? ''] ?? '000000';
      break;
    case 'scrgbClr': {
      const c = (k: string) => Math.round(Math.min(1, (num(node, k) ?? 0) / 100000) * 255);
      hex = toHex(c('r'), c('g'), c('b'));
      break;
    }
    case 'schemeClr': {
      const val = attr(node, 'val') ?? 'tx1';
      if (val === 'phClr') hex = ctx.phClr ?? '000000';
      else hex = schemeHex(val, ctx);
      break;
    }
    default:
      return undefined;
  }
  if (!hex) return undefined;
  return applyMods(hex.toUpperCase(), node);
}

export function schemeHex(val: string, ctx: ColorCtx): string {
  const mapped = ctx.clrMap[val] ?? val;
  return ctx.theme.colors[mapped] ?? ctx.theme.colors[val] ?? '000000';
}

function applyMods(hex: string, node: El): ResolvedColor {
  let [r, g, b] = fromHex(hex);
  let alpha: number | undefined;
  for (const m of kids(node)) {
    const v = (num(m, 'val') ?? 100000) / 100000;
    switch (m.localName) {
      case 'alpha':
        alpha = v;
        break;
      case 'lumMod':
      case 'lumOff': {
        const [h, s, l] = rgbToHsl(r, g, b);
        const nl = m.localName === 'lumMod' ? l * v : l + v;
        [r, g, b] = hslToRgb(h, s, clamp01(nl));
        break;
      }
      case 'tint':
        r = r + (255 - r) * (1 - v);
        g = g + (255 - g) * (1 - v);
        b = b + (255 - b) * (1 - v);
        break;
      case 'shade':
        r *= v;
        g *= v;
        b *= v;
        break;
      case 'satMod': {
        const [h, s, l] = rgbToHsl(r, g, b);
        [r, g, b] = hslToRgb(h, clamp01(s * v), l);
        break;
      }
    }
  }
  return { hex: toHex(r, g, b), alpha: alpha !== undefined && alpha < 1 ? alpha : undefined };
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function fromHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '').padStart(6, '0');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function toHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');
  return (c(r) + c(g) + c(b)).toUpperCase();
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h / 6, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}
