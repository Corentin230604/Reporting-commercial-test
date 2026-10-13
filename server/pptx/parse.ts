import JSZip from 'jszip';
import type {
  Box, Element, Fill, ImageElement, Link, Report, Run, Slide, Stroke, TableCell, TableElement, TextBody,
} from '../../shared/model.ts';
import { resolveColor, type ClrMap, type ColorCtx, type Theme } from './color.ts';
import { parseListStyle, parseTextBody, type ListStyle, type TextCtx } from './text.ts';
import { attr, bool, emu, find, findAll, kid, kids, num, parseXml, path, resolvePath, type El } from './xml.ts';

/** Média à extraire du paquet puis à convertir si nécessaire (EMF/WMF -> SVG). */
export interface MediaItem {
  zipPath: string;
  /** Nom du fichier de sortie, sans extension finale (ajoutée après conversion). */
  outBase: string;
  ext: string;
  /** Nom final référencé dans le modèle (mis à jour après conversion). */
  outName: string;
}

interface Part {
  path: string;
  doc: Document;
  root: El;
  rels: Map<string, { target: string; type: string; external: boolean }>;
}

interface Master {
  part: Part;
  clrMap: ClrMap;
  theme: Theme;
  titleStyle: ListStyle;
  bodyStyle: ListStyle;
  otherStyle: ListStyle;
}

interface Layout {
  part: Part;
  name: string;
  master: Master;
  clrMapOverride?: ClrMap;
}

export interface ParsedPptx {
  report: Omit<Report, 'id' | 'createdAt' | 'source'>;
  media: MediaItem[];
  zip: JSZip;
  warnings: string[];
}

const SECTION_FALLBACK = ['Points clés', 'Analyse', 'Focus', 'Annexes'];

export async function parsePptx(buffer: Buffer | Uint8Array): Promise<ParsedPptx> {
  const zip = await JSZip.loadAsync(buffer);
  const warnings: string[] = [];
  const parts = new Map<string, Part>();

  async function loadPart(p: string): Promise<Part> {
    const cached = parts.get(p);
    if (cached) return cached;
    const file = zip.file(p);
    if (!file) throw new Error(`Fichier manquant dans le pptx : ${p}`);
    const doc = parseXml(await file.async('string'));
    const relsPath = p.replace(/([^/]+)$/, '_rels/$1.rels');
    const rels = new Map<string, { target: string; type: string; external: boolean }>();
    const relFile = zip.file(relsPath);
    if (relFile) {
      const rdoc = parseXml(await relFile.async('string'));
      for (const r of findAll(rdoc.documentElement as unknown as El, 'Relationship')) {
        const external = attr(r, 'TargetMode') === 'External';
        const target = attr(r, 'Target') ?? '';
        rels.set(attr(r, 'Id') ?? '', {
          target: external ? target : resolvePath(p, target),
          type: (attr(r, 'Type') ?? '').split('/').pop() ?? '',
          external,
        });
      }
    }
    const part = { path: p, doc, root: doc.documentElement as unknown as El, rels };
    parts.set(p, part);
    return part;
  }

  const pres = await loadPart('ppt/presentation.xml');
  const sldSz = find(pres.root, 'sldSz');
  const size = { w: emu(num(sldSz, 'cx') ?? 9144000), h: emu(num(sldSz, 'cy') ?? 6858000) };
  const defaultTextStyle = find(pres.root, 'defaultTextStyle');

  // --- Masques et thèmes -----------------------------------------------------
  const masters = new Map<string, Master>();
  async function loadMaster(p: string): Promise<Master> {
    const m = masters.get(p);
    if (m) return m;
    const part = await loadPart(p);
    const themeRel = [...part.rels.values()].find((r) => r.type === 'theme');
    const theme = await loadTheme(themeRel ? themeRel.target : 'ppt/theme/theme1.xml');
    const clrMapEl = kid(part.root, 'clrMap');
    const clrMap: ClrMap = {};
    if (clrMapEl) for (let i = 0; i < clrMapEl.attributes.length; i++) {
      const a = clrMapEl.attributes[i];
      clrMap[a.name] = a.value;
    }
    const ctx: ColorCtx = { theme, clrMap };
    const txStyles = kid(part.root, 'txStyles');
    const master: Master = {
      part, clrMap, theme,
      titleStyle: parseListStyle(kid(txStyles, 'titleStyle'), ctx),
      bodyStyle: parseListStyle(kid(txStyles, 'bodyStyle'), ctx),
      otherStyle: parseListStyle(kid(txStyles, 'otherStyle'), ctx),
    };
    masters.set(p, master);
    return master;
  }

  async function loadTheme(p: string): Promise<Theme> {
    const colors: Record<string, string> = {};
    let majorFont = 'Arial';
    let minorFont = 'Arial';
    try {
      const part = await loadPart(p);
      const scheme = find(part.root, 'clrScheme');
      for (const c of kids(scheme)) {
        const v = kids(c)[0];
        if (!v) continue;
        colors[c.localName] = (v.localName === 'sysClr' ? attr(v, 'lastClr') : attr(v, 'val')) ?? '000000';
      }
      majorFont = attr(path(find(part.root, 'majorFont'), 'latin'), 'typeface') ?? majorFont;
      minorFont = attr(path(find(part.root, 'minorFont'), 'latin'), 'typeface') ?? minorFont;
    } catch {
      warnings.push('Thème introuvable, couleurs par défaut utilisées.');
    }
    return { colors, majorFont, minorFont };
  }

  const layouts = new Map<string, Layout>();
  async function loadLayout(p: string): Promise<Layout> {
    const l = layouts.get(p);
    if (l) return l;
    const part = await loadPart(p);
    const masterRel = [...part.rels.values()].find((r) => r.type === 'slideMaster');
    const master = await loadMaster(masterRel!.target);
    const layout: Layout = {
      part, master,
      name: attr(kid(part.root, 'cSld'), 'name') ?? '',
      clrMapOverride: readOverride(part.root),
    };
    layouts.set(p, layout);
    return layout;
  }

  // --- Slides ---------------------------------------------------------------
  const sldIds = findAll(find(pres.root, 'sldIdLst'), 'sldId');
  const slidePaths = sldIds.map((s) => pres.rels.get(attr(s, 'r:id') ?? '')?.target).filter(Boolean) as string[];

  const visible: { path: string; sourceNumber: number }[] = [];
  for (let i = 0; i < slidePaths.length; i++) {
    const part = await loadPart(slidePaths[i]);
    if (attr(part.root, 'show') === '0') continue;
    visible.push({ path: slidePaths[i], sourceNumber: i + 1 });
  }
  const slideIndexByPath = new Map(visible.map((v, i) => [v.path, i]));

  // --- Médias -----------------------------------------------------------------
  const media: MediaItem[] = [];
  const mediaByPath = new Map<string, MediaItem>();
  function registerMedia(zipPath: string): MediaItem {
    const existing = mediaByPath.get(zipPath);
    if (existing) return existing;
    const ext = (zipPath.split('.').pop() ?? '').toLowerCase();
    const outBase = `m${media.length + 1}`;
    const item: MediaItem = { zipPath, outBase, ext, outName: `${outBase}.${ext}` };
    media.push(item);
    mediaByPath.set(zipPath, item);
    return item;
  }

  // --- Conversion d'un arbre de formes ------------------------------------------
  let idSeq = 0;

  interface ShapeCtx {
    part: Part;
    layout: Layout;
    master: Master;
    color: ColorCtx;
    text: TextCtx;
    /** Niveau d'arbre : slide, layout ou master (pour l'héritage des placeholders). */
    level: 'slide' | 'layout' | 'master';
  }

  function makeCtx(part: Part, layout: Layout, level: ShapeCtx['level'], override?: ClrMap): ShapeCtx {
    const master = layout.master;
    const clrMap = { ...master.clrMap, ...(layout.clrMapOverride ?? {}), ...(override ?? {}) };
    const color: ColorCtx = { theme: master.theme, clrMap };
    const text: TextCtx = {
      ...color,
      majorFont: master.theme.majorFont,
      minorFont: master.theme.minorFont,
      link: (rid, action) => resolveLink(part, rid, action),
    };
    return { part, layout, master, color, text, level };
  }

  function resolveLink(part: Part, rid: string | undefined, action: string | undefined): Link | undefined {
    if (action && action.includes('noaction')) return undefined;
    if (action?.includes('jump=')) return undefined; // first/last/next slide : géré par le viewer
    if (!rid) return undefined;
    const rel = part.rels.get(rid);
    if (!rel) return undefined;
    if (rel.external) return { url: rel.target };
    const idx = slideIndexByPath.get(rel.target);
    return idx !== undefined ? { slide: idx } : undefined;
  }

  /** Recherche le placeholder correspondant dans un arbre de formes (layout ou master). */
  function findPlaceholder(root: El, type: string | undefined, idx: string | undefined): El | null {
    const all = findAll(kid(root, 'cSld'), 'ph');
    const norm = (t: string | undefined) => (t === 'ctrTitle' ? 'title' : t === 'subTitle' || t === 'obj' || !t ? 'body' : t);
    if (idx !== undefined) {
      const byIdx = all.find((ph) => attr(ph, 'idx') === idx);
      if (byIdx) return shapeOfPh(byIdx);
    }
    const byType = all.find((ph) => norm(attr(ph, 'type')) === norm(type));
    return byType ? shapeOfPh(byType) : null;
  }

  function shapeOfPh(ph: El): El | null {
    let n: Node | null = ph.parentNode;
    while (n && !(n.nodeType === 1 && ['sp', 'pic', 'graphicFrame', 'cxnSp'].includes((n as El).localName))) n = n.parentNode;
    return n as El | null;
  }

  function placeholderOf(sp: El): { type?: string; idx?: string } | null {
    const ph = path(sp, 'nvSpPr', 'nvPr', 'ph') ?? path(sp, 'nvPicPr', 'nvPr', 'ph') ?? path(sp, 'nvGraphicFramePr', 'nvPr', 'ph');
    if (!ph) return null;
    return { type: attr(ph, 'type'), idx: attr(ph, 'idx') };
  }

  /** Chaîne d'héritage d'un placeholder : [master, layout] (formes). */
  function inheritance(sp: El, sc: ShapeCtx): El[] {
    const ph = placeholderOf(sp);
    if (!ph) return [];
    const chain: El[] = [];
    if (sc.level === 'slide') {
      const lsp = findPlaceholder(sc.layout.part.root, ph.type, ph.idx);
      if (lsp) {
        const lph = placeholderOf(lsp);
        const msp = findPlaceholder(sc.master.part.root, lph?.type ?? ph.type, undefined);
        if (msp) chain.push(msp);
        chain.push(lsp);
      } else {
        const msp = findPlaceholder(sc.master.part.root, ph.type, undefined);
        if (msp) chain.push(msp);
      }
    } else if (sc.level === 'layout') {
      const msp = findPlaceholder(sc.master.part.root, ph.type, undefined);
      if (msp) chain.push(msp);
    }
    return chain;
  }

  function readXfrm(sp: El, chain: El[]): Box | null {
    const candidates = [sp, ...[...chain].reverse()];
    for (const c of candidates) {
      const xfrm = path(c, 'spPr', 'xfrm') ?? path(c, 'xfrm') ?? path(c, 'grpSpPr', 'xfrm');
      const off = kid(xfrm, 'off');
      const ext = kid(xfrm, 'ext');
      if (off && ext) {
        const box: Box = { x: emu(num(off, 'x')), y: emu(num(off, 'y')), w: emu(num(ext, 'cx')), h: emu(num(ext, 'cy')) };
        const rot = num(xfrm, 'rot');
        if (rot) box.rot = rot / 60000;
        if (bool(xfrm, 'flipH')) box.flipH = true;
        if (bool(xfrm, 'flipV')) box.flipV = true;
        return box;
      }
    }
    return null;
  }

  function readFill(spPr: El | null, style: El | null, sc: ShapeCtx): Fill | undefined | null {
    if (spPr) {
      if (kid(spPr, 'noFill')) return null;
      const solid = kid(spPr, 'solidFill');
      if (solid) {
        const c = resolveColor(solid, sc.color);
        return c ? { kind: 'solid', color: c.hex, alpha: c.alpha } : undefined;
      }
      const grad = kid(spPr, 'gradFill');
      if (grad) {
        const stops = kids(path(grad, 'gsLst'), 'gs').map((gs) => {
          const c = resolveColor(gs, sc.color);
          return { pos: (num(gs, 'pos') ?? 0) / 100000, color: c?.hex ?? 'FFFFFF', alpha: c?.alpha };
        });
        const ang = num(kid(grad, 'lin'), 'ang');
        return { kind: 'gradient', stops, angle: ang !== undefined ? ang / 60000 : 90 };
      }
    }
    const ref = kid(style, 'fillRef');
    if (ref && (num(ref, 'idx') ?? 0) > 0) {
      const c = resolveColor(ref, sc.color);
      if (c) return { kind: 'solid', color: c.hex, alpha: c.alpha };
    }
    return undefined;
  }

  function readStroke(spPr: El | null, style: El | null, sc: ShapeCtx): Stroke | undefined | null {
    const ln = kid(spPr, 'ln');
    const ref = kid(style, 'lnRef');
    const refIdx = num(ref, 'idx') ?? 0;
    if (ln && kid(ln, 'noFill')) return null;
    let color: string | undefined;
    let alpha: number | undefined;
    const solid = kid(ln, 'solidFill');
    if (solid) {
      const c = resolveColor(solid, sc.color);
      color = c?.hex;
      alpha = c?.alpha;
    } else if (kid(ln, 'gradFill')) {
      const c = resolveColor(path(ln, 'gradFill', 'gsLst', 'gs'), sc.color);
      color = c?.hex;
    } else if (refIdx > 0) {
      const c = resolveColor(ref, sc.color);
      color = c?.hex;
      alpha = c?.alpha;
    }
    if (!color) return undefined;
    const w = num(ln, 'w');
    const width = w !== undefined ? emu(w) : refIdx > 0 ? [0, 0.75, 2, 3][refIdx] ?? 1 : 0.75;
    const dash = attr(kid(ln, 'prstDash'), 'val');
    return { color, alpha, width, dash: dash && dash !== 'solid' ? dash : undefined };
  }

  /** Transforme une boîte des coordonnées enfant d'un groupe vers la slide. */
  type Tf = (b: Box) => Box;
  const identity: Tf = (b) => b;

  function convertTree(container: El, sc: ShapeCtx, tf: Tf, out: Element[]) {
    for (const node of kids(container)) {
      switch (node.localName) {
        case 'sp':
        case 'cxnSp':
          convertShape(node, sc, tf, out);
          break;
        case 'pic':
          convertPicture(node, sc, tf, out);
          break;
        case 'grpSp':
          convertGroup(node, sc, tf, out);
          break;
        case 'graphicFrame':
          convertGraphicFrame(node, sc, tf, out);
          break;
        case 'AlternateContent': {
          const choice = kid(node, 'Choice') ?? kid(node, 'Fallback');
          if (choice) convertTree(choice, sc, tf, out);
          break;
        }
      }
    }
  }

  function convertGroup(g: El, sc: ShapeCtx, tf: Tf, out: Element[]) {
    const xfrm = path(g, 'grpSpPr', 'xfrm');
    const off = kid(xfrm, 'off');
    const ext = kid(xfrm, 'ext');
    const chOff = kid(xfrm, 'chOff');
    const chExt = kid(xfrm, 'chExt');
    let childTf = tf;
    if (off && ext && chOff && chExt) {
      const ox = emu(num(off, 'x')), oy = emu(num(off, 'y'));
      const cx = emu(num(chOff, 'x')), cy = emu(num(chOff, 'y'));
      const sx = (num(chExt, 'cx') ?? 0) ? (num(ext, 'cx') ?? 0) / (num(chExt, 'cx') ?? 1) : 1;
      const sy = (num(chExt, 'cy') ?? 0) ? (num(ext, 'cy') ?? 0) / (num(chExt, 'cy') ?? 1) : 1;
      childTf = (b) => tf({ ...b, x: ox + (b.x - cx) * sx, y: oy + (b.y - cy) * sy, w: b.w * sx, h: b.h * sy });
    }
    convertTree(g, sc, childTf, out);
  }

  function shapeLink(sp: El, sc: ShapeCtx): Link | undefined {
    const cNvPr = find(sp, 'cNvPr');
    const hl = kid(cNvPr, 'hlinkClick');
    return hl ? resolveLink(sc.part, attr(hl, 'r:id'), attr(hl, 'action')) : undefined;
  }

  function listChainFor(sp: El, chain: El[], sc: ShapeCtx): ListStyle[] {
    const ph = placeholderOf(sp);
    const master = sc.master;
    const base: ListStyle[] = [];
    if (ph) {
      const t = ph.type;
      if (t === 'title' || t === 'ctrTitle') base.push(master.titleStyle);
      else if (t === 'dt' || t === 'ftr' || t === 'sldNum') base.push(master.otherStyle);
      else base.push(master.bodyStyle);
    } else {
      base.push(parseListStyle(defaultTextStyle, sc.color));
    }
    for (const c of chain) base.push(parseListStyle(path(c, 'txBody', 'lstStyle'), sc.color));
    return base;
  }

  function convertShape(sp: El, sc: ShapeCtx, tf: Tf, out: Element[]) {
    const chain = inheritance(sp, sc);
    const raw = readXfrm(sp, chain);
    if (!raw) return;
    const box = tf(raw);
    const spPr = kid(sp, 'spPr');
    const style = kid(sp, 'style');
    const prst = attr(kid(spPr, 'prstGeom'), 'prst');
    const cust = kid(spPr, 'custGeom');
    const link = shapeLink(sp, sc);

    let fill = readFill(spPr, style, sc);
    let stroke = readStroke(spPr, style, sc);
    // Hérite remplissage / contour du placeholder si la forme ne précise rien.
    for (const c of [...chain].reverse()) {
      if (fill === undefined) fill = readFill(kid(c, 'spPr'), kid(c, 'style'), sc);
      if (stroke === undefined) stroke = readStroke(kid(c, 'spPr'), kid(c, 'style'), sc);
    }

    const isLine = sp.localName === 'cxnSp' || prst === 'line' || prst === 'straightConnector1' || /^(bent|curved)Connector/.test(prst ?? '');
    if (isLine) {
      if (!stroke) return;
      const flipH = box.flipH, flipV = box.flipV;
      let x1 = flipH ? box.x + box.w : box.x;
      let x2 = flipH ? box.x : box.x + box.w;
      let y1 = flipV ? box.y + box.h : box.y;
      let y2 = flipV ? box.y : box.y + box.h;
      if (box.rot) {
        // Rotation autour du centre de la boîte.
        const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
        const a = (box.rot * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
        const rot = (x: number, y: number) => [cx + (x - cx) * cos - (y - cy) * sin, cy + (x - cx) * sin + (y - cy) * cos];
        [x1, y1] = rot(x1, y1);
        [x2, y2] = rot(x2, y2);
      }
      const ln = kid(spPr, 'ln');
      const head = attr(kid(ln, 'headEnd'), 'type');
      const tail = attr(kid(ln, 'tailEnd'), 'type');
      out.push({
        id: `e${++idSeq}`, type: 'line', box, x1, y1, x2, y2, stroke,
        headEnd: head && head !== 'none' ? head : undefined,
        tailEnd: tail && tail !== 'none' ? tail : undefined,
        link,
      });
      return;
    }

    const fontRefColor = resolveColor(path(style, 'fontRef'), sc.color)?.hex;
    const txBody = kid(sp, 'txBody');
    let text: TextBody | undefined;
    if (txBody) {
      const bodyChain = chain.map((c) => path(c, 'txBody', 'bodyPr'));
      text = parseTextBody(txBody, listChainFor(sp, chain, sc), bodyChain, sc.text, fontRefColor);
    }

    const geom = cust ? 'custom' : prst ?? 'rect';
    const adj: Record<string, number> = {};
    for (const gd of kids(path(spPr, 'prstGeom', 'avLst'), 'gd')) {
      const m = /^val (-?\d+)/.exec(attr(gd, 'fmla') ?? '');
      if (m) adj[attr(gd, 'name') ?? 'adj'] = Number(m[1]);
    }
    const pathData = cust ? customGeometry(cust) : undefined;

    // Image en remplissage de forme (ex. espace réservé d'image).
    const blipFill = kid(spPr, 'blipFill');
    if (blipFill) {
      const img = pictureFromBlip(blipFill, sc, box, link);
      if (img) out.push(img);
    }

    if (!fill && !stroke && !text && !pathData) return;
    out.push({
      id: `e${++idSeq}`, type: 'shape', box, geom,
      adj: Object.keys(adj).length ? adj : undefined,
      path: pathData,
      fill: fill ?? undefined,
      stroke: stroke ?? undefined,
      text,
      link,
    });
  }

  function pictureFromBlip(blipFill: El, sc: ShapeCtx, box: Box, link: Link | undefined): ImageElement | null {
    const blip = kid(blipFill, 'blip');
    if (!blip) return null;
    // Préfère la version SVG (extension Office 2016) quand elle existe.
    const svgBlip = find(blip, 'svgBlip');
    const rid = attr(svgBlip, 'r:embed') ?? attr(blip, 'r:embed');
    const rel = rid ? sc.part.rels.get(rid) : undefined;
    if (!rel || rel.external) return null;
    const ext = rel.target.split('.').pop()?.toLowerCase() ?? '';
    if (!['png', 'jpg', 'jpeg', 'gif', 'svg', 'emf', 'wmf', 'bmp', 'tif', 'tiff'].includes(ext)) return null;
    const item = registerMedia(rel.target);
    const src = kid(blipFill, 'srcRect');
    const crop = src
      ? { l: (num(src, 'l') ?? 0) / 100000, t: (num(src, 't') ?? 0) / 100000, r: (num(src, 'r') ?? 0) / 100000, b: (num(src, 'b') ?? 0) / 100000 }
      : undefined;
    return {
      id: `e${++idSeq}`, type: 'image', box,
      src: item.outBase, // remplacé par le nom final après conversion
      crop: crop && (crop.l || crop.t || crop.r || crop.b) ? crop : undefined,
      vector: ext === 'emf' || ext === 'wmf',
      link,
    };
  }

  function convertPicture(pic: El, sc: ShapeCtx, tf: Tf, out: Element[]) {
    const chain = inheritance(pic, sc);
    const raw = readXfrm(pic, chain);
    if (!raw) return;
    const blipFill = kid(pic, 'blipFill');
    if (!blipFill) return;
    const img = pictureFromBlip(blipFill, sc, tf(raw), shapeLink(pic, sc));
    if (img) out.push(img);
  }

  function convertGraphicFrame(gf: El, sc: ShapeCtx, tf: Tf, out: Element[]) {
    const raw = readXfrm(gf, []);
    const tbl = find(gf, 'tbl');
    if (!raw || !tbl) {
      if (!tbl) warnings.push(`Objet non pris en charge (graphique natif ou SmartArt) sur ${sc.part.path}`);
      return;
    }
    const box = tf(raw);
    const cols = kids(kid(tbl, 'tblGrid'), 'gridCol').map((c) => emu(num(c, 'w')));
    const rows: TableElement['rows'] = [];
    for (const tr of kids(tbl, 'tr')) {
      const cells: TableCell[] = [];
      for (const tc of kids(tr, 'tc')) {
        const tcPr = kid(tc, 'tcPr');
        const txBody = kid(tc, 'txBody');
        const body = txBody ? parseTextBody(txBody, [parseListStyle(defaultTextStyle, sc.color)], [], sc.text) : undefined;
        const fill = readFill(tcPr, null, sc);
        const borders: TableCell['borders'] = {};
        for (const [k, n] of [['l', 'lnL'], ['r', 'lnR'], ['t', 'lnT'], ['b', 'lnB']] as const) {
          const ln = kid(tcPr, n);
          if (!ln || kid(ln, 'noFill')) continue;
          const c = resolveColor(kid(ln, 'solidFill'), sc.color);
          if (c) borders[k] = { color: c.hex, width: emu(num(ln, 'w') ?? 12700) };
        }
        const insets = {
          l: emu(num(tcPr, 'marL') ?? 91440), r: emu(num(tcPr, 'marR') ?? 91440),
          t: emu(num(tcPr, 'marT') ?? 45720), b: emu(num(tcPr, 'marB') ?? 45720),
        };
        const anchor = (attr(tcPr, 'anchor') as TextBody['anchor']) ?? 't';
        cells.push({
          text: body ? { ...body, insets, anchor } : { paragraphs: [], anchor, insets, wrap: true },
          fill: fill ?? undefined,
          gridSpan: num(tc, 'gridSpan'),
          rowSpan: num(tc, 'rowSpan'),
          merged: bool(tc, 'hMerge') || bool(tc, 'vMerge') || undefined,
          borders: Object.keys(borders).length ? borders : undefined,
        });
      }
      rows.push({ h: emu(num(tr, 'h')), cells });
    }
    out.push({ id: `e${++idSeq}`, type: 'table', box, cols, rows });
  }

  // --- Parcours des slides --------------------------------------------------------
  const slides: Slide[] = [];
  const layoutOf: Layout[] = [];
  for (let i = 0; i < visible.length; i++) {
    const part = await loadPart(visible[i].path);
    const layoutRel = [...part.rels.values()].find((r) => r.type === 'slideLayout');
    const layout = await loadLayout(layoutRel!.target);
    const sc = makeCtx(part, layout, 'slide', readOverride(part.root));
    const elements: Element[] = [];
    convertTree(kid(kid(part.root, 'cSld'), 'spTree')!, sc, identity, elements);
    slides.push({
      index: i,
      sourceNumber: visible[i].sourceNumber,
      kind: 'content',
      elements: elements.filter((e) => onSlide(e.box, size)),
    });
    layoutOf.push(layout);
  }

  /** Éléments du gabarit (layout) d'une slide, pour les pages construites sur le gabarit seul. */
  function layoutElements(layout: Layout): Element[] {
    const sc = makeCtx(layout.part, layout, 'layout');
    const out: Element[] = [];
    const tree = kid(kid(layout.part.root, 'cSld'), 'spTree')!;
    // Les placeholders du gabarit ne contiennent que des textes d'invite : on les ignore.
    const filtered = kids(tree).filter((n) => !placeholderOf(n));
    const tmp = parseXml('<r/>').documentElement as unknown as El;
    for (const n of filtered) tmp.appendChild(n.cloneNode(true));
    convertTree(tmp, sc, identity, out);
    return out.filter((e) => onSlide(e.box, size));
  }

  const masterTexts = textsOf(await (async () => {
    const m = layoutOf[0]?.master;
    if (!m) return [];
    const sc = makeCtx(m.part, layoutOf[0], 'master');
    const out: Element[] = [];
    const tree = kid(kid(m.part.root, 'cSld'), 'spTree')!;
    convertTree(tree, sc, identity, out);
    return out;
  })());

  const report = classify(slides, layoutOf.map((l) => ({ name: l.name, elements: () => layoutElements(l) })), size, masterTexts, warnings);
  return { report, media, zip, warnings };
}

function readOverride(root: El): ClrMap | undefined {
  const ov = path(root, 'clrMapOvr', 'overrideClrMapping');
  if (!ov) return undefined;
  const map: ClrMap = {};
  for (let i = 0; i < ov.attributes.length; i++) map[ov.attributes[i].name] = ov.attributes[i].value;
  return map;
}

function onSlide(b: Box, size: { w: number; h: number }): boolean {
  return b.x + b.w > 1 && b.y + b.h > 1 && b.x < size.w - 1 && b.y < size.h - 1;
}

/** Convertit une géométrie libre OOXML en chemins SVG. */
function customGeometry(cust: El): { d: string; w: number; h: number; filled: boolean }[] {
  const out: { d: string; w: number; h: number; filled: boolean }[] = [];
  for (const p of kids(kid(cust, 'pathLst'), 'path')) {
    const w = num(p, 'w') ?? 1;
    const h = num(p, 'h') ?? 1;
    let d = '';
    let cx = 0, cy = 0;
    const pt = (el: El | null) => [num(el, 'x') ?? 0, num(el, 'y') ?? 0] as const;
    for (const cmd of kids(p)) {
      const pts = kids(cmd, 'pt');
      switch (cmd.localName) {
        case 'moveTo': [cx, cy] = pt(pts[0]); d += `M${cx} ${cy}`; break;
        case 'lnTo': [cx, cy] = pt(pts[0]); d += `L${cx} ${cy}`; break;
        case 'cubicBezTo': {
          const [a, b, c] = pts.map(pt);
          d += `C${a[0]} ${a[1]} ${b[0]} ${b[1]} ${c[0]} ${c[1]}`;
          [cx, cy] = c;
          break;
        }
        case 'quadBezTo': {
          const [a, b] = pts.map(pt);
          d += `Q${a[0]} ${a[1]} ${b[0]} ${b[1]}`;
          [cx, cy] = b;
          break;
        }
        case 'arcTo': {
          const wR = num(cmd, 'wR') ?? 0, hR = num(cmd, 'hR') ?? 0;
          const st = ((num(cmd, 'stAng') ?? 0) / 60000) * (Math.PI / 180);
          const sw = ((num(cmd, 'swAng') ?? 0) / 60000) * (Math.PI / 180);
          const ox = cx - wR * Math.cos(st), oy = cy - hR * Math.sin(st);
          const ex = ox + wR * Math.cos(st + sw), ey = oy + hR * Math.sin(st + sw);
          d += `A${wR} ${hR} 0 ${Math.abs(sw) > Math.PI ? 1 : 0} ${sw > 0 ? 1 : 0} ${ex} ${ey}`;
          cx = ex; cy = ey;
          break;
        }
        case 'close': d += 'Z'; break;
      }
    }
    if (d) out.push({ d, w, h, filled: attr(p, 'fill') !== 'none' });
  }
  return out;
}

function plain(runs: Run[] | undefined): string {
  return (runs ?? []).map((r) => (r.br ? '\n' : r.text)).join('');
}

function shapeText(e: Element): string {
  if (e.type !== 'shape' || !e.text) return '';
  return e.text.paragraphs.map((p) => plain(p.runs)).join('\n').trim();
}

function textsOf(els: Element[]): { text: string; box: Box; el: Element }[] {
  return els.filter((e) => shapeText(e)).map((e) => ({ text: shapeText(e), box: e.box, el: e }));
}

/**
 * Déduit la nature de chaque slide (couverture, intercalaire, contenu…) à partir
 * du nom de son gabarit, et extrait les métadonnées du reporting.
 */
function classify(
  slides: Slide[],
  layouts: { name: string; elements: () => Element[] }[],
  size: { w: number; h: number },
  masterTexts: { text: string; box: Box }[],
  warnings: string[],
): ParsedPptx['report'] {
  const kindOf = (name: string): Slide['kind'] => {
    const n = name.toLowerCase();
    if (/garde|couverture|^title slide$|^diapositive de titre$/.test(n)) return 'cover';
    if (/derni[eè]re page|closing|^fin$/.test(n)) return 'closing';
    if (/intercalaire|section/.test(n) || n.trim() === 'annexes') return 'section';
    if (/sommaire/.test(n)) return 'toc';
    return 'content';
  };

  // Sections : libellés du bandeau de navigation présent dans les gabarits de contenu.
  let sections: string[] = [];
  const contentLayout = layouts.find((l) => /partie|annexe -/i.test(l.name));
  if (contentLayout) {
    const nav = textsOf(contentLayout.elements())
      .filter((t) => t.box.y < size.h * 0.1 && t.text.length < 40)
      .sort((a, b) => a.box.x - b.box.x);
    sections = nav.map((t) => t.text.replace(/\s+/g, ' ').trim());
  }
  if (!sections.length) sections = SECTION_FALLBACK;
  const sectionOfLayout = (name: string): number | undefined => {
    const m = /partie\s*(\d+)/i.exec(name);
    if (m) return Math.min(Number(m[1]) - 1, sections.length - 1);
    if (/annexe/i.test(name)) return sections.length - 1;
    return undefined;
  };

  const meta: Report['meta'] = { client: '', title: 'Reporting', period: '' };
  const footer = masterTexts.find((t) => t.box.y > size.h * 0.85 && t.text.includes('|'));
  if (footer) meta.footer = footer.text.replace(/\s+/g, ' ').trim();

  const sectionInfo = sections.map((label) => ({ label } as Report['sections'][number]));
  let currentSection: number | undefined;
  let dividerCount = 0;
  let inAppendix = false;
  const hasDividers = slides.some((s) => kindOf(layouts[s.index].name) === 'section');

  for (const slide of slides) {
    const layout = layouts[slide.index];
    let kind = kindOf(layout.name);
    const texts = textsOf(slide.elements);

    // Une slide de gabarit "sommaire" contenant un tableau est un glossaire.
    const layoutEls = kind === 'toc' || kind === 'closing' || kind === 'section' ? layout.elements() : [];
    if (kind === 'toc') {
      const titleText = textsOf(layoutEls).find((t) => /glossaire|sommaire/i.test(t.text))?.text ?? '';
      if (/glossaire/i.test(titleText) || layoutEls.some((e) => e.type === 'table')) kind = 'glossary';
    }
    slide.kind = kind;

    switch (kind) {
      case 'cover': {
        const sorted = [...texts].sort((a, b) => a.box.y - b.box.y);
        meta.client = sorted[0]?.text.replace(/\s+/g, ' ') ?? '';
        const lines = (sorted[1]?.text ?? '').split('\n').map((s) => s.trim()).filter(Boolean);
        meta.title = lines[0] ?? 'Reporting';
        meta.period = lines.length > 1 ? lines[lines.length - 1] : '';
        meta.version = sorted[2]?.text.replace(/\s+/g, ' ');
        slide.title = meta.client;
        slide.data = { contact: contactLine(layout.elements(), size) };
        slide.elements = [];
        break;
      }
      case 'glossary': {
        const table = layoutEls.find((e) => e.type === 'table') ?? slide.elements.find((e) => e.type === 'table');
        const rows: [string, string][] = [];
        if (table && table.type === 'table') {
          for (const r of table.rows) {
            const cells = r.cells.map((c) => c.text.paragraphs.map((p) => plain(p.runs)).join(' ').trim());
            if (cells[0] || cells[1]) rows.push([cells[0] ?? '', cells.slice(1).join(' ').trim()]);
          }
        }
        slide.title = textsOf(layoutEls).find((t) => /glossaire/i.test(t.text))?.text ?? 'Glossaire';
        slide.data = { rows };
        slide.elements = [];
        break;
      }
      case 'toc': {
        const entries = texts.sort((a, b) => a.box.y - b.box.y).map((t) => t.text.replace(/\s+/g, ' '));
        slide.title = textsOf(layoutEls).find((t) => /sommaire/i.test(t.text))?.text ?? 'Sommaire';
        slide.data = { entries };
        slide.elements = [];
        break;
      }
      case 'section': {
        const isAppendix = /annexe/i.test(layout.name);
        const title = texts.map((t) => t.text).join(' ').replace(/\s+/g, ' ').trim()
          || textsOf(layoutEls).map((t) => t.text).join(' ').trim();
        const idx = isAppendix ? sections.length - 1 : Math.min(dividerCount, sections.length - 1);
        dividerCount = isAppendix ? dividerCount : dividerCount + 1;
        currentSection = idx;
        slide.section = idx;
        slide.title = title;
        if (isAppendix) {
          slide.appendix = true;
          inAppendix = true;
        }
        if (sectionInfo[idx] && sectionInfo[idx].dividerSlide === undefined) sectionInfo[idx].dividerSlide = slide.index;
        slide.elements = [];
        break;
      }
      case 'closing': {
        const lt = textsOf(layoutEls);
        const tagline = lt.filter((t) => t.box.y < size.h * 0.3).sort((a, b) => b.text.length - a.text.length)[0];
        const services = lt
          .filter((t) => t.box.y > size.h * 0.3 && t.box.y < size.h * 0.85)
          .sort((a, b) => a.box.x - b.box.x)
          .map((t) => ({ text: t.text.replace(/\s+/g, ' ').trim(), color: firstColor(t.el) }));
        const taglineRuns = tagline && tagline.el.type === 'shape'
          ? tagline.el.text!.paragraphs.flatMap((p, i) => [...(i ? [{ text: '\n', size: 0 } as Run] : []), ...p.runs])
          : [];
        slide.data = { tagline: taglineRuns, services, contact: contactLine(layoutEls, size) };
        slide.elements = [];
        break;
      }
      case 'content': {
        // La section suit l'ordre des intercalaires ; le nom du gabarit ne sert
        // que si le document n'a pas d'intercalaires.
        slide.section = hasDividers ? currentSection : sectionOfLayout(layout.name);
        if (inAppendix || (!hasDividers && /annexe/i.test(layout.name))) slide.appendix = true;
        slide.elements = stripTemplateChrome(slide.elements, size);
        if (slide.section !== undefined && sectionInfo[slide.section] && sectionInfo[slide.section].firstSlide === undefined) {
          sectionInfo[slide.section].firstSlide = slide.index;
        }
        // Le titre est le premier texte du haut de la slide (placeholder de titre).
        const titleEl = slide.elements
          .filter((e) => e.type === 'shape' && e.text && e.box.y < size.h * 0.2 && e.box.h < size.h * 0.12 && !e.fill && !e.link)
          .sort((a, b) => a.box.y - b.box.y || b.box.w - a.box.w)[0];
        if (titleEl && titleEl.type === 'shape') {
          const runs = titleEl.text!.paragraphs.flatMap((p) => p.runs);
          if (plain(runs).trim().length > 2) {
            slide.titleRuns = runs;
            slide.title = plain(runs).replace(/\s+/g, ' ').trim();
            slide.elements = slide.elements.filter((e) => e !== titleEl);
          }
        }
        break;
      }
    }
  }

  if (!meta.client) warnings.push("Page de garde non détectée : nom du client vide.");
  return { meta, size, sections: sectionInfo, slides };
}

/**
 * Retire les éléments de gabarit recopiés sur les slides (bandeau de navigation,
 * barre verticale décorative, coin décoratif, puce de titre) : le viewer dessine
 * sa propre version modernisée. Les boutons cliquables (ex. « Retour ») sont gardés.
 */
function stripTemplateChrome(els: Element[], size: { w: number; h: number }): Element[] {
  return els.filter((e) => {
    const b = e.box;
    const isButton = e.type === 'shape' && !!e.link && !!e.fill;
    if (b.y + b.h <= size.h * 0.085 && !isButton) return false;
    if (b.x + b.w <= size.w * 0.075 && b.h > size.h * 0.5) return false;
    if (b.x >= size.w * 0.95 && b.y < size.h * 0.15) return false;
    if (e.type === 'shape' && !e.text && b.x < size.w * 0.13 && b.y > size.h * 0.07 && b.y < size.h * 0.17 && b.w < size.w * 0.035) return false;
    return true;
  });
}

function firstColor(e: Element): string | undefined {
  if (e.type !== 'shape') return undefined;
  return e.text?.paragraphs.flatMap((p) => p.runs).find((r) => r.text.trim())?.color;
}

function contactLine(els: Element[], size: { w: number; h: number }): string | undefined {
  return textsOf(els).find((t) => t.box.y > size.h * 0.85 && /rue|t[ée]l|www/i.test(t.text))?.text.replace(/\s+/g, ' ');
}
