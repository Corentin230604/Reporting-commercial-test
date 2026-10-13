/**
 * Modèle d'un reporting, indépendant de sa source.
 *
 * Aujourd'hui il est produit par l'import d'un .pptx finalisé ; demain il pourra
 * être produit directement par l'automatisation (Excel -> calculs -> slides).
 * Le viewer ne connaît que ce modèle.
 *
 * Unités : toutes les positions et tailles sont en points (1 pt = 1/72 pouce),
 * dans le repère de la slide (origine en haut à gauche).
 */

export interface Report {
  id: string;
  createdAt: string;
  source: { kind: 'pptx'; fileName: string } | { kind: 'auto' };
  meta: ReportMeta;
  /** Taille de slide en points (A4 paysage = 841.9 x 595.3). */
  size: { w: number; h: number };
  /** Sections du bandeau de navigation (ex. Points clés, CA Volumes et Marge…). */
  sections: Section[];
  slides: Slide[];
}

export interface ReportMeta {
  client: string;
  title: string;
  period: string;
  version?: string;
  footer?: string;
  /** Chemin (relatif au dossier du reporting) du logo client. */
  clientLogo?: string;
}

export interface Section {
  label: string;
  /** Index de la slide intercalaire de la section, si elle existe. */
  dividerSlide?: number;
  /** Première slide de contenu de la section. */
  firstSlide?: number;
}

export type SlideKind =
  | 'cover'
  | 'toc'
  | 'glossary'
  | 'section'
  | 'content'
  | 'closing';

export interface Slide {
  /** Index 0-based dans le reporting (slides masquées exclues). */
  index: number;
  /** Numéro de page d'origine (1-based) dans le fichier source. */
  sourceNumber: number;
  kind: SlideKind;
  /** Section à laquelle la slide appartient (index dans Report.sections). */
  section?: number;
  /** Titre en texte brut (pour la navigation et le sommaire). */
  title?: string;
  /** Titre riche (gras + léger), affiché dans l'en-tête des slides de contenu. */
  titleRuns?: Run[];
  /** Est-ce une annexe ? */
  appendix?: boolean;
  elements: Element[];
  /** Données spécifiques aux gabarits (couverture, sommaire, glossaire…). */
  data?: Record<string, unknown>;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Rotation en degrés. */
  rot?: number;
  flipH?: boolean;
  flipV?: boolean;
}

export interface Fill {
  kind: 'solid' | 'gradient';
  color?: string;
  alpha?: number;
  /** Pour un dégradé : arrêts (pos 0..1) et angle en degrés. */
  stops?: { pos: number; color: string; alpha?: number }[];
  angle?: number;
}

export interface Stroke {
  color: string;
  alpha?: number;
  width: number;
  dash?: string;
}

export type Link = { slide: number } | { url: string };

export interface BaseElement {
  id: string;
  box: Box;
  link?: Link;
}

export interface ShapeElement extends BaseElement {
  type: 'shape';
  /** Géométrie prédéfinie PowerPoint (rect, roundRect, ellipse…) ou 'custom'. */
  geom: string;
  /** Ajustements de la géométrie (adj, adj1…), valeurs brutes OOXML. */
  adj?: Record<string, number>;
  /** Chemin SVG pour les géométries libres, dans un viewBox de pathW x pathH. */
  path?: { d: string; w: number; h: number; filled: boolean }[];
  fill?: Fill;
  stroke?: Stroke;
  text?: TextBody;
}

export interface ImageElement extends BaseElement {
  type: 'image';
  src: string;
  /** Recadrage en fraction (0..1) de chaque bord. */
  crop?: { l: number; t: number; r: number; b: number };
  /** Image vectorielle issue d'un graphique ou tableau Excel (EMF). */
  vector?: boolean;
}

export interface LineElement extends BaseElement {
  type: 'line';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stroke: Stroke;
  headEnd?: string;
  tailEnd?: string;
}

export interface TableCell {
  text: TextBody;
  fill?: Fill;
  gridSpan?: number;
  rowSpan?: number;
  /** Cellule absorbée par une fusion (non rendue). */
  merged?: boolean;
  borders?: { l?: Stroke; r?: Stroke; t?: Stroke; b?: Stroke };
}

export interface TableElement extends BaseElement {
  type: 'table';
  cols: number[];
  rows: { h: number; cells: TableCell[] }[];
}

export type Element = ShapeElement | ImageElement | LineElement | TableElement;

export interface TextBody {
  paragraphs: Paragraph[];
  anchor: 't' | 'ctr' | 'b';
  insets: { l: number; t: number; r: number; b: number };
  wrap: boolean;
  /** Coefficient appliqué aux tailles de police (autofit PowerPoint). */
  fontScale?: number;
  lineReduction?: number;
}

export interface Paragraph {
  level: number;
  align: 'l' | 'ctr' | 'r' | 'just';
  marL: number;
  indent: number;
  spaceBefore?: Spacing;
  spaceAfter?: Spacing;
  lineSpacing?: Spacing;
  bullet?: Bullet;
  runs: Run[];
  /** Taille de police pour un paragraphe vide (hauteur de ligne). */
  endSize: number;
}

export type Spacing = { pct: number } | { pts: number };

export interface Bullet {
  char?: string;
  autoNum?: string;
  color?: string;
  sizePct?: number;
}

export interface Run {
  text: string;
  size: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  color?: string;
  highlight?: string;
  font?: string;
  baseline?: number;
  link?: Link;
  /** Retour à la ligne forcé (<a:br/>). */
  br?: boolean;
}

export interface ReportSummary {
  id: string;
  createdAt: string;
  client: string;
  title: string;
  period: string;
  slideCount: number;
  fileName?: string;
}
