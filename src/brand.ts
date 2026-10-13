/** Charte Oxigen : couleurs reprises du logo et des gabarits Oxigen. */
export const OX = {
  violet: '#392872',
  navy: '#1B1C53',
  orange: '#FF6600',
  lavender: '#727CCF',
  blue: '#4A65A9',
  pink: '#FBA4AF',
  pinkLight: '#F9AFD3',
  ink: '#231F4A',
  muted: '#6F6B8F',
  line: '#E6E3F1',
  positive: '#13A06F',
  negative: '#E0454B',
} as const;

/** Couleur associée à chaque section (ordre du sommaire Oxigen). */
export const SECTION_COLORS = [OX.orange, OX.pink, OX.lavender, OX.violet, OX.blue, OX.navy];
export const sectionColor = (i: number | undefined) => (i === undefined ? OX.violet : SECTION_COLORS[i % SECTION_COLORS.length]);

/**
 * Modernisation : les bleus Office des documents d'origine sont remplacés par
 * les couleurs Oxigen ; les verts / rouges d'écart sont harmonisés.
 */
const REMAP: Record<string, string> = {
  '4168AB': OX.violet,
  '5376B3': OX.violet,
  '4A7EBB': OX.violet,
  '4F81BD': OX.violet,
  '1F497D': OX.violet,
  '2F5597': OX.violet,
  '4472C4': OX.violet,
  '0070C0': OX.violet,
  '3366CC': OX.violet,
  '002060': OX.navy,
  '1B1C53': OX.navy,
  '0C0F55': OX.navy,
  'BFCDE7': '#D9D6EE',
  'DAE3F3': '#ECEAF6',
  '00B050': OX.positive,
  '1CAA6A': OX.positive,
  '00B04F': OX.positive,
  '92D050': '#7CC68D',
  'C00000': OX.negative,
  'DF3737': OX.negative,
  'FF0000': OX.negative,
  'FBA1AC': OX.pink,
  '727CCF': OX.lavender,
  '392872': OX.violet,
  '000000': OX.ink,
  '404040': OX.ink,
  '595959': '#4E4A6B',
  '7F7F7F': OX.muted,
};

export function color(hex: string | undefined, fallback: string = OX.ink): string {
  if (!hex) return fallback;
  const h = hex.replace('#', '').toUpperCase();
  return REMAP[h] ?? `#${h}`;
}

export function rgba(hex: string, alpha = 1): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return alpha >= 1 ? `#${h}` : `rgba(${r},${g},${b},${alpha})`;
}

export function isGreen(hex: string | undefined): boolean {
  if (!hex) return false;
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return g > 120 && g > r * 1.3 && g > b * 1.1;
}

export function isRed(hex: string | undefined): boolean {
  if (!hex) return false;
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return r > 150 && r > g * 1.8 && r > b * 1.5;
}

/** Polices : Arimo a les mêmes métriques qu'Arial, ce qui préserve la mise en page d'origine. */
export function fontFamily(font: string | undefined): string {
  if (font && /lato/i.test(font)) return "'Lato', 'Arimo', sans-serif";
  if (font && /narrow/i.test(font)) return "'Arial Narrow', 'Arimo', sans-serif";
  return "'Arimo', 'Arial', sans-serif";
}

export function fontWeight(font: string | undefined, bold: boolean | undefined): number {
  if (bold) return 700;
  if (font && /light/i.test(font)) return 300;
  return 400;
}
