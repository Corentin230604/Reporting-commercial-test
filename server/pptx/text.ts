import type { Bullet, Link, Paragraph, Run, Spacing, TextBody } from '../../shared/model.ts';
import { resolveColor, type ColorCtx } from './color.ts';
import { attr, bool, emu, kid, kids, num, path, textOf, type El } from './xml.ts';

/** Propriétés de caractère (partielles, fusionnées le long de la chaîne d'héritage). */
export interface RunProps {
  sz?: number;
  b?: boolean;
  i?: boolean;
  u?: boolean;
  strike?: boolean;
  color?: string;
  font?: string;
  highlight?: string;
  baseline?: number;
}

/** Propriétés de paragraphe pour un niveau de liste. */
export interface LvlProps {
  marL?: number;
  indent?: number;
  algn?: Paragraph['align'];
  lnSpc?: Spacing;
  spcBef?: Spacing;
  spcAft?: Spacing;
  bullet?: Partial<Bullet> & { none?: boolean; font?: string };
  rPr: RunProps;
}

/** Styles par niveau (index 1..9). */
export type ListStyle = Record<number, LvlProps>;

export interface TextCtx extends ColorCtx {
  majorFont: string;
  minorFont: string;
  /** Résout un lien hypertexte (r:id) vers une cible. */
  link: (rid: string | undefined, action: string | undefined) => Link | undefined;
}

const ALIGN: Record<string, Paragraph['align']> = { l: 'l', ctr: 'ctr', r: 'r', just: 'just', dist: 'just' };

export function parseSpacing(el: El | null): Spacing | undefined {
  if (!el) return undefined;
  const pct = path(el, 'spcPct');
  if (pct) return { pct: (num(pct, 'val') ?? 100000) / 100000 };
  const pts = path(el, 'spcPts');
  if (pts) return { pts: (num(pts, 'val') ?? 0) / 100 };
  return undefined;
}

export function parseRunProps(rPr: El | null | undefined, ctx: ColorCtx): RunProps {
  const p: RunProps = {};
  if (!rPr) return p;
  const sz = num(rPr, 'sz');
  if (sz !== undefined) p.sz = sz / 100;
  const b = bool(rPr, 'b');
  if (b !== undefined) p.b = b;
  const i = bool(rPr, 'i');
  if (i !== undefined) p.i = i;
  const u = attr(rPr, 'u');
  if (u !== undefined) p.u = u !== 'none';
  const strike = attr(rPr, 'strike');
  if (strike !== undefined) p.strike = strike !== 'noStrike';
  const baseline = num(rPr, 'baseline');
  if (baseline !== undefined) p.baseline = baseline / 1000;
  const fill = kid(rPr, 'solidFill');
  if (fill) {
    const c = resolveColor(fill, ctx);
    if (c) p.color = c.hex;
  } else {
    const grad = path(rPr, 'gradFill', 'gsLst', 'gs');
    const c = grad ? resolveColor(grad, ctx) : undefined;
    if (c) p.color = c.hex;
  }
  const hl = kid(rPr, 'highlight');
  if (hl) {
    const c = resolveColor(hl, ctx);
    if (c) p.highlight = c.hex;
  }
  const latin = attr(kid(rPr, 'latin'), 'typeface');
  if (latin) p.font = latin;
  return p;
}

export function parseLvl(pPr: El | null | undefined, ctx: ColorCtx): LvlProps {
  const l: LvlProps = { rPr: {} };
  if (!pPr) return l;
  const marL = num(pPr, 'marL');
  if (marL !== undefined) l.marL = emu(marL);
  const indent = num(pPr, 'indent');
  if (indent !== undefined) l.indent = emu(indent);
  const algn = attr(pPr, 'algn');
  if (algn) l.algn = ALIGN[algn] ?? 'l';
  l.lnSpc = parseSpacing(kid(pPr, 'lnSpc'));
  l.spcBef = parseSpacing(kid(pPr, 'spcBef'));
  l.spcAft = parseSpacing(kid(pPr, 'spcAft'));

  const bu: LvlProps['bullet'] = {};
  let hasBu = false;
  if (kid(pPr, 'buNone')) {
    bu.none = true;
    hasBu = true;
  }
  const buChar = kid(pPr, 'buChar');
  if (buChar) {
    bu.char = attr(buChar, 'char');
    bu.none = false;
    hasBu = true;
  }
  const buAuto = kid(pPr, 'buAutoNum');
  if (buAuto) {
    bu.autoNum = attr(buAuto, 'type') ?? 'arabicPeriod';
    bu.none = false;
    hasBu = true;
  }
  const buFont = attr(kid(pPr, 'buFont'), 'typeface');
  if (buFont) {
    bu.font = buFont;
    hasBu = true;
  }
  const buClr = kid(pPr, 'buClr');
  if (buClr) {
    const c = resolveColor(buClr, ctx);
    if (c) {
      bu.color = c.hex;
      hasBu = true;
    }
  }
  const buSz = num(kid(pPr, 'buSzPct'), 'val');
  if (buSz !== undefined) {
    bu.sizePct = buSz / 100000;
    hasBu = true;
  }
  if (hasBu) l.bullet = bu;
  l.rPr = parseRunProps(kid(pPr, 'defRPr'), ctx);
  return l;
}

export function parseListStyle(el: El | null | undefined, ctx: ColorCtx): ListStyle {
  const ls: ListStyle = {};
  if (!el) return ls;
  for (const k of kids(el)) {
    const m = /^lvl(\d)pPr$/.exec(k.localName);
    if (m) ls[Number(m[1])] = parseLvl(k, ctx);
  }
  return ls;
}

function mergeRun(a: RunProps, b: RunProps): RunProps {
  return { ...a, ...strip(b) };
}

function mergeLvl(a: LvlProps, b: LvlProps): LvlProps {
  const out: LvlProps = { ...a, ...strip({ ...b, rPr: undefined, bullet: undefined }), rPr: mergeRun(a.rPr, b.rPr) };
  if (a.bullet || b.bullet) out.bullet = { ...(a.bullet ?? {}), ...strip(b.bullet ?? {}) };
  return out;
}

function strip<T extends object>(o: T): Partial<T> {
  const r: Partial<T> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) (r as Record<string, unknown>)[k] = v;
  return r;
}

/** Fusionne une chaîne de styles de liste (du plus général au plus spécifique). */
export function lvlFromChain(chain: ListStyle[], level: number): LvlProps {
  let acc: LvlProps = { rPr: {} };
  for (const ls of chain) {
    const l = ls[level];
    if (l) acc = mergeLvl(acc, l);
  }
  return acc;
}

/** Caractères des polices symboles (Wingdings…) vers Unicode. */
const WINGDINGS: Record<string, string> = {
  '§': '▪', Ø: '➢', w: '◆', u: '◆', v: '❖', l: '●', n: '■', o: '□', q: '❑', ü: '✔', û: '✘',
  ß: '←', à: '→', á: '↑', â: '↓', ç: '⬅', è: '➔', é: '⬆', ê: '⬇', ð: '⇨', ñ: '⇧', ò: '⇩',
  J: '☺', F: '☞', '': '•',
};

export function symbolChar(ch: string, font: string | undefined): string {
  if (!font) return ch;
  if (/wingdings|symbol|webdings/i.test(font)) {
    let out = '';
    for (const c of ch) {
      const code = c.codePointAt(0)!;
      const plain = code >= 0xf000 && code <= 0xf0ff ? String.fromCharCode(code - 0xf000) : c;
      out += WINGDINGS[plain] ?? (/symbol/i.test(font) && plain === '·' ? '•' : plain);
    }
    return out;
  }
  return ch;
}

function themeFont(name: string | undefined, ctx: TextCtx): string | undefined {
  if (!name) return undefined;
  if (name.startsWith('+mj')) return ctx.majorFont;
  if (name.startsWith('+mn')) return ctx.minorFont;
  return name;
}

export interface BodyDefaults {
  anchor?: TextBody['anchor'];
  insets?: Partial<TextBody['insets']>;
  wrap?: boolean;
}

export function parseBodyPr(bodyPr: El | null | undefined): BodyDefaults & { fontScale?: number; lineReduction?: number } {
  const d: BodyDefaults & { fontScale?: number; lineReduction?: number } = {};
  if (!bodyPr) return d;
  const anchor = attr(bodyPr, 'anchor');
  if (anchor === 't' || anchor === 'ctr' || anchor === 'b') d.anchor = anchor;
  const ins: Partial<TextBody['insets']> = {};
  for (const [k, a] of [['l', 'lIns'], ['t', 'tIns'], ['r', 'rIns'], ['b', 'bIns']] as const) {
    const v = num(bodyPr, a);
    if (v !== undefined) ins[k] = emu(v);
  }
  if (Object.keys(ins).length) d.insets = ins;
  const wrap = attr(bodyPr, 'wrap');
  if (wrap) d.wrap = wrap !== 'none';
  const norm = kid(bodyPr, 'normAutofit');
  if (norm) {
    const fs = num(norm, 'fontScale');
    if (fs !== undefined) d.fontScale = fs / 100000;
    const lr = num(norm, 'lnSpcReduction');
    if (lr !== undefined) d.lineReduction = lr / 100000;
  }
  return d;
}

/**
 * Construit le corps de texte d'une forme.
 * @param chain styles de liste du plus général au plus spécifique (masque -> forme).
 * @param bodyChain bodyPr du plus général au plus spécifique.
 */
export function parseTextBody(
  txBody: El,
  chain: ListStyle[],
  bodyChain: (El | null | undefined)[],
  ctx: TextCtx,
  defaultColor?: string,
): TextBody | undefined {
  const own = parseListStyle(kid(txBody, 'lstStyle'), ctx);
  const fullChain = [...chain, own];

  let body: ReturnType<typeof parseBodyPr> = {};
  for (const b of [...bodyChain, kid(txBody, 'bodyPr')]) {
    const p = parseBodyPr(b);
    body = { ...body, ...strip(p), insets: { ...(body.insets ?? {}), ...(p.insets ?? {}) } };
  }

  const paragraphs: Paragraph[] = [];
  let autoCounters: Record<number, number> = {};
  for (const p of kids(txBody, 'p')) {
    const pPr = kid(p, 'pPr');
    const level = (num(pPr, 'lvl') ?? 0) + 1;
    const lvl = mergeLvl(lvlFromChain(fullChain, level), parseLvl(pPr, ctx));

    const runs: Run[] = [];
    for (const r of kids(p)) {
      const name = r.localName;
      if (name === 'br') {
        const rp = mergeRun(lvl.rPr, parseRunProps(kid(r, 'rPr'), ctx));
        runs.push(makeRun('', rp, ctx, defaultColor, true));
        continue;
      }
      if (name !== 'r' && name !== 'fld') continue;
      const rPrEl = kid(r, 'rPr');
      const rp = mergeRun(lvl.rPr, parseRunProps(rPrEl, ctx));
      let text = textOf(kid(r, 't'));
      if (name === 'fld' && attr(r, 'type') === 'slidenum') text = '{{slide}}';
      const run = makeRun(text, rp, ctx, defaultColor, false);
      const hl = kid(rPrEl, 'hlinkClick');
      if (hl) {
        const link = ctx.link(attr(hl, 'r:id'), attr(hl, 'action'));
        if (link) run.link = link;
      }
      runs.push(run);
    }
    const endRp = mergeRun(lvl.rPr, parseRunProps(kid(p, 'endParaRPr'), ctx));

    const hasText = runs.some((r) => r.text.trim().length > 0);
    let bullet: Bullet | undefined;
    if (hasText && lvl.bullet && !lvl.bullet.none && (lvl.bullet.char || lvl.bullet.autoNum)) {
      bullet = {};
      if (lvl.bullet.char) bullet.char = symbolChar(lvl.bullet.char, lvl.bullet.font);
      if (lvl.bullet.autoNum) {
        autoCounters[level] = (autoCounters[level] ?? 0) + 1;
        bullet.autoNum = formatAutoNum(lvl.bullet.autoNum, autoCounters[level]);
      }
      bullet.color = lvl.bullet.color ?? runs.find((r) => r.text.trim())?.color ?? defaultColor;
      if (lvl.bullet.sizePct) bullet.sizePct = lvl.bullet.sizePct;
    } else if (!lvl.bullet?.autoNum) {
      autoCounters = {};
    }

    paragraphs.push({
      level,
      align: lvl.algn ?? 'l',
      marL: lvl.marL ?? 0,
      indent: lvl.indent ?? 0,
      spaceBefore: lvl.spcBef,
      spaceAfter: lvl.spcAft,
      lineSpacing: lvl.lnSpc,
      bullet,
      runs,
      endSize: endRp.sz ?? 18,
    });
  }

  if (!paragraphs.some((p) => p.runs.some((r) => r.text.trim()))) return undefined;

  return {
    paragraphs,
    anchor: body.anchor ?? 't',
    insets: { l: 7.2, t: 3.6, r: 7.2, b: 3.6, ...(body.insets ?? {}) },
    wrap: body.wrap ?? true,
    fontScale: body.fontScale,
    lineReduction: body.lineReduction,
  };
}

function makeRun(text: string, rp: RunProps, ctx: TextCtx, defaultColor: string | undefined, br: boolean): Run {
  const font = themeFont(rp.font, ctx);
  const run: Run = { text: symbolChar(text, font), size: rp.sz ?? 18 };
  if (br) run.br = true;
  if (rp.b) run.bold = true;
  if (rp.i) run.italic = true;
  if (rp.u) run.underline = true;
  if (rp.strike) run.strike = true;
  const color = rp.color ?? defaultColor;
  if (color) run.color = color;
  if (rp.highlight) run.highlight = rp.highlight;
  if (font && !/wingdings|symbol|webdings/i.test(font)) run.font = font;
  if (rp.baseline) run.baseline = rp.baseline;
  return run;
}

function formatAutoNum(type: string, n: number): string {
  const alpha = (i: number) => String.fromCharCode(96 + ((i - 1) % 26) + 1);
  const roman = (i: number) => {
    const t: [number, string][] = [[10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];
    let s = '';
    for (const [v, r] of t) while (i >= v) { s += r; i -= v; }
    return s;
  };
  let core = String(n);
  if (type.startsWith('alphaLc')) core = alpha(n);
  else if (type.startsWith('alphaUc')) core = alpha(n).toUpperCase();
  else if (type.startsWith('romanLc')) core = roman(n);
  else if (type.startsWith('romanUc')) core = roman(n).toUpperCase();
  if (type.endsWith('ParenBoth')) return `(${core})`;
  if (type.endsWith('ParenR')) return `${core})`;
  if (type.endsWith('Plain')) return core;
  return `${core}.`;
}
