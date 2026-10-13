/** Chemins SVG des formes prédéfinies PowerPoint les plus courantes. */
export function presetPath(geom: string, w: number, h: number, adj: Record<string, number> = {}): string {
  const ss = Math.min(w, h);
  const a = (name: string, def: number) => (adj[name] ?? adj[name === 'adj1' ? 'adj' : name] ?? def) / 100000;
  const rectP = `M0 0H${w}V${h}H0Z`;
  switch (geom) {
    case 'rect':
    case 'flowChartProcess':
    case 'textBox':
      return rectP;
    case 'roundRect': {
      const r = Math.min(a('adj', 16667) * ss, ss / 2);
      return roundedRect(w, h, r, r, r, r);
    }
    case 'round2SameRect': {
      const r1 = Math.min(a('adj1', 16667) * ss, ss / 2);
      const r2 = Math.min(a('adj2', 0) * ss, ss / 2);
      return roundedRect(w, h, r1, r1, r2, r2);
    }
    case 'round1Rect': {
      const r = Math.min(a('adj', 16667) * ss, ss / 2);
      return roundedRect(w, h, 0, r, 0, 0);
    }
    case 'snip1Rect': {
      const s = a('adj', 16667) * ss;
      return `M0 0H${w - s}L${w} ${s}V${h}H0Z`;
    }
    case 'ellipse':
    case 'flowChartConnector':
      return `M${w / 2} 0A${w / 2} ${h / 2} 0 1 1 ${w / 2} ${h}A${w / 2} ${h / 2} 0 1 1 ${w / 2} 0Z`;
    case 'diamond':
    case 'flowChartDecision':
      return `M${w / 2} 0L${w} ${h / 2}L${w / 2} ${h}L0 ${h / 2}Z`;
    case 'triangle': {
      const x = a('adj', 50000) * w;
      return `M${x} 0L${w} ${h}H0Z`;
    }
    case 'rtTriangle':
      return `M0 0L${w} ${h}H0Z`;
    case 'rightArrow': {
      const t = a('adj1', 50000) * h;
      const head = a('adj2', 50000) * ss;
      const y1 = (h - t) / 2;
      return `M0 ${y1}H${w - head}V0L${w} ${h / 2}L${w - head} ${h}V${y1 + t}H0Z`;
    }
    case 'leftArrow': {
      const t = a('adj1', 50000) * h;
      const head = a('adj2', 50000) * ss;
      const y1 = (h - t) / 2;
      return `M${w} ${y1}H${head}V0L0 ${h / 2}L${head} ${h}V${y1 + t}H${w}Z`;
    }
    case 'upArrow': {
      const t = a('adj1', 50000) * w;
      const head = a('adj2', 50000) * ss;
      const x1 = (w - t) / 2;
      return `M${x1} ${h}V${head}H0L${w / 2} 0L${w} ${head}H${x1 + t}V${h}Z`;
    }
    case 'downArrow': {
      const t = a('adj1', 50000) * w;
      const head = a('adj2', 50000) * ss;
      const x1 = (w - t) / 2;
      return `M${x1} 0V${h - head}H0L${w / 2} ${h}L${w} ${h - head}H${x1 + t}V0Z`;
    }
    case 'chevron': {
      const d = a('adj', 50000) * ss;
      return `M0 0H${w - d}L${w} ${h / 2}L${w - d} ${h}H0L${d} ${h / 2}Z`;
    }
    case 'homePlate': {
      const d = a('adj', 50000) * ss;
      return `M0 0H${w - d}L${w} ${h / 2}L${w - d} ${h}H0Z`;
    }
    case 'corner': {
      // Forme en L : bras vertical à gauche, bras horizontal en bas.
      const t1 = a('adj1', 50000) * ss;
      const t2 = a('adj2', 50000) * ss;
      return `M0 0H${t2}V${h - t1}H${w}V${h}H0Z`;
    }
    case 'parallelogram': {
      const d = a('adj', 25000) * ss;
      return `M${d} 0H${w}L${w - d} ${h}H0Z`;
    }
    case 'trapezoid': {
      const d = a('adj', 25000) * ss;
      return `M${d} 0H${w - d}L${w} ${h}H0Z`;
    }
    case 'pentagon':
      return `M${w / 2} 0L${w} ${h * 0.38}L${w * 0.81} ${h}H${w * 0.19}L0 ${h * 0.38}Z`;
    case 'hexagon': {
      const d = a('adj', 25000) * ss;
      return `M${d} 0H${w - d}L${w} ${h / 2}L${w - d} ${h}H${d}L0 ${h / 2}Z`;
    }
    case 'plus': {
      const d = a('adj', 25000) * ss;
      return `M${d} 0H${w - d}V${d}H${w}V${h - d}H${w - d}V${h}H${d}V${h - d}H0V${d}H${d}Z`;
    }
    default:
      return rectP;
  }
}

function roundedRect(w: number, h: number, tl: number, tr: number, br: number, bl: number): string {
  return [
    `M${tl} 0`,
    `H${w - tr}`,
    tr ? `A${tr} ${tr} 0 0 1 ${w} ${tr}` : '',
    `V${h - br}`,
    br ? `A${br} ${br} 0 0 1 ${w - br} ${h}` : '',
    `H${bl}`,
    bl ? `A${bl} ${bl} 0 0 1 0 ${h - bl}` : '',
    `V${tl}`,
    tl ? `A${tl} ${tl} 0 0 1 ${tl} 0` : '',
    'Z',
  ].join('');
}

export const DASHES: Record<string, (w: number) => string> = {
  dash: (w) => `${4 * w} ${3 * w}`,
  sysDash: (w) => `${3 * w} ${w}`,
  dot: (w) => `${w} ${2 * w}`,
  sysDot: (w) => `${w} ${w}`,
  lgDash: (w) => `${8 * w} ${3 * w}`,
  dashDot: (w) => `${4 * w} ${3 * w} ${w} ${3 * w}`,
  lgDashDot: (w) => `${8 * w} ${3 * w} ${w} ${3 * w}`,
  sysDashDot: (w) => `${3 * w} ${w} ${w} ${w}`,
};
