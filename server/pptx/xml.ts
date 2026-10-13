import { DOMParser } from '@xmldom/xmldom';

export type El = Element;

export function parseXml(text: string): Document {
  return new DOMParser().parseFromString(text, 'text/xml') as unknown as Document;
}

/** Enfants directs portant ce nom local (sans préfixe de namespace). */
export function kids(el: El | null | undefined, name?: string): El[] {
  const out: El[] = [];
  if (!el) return out;
  for (let n = el.firstChild; n; n = n.nextSibling) {
    if (n.nodeType === 1 && (!name || (n as El).localName === name)) out.push(n as El);
  }
  return out;
}

export function kid(el: El | null | undefined, name: string): El | null {
  if (!el) return null;
  for (let n = el.firstChild; n; n = n.nextSibling) {
    if (n.nodeType === 1 && (n as El).localName === name) return n as El;
  }
  return null;
}

/** Suit un chemin de noms locaux : path(el, 'spPr', 'xfrm', 'off'). */
export function path(el: El | null | undefined, ...names: string[]): El | null {
  let cur: El | null = el ?? null;
  for (const n of names) {
    cur = kid(cur, n);
    if (!cur) return null;
  }
  return cur;
}

/** Premier descendant portant ce nom local. */
export function find(el: El | null | undefined, name: string): El | null {
  if (!el) return null;
  for (let n = el.firstChild; n; n = n.nextSibling) {
    if (n.nodeType !== 1) continue;
    if ((n as El).localName === name) return n as El;
    const r = find(n as El, name);
    if (r) return r;
  }
  return null;
}

export function findAll(el: El | null | undefined, name: string, out: El[] = []): El[] {
  if (!el) return out;
  for (let n = el.firstChild; n; n = n.nextSibling) {
    if (n.nodeType !== 1) continue;
    if ((n as El).localName === name) out.push(n as El);
    findAll(n as El, name, out);
  }
  return out;
}

export function attr(el: El | null | undefined, name: string): string | undefined {
  if (!el) return undefined;
  const v = el.getAttribute(name);
  return v === null || v === '' ? undefined : v;
}

export function num(el: El | null | undefined, name: string): number | undefined {
  const v = attr(el, name);
  if (v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export function bool(el: El | null | undefined, name: string): boolean | undefined {
  const v = attr(el, name);
  if (v === undefined) return undefined;
  return v === '1' || v === 'true';
}

export function textOf(el: El | null | undefined): string {
  return el?.textContent ?? '';
}

/** Résout un chemin relatif d'une relation OPC (ex. ../media/image1.png). */
export function resolvePath(base: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = base.split('/');
  parts.pop();
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}

export const EMU_PER_PT = 12700;
export const emu = (v: number | undefined): number => (v ?? 0) / EMU_PER_PT;
