import { OX } from '../brand.ts';

/**
 * Motif Oxigen : trois losanges superposés (orange, bleu, violet) dont les
 * intersections prennent les teintes rose, lavande et rose clair.
 * Centré en (cx, cy) sur le losange du milieu, r = demi-diagonale.
 */
export function OxigenDiamonds({ cx, cy, r, animated = false, className }: {
  cx: number;
  cy: number;
  r: number;
  animated?: boolean;
  className?: string;
}) {
  const step = r * (2 / 3);
  const d = (x: number, y: number, rr: number) => `M${x} ${y - rr}L${x + rr} ${y}L${x} ${y + rr}L${x - rr} ${y}Z`;
  const shapes = [
    { d: d(cx, cy - step, r), fill: OX.orange },
    { d: d(cx, cy + step, r), fill: OX.violet },
    { d: d(cx, cy, r), fill: OX.blue },
    { d: d(cx, cy - step / 2, r - step / 2), fill: OX.pink },
    { d: d(cx, cy + step / 2, r - step / 2), fill: OX.lavender },
    { d: d(cx, cy, r - step), fill: OX.pinkLight },
  ];
  return (
    <g className={className}>
      {shapes.map((s, i) => (
        <path
          key={i}
          d={s.d}
          fill={s.fill}
          className={animated ? 'ox-diamond' : undefined}
          style={animated ? ({ '--i': i } as React.CSSProperties) : undefined}
        />
      ))}
    </g>
  );
}

/** Petit logo Oxigen (losanges) pour les en-têtes et le favicon. */
export function OxigenMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size * 0.6} height={size} viewBox="0 0 60 100" aria-hidden>
      <OxigenDiamonds cx={30} cy={50} r={30} />
    </svg>
  );
}

export function OxigenLogo({ height = 28, light = false }: { height?: number; light?: boolean }) {
  return (
    <span className="ox-logo" style={{ height }}>
      <OxigenMark size={height} />
      <span className="ox-logo-word" style={{ fontSize: height * 0.62, color: light ? '#fff' : OX.violet }}>
        oxigen
      </span>
    </span>
  );
}
