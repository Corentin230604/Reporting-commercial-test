import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { Link, Paragraph, Run, Spacing, TextBody } from '../../shared/model.ts';
import { color, fontFamily, fontWeight, isGreen, isRed, OX } from '../brand.ts';
import { useSlideCtx } from './context.ts';

const LINE = 1.17; // interligne "simple" PowerPoint pour Arial / Arimo

function spacingPx(s: Spacing | undefined, size: number): number {
  if (!s) return 0;
  return 'pts' in s ? s.pts : s.pct * size * LINE;
}

export function TextBlock({ body, slideNumber, baseDelay = 0 }: { body: TextBody; slideNumber?: number; baseDelay?: number }) {
  const scale = body.fontScale ?? 1;
  const lineRed = body.lineReduction ?? 0;
  const justify = body.anchor === 'ctr' ? 'center' : body.anchor === 'b' ? 'flex-end' : 'flex-start';
  return (
    <div
      className="tx"
      style={{
        padding: `${body.insets.t}px ${body.insets.r}px ${body.insets.b}px ${body.insets.l}px`,
        justifyContent: justify,
        whiteSpace: body.wrap ? undefined : 'nowrap',
      }}
    >
      {body.paragraphs.map((p, i) => (
        <Para key={i} p={p} scale={scale} lineRed={lineRed} slideNumber={slideNumber} first={i === 0} delay={baseDelay + i * 40} />
      ))}
    </div>
  );
}

function Para({ p, scale, lineRed, slideNumber, first, delay }: {
  p: Paragraph;
  scale: number;
  lineRed: number;
  slideNumber?: number;
  first: boolean;
  delay: number;
}) {
  const visibleRuns = p.runs.filter((r) => r.text || r.br);
  const empty = !visibleRuns.some((r) => r.text.trim());
  const sized = visibleRuns.filter((r) => r.text);
  const maxSize = (empty || !sized.length ? p.endSize : Math.max(...sized.map((r) => r.size))) * scale;
  let lineHeight: string;
  if (p.lineSpacing && 'pts' in p.lineSpacing) lineHeight = `${p.lineSpacing.pts * scale}px`;
  else lineHeight = String(((p.lineSpacing && 'pct' in p.lineSpacing ? p.lineSpacing.pct : 1) - lineRed) * LINE);

  const style: CSSProperties = {
    textAlign: p.align === 'ctr' ? 'center' : p.align === 'r' ? 'right' : p.align === 'just' ? 'justify' : 'left',
    paddingLeft: p.marL,
    textIndent: p.bullet ? 0 : p.indent,
    lineHeight,
    marginTop: first ? 0 : spacingPx(p.spaceBefore, maxSize),
    marginBottom: spacingPx(p.spaceAfter, maxSize),
    fontSize: maxSize,
    ['--d' as string]: `${delay}ms`,
  };

  if (empty) {
    return <div className="tx-p" style={{ ...style, fontSize: p.endSize * scale }}>{' '}</div>;
  }

  const bulletWidth = Math.max(-p.indent, 0);
  return (
    <div className="tx-p" style={style}>
      {p.bullet && (
        <span
          className="tx-bullet"
          style={{
            marginLeft: p.indent,
            width: bulletWidth || '1.1em',
            color: color(p.bullet.color, OX.violet),
            fontSize: (visibleRuns[0]?.size ?? 12) * scale * (p.bullet.sizePct ?? 1),
          }}
        >
          <BulletGlyph char={p.bullet.autoNum ?? p.bullet.char ?? '•'} />
        </span>
      )}
      {visibleRuns.map((r, i) => (
        <RunSpan key={i} run={r} scale={scale} slideNumber={slideNumber} />
      ))}
    </div>
  );
}

function BulletGlyph({ char }: { char: string }) {
  if (char === '⬆' || char === '↑') return <Arrow dir="up" />;
  if (char === '⬇' || char === '↓') return <Arrow dir="down" />;
  if (char === '➢' || char === '»' || char === '➔') return <span className="tx-chev">›</span>;
  if (char === '◆' || char === '❖' || char === '▪' || char === '■' || char === '§') return <span className="tx-dot" />;
  return <>{char}</>;
}

export function Arrow({ dir, size = '0.78em' }: { dir: 'up' | 'down'; size?: string }) {
  return (
    <svg className="tx-arrow" width={size} height={size} viewBox="0 0 10 10" aria-label={dir === 'up' ? 'hausse' : 'baisse'}>
      <path d={dir === 'up' ? 'M5 0.6L9.6 8.8H0.4Z' : 'M5 9.4L9.6 1.2H0.4Z'} fill="currentColor" />
    </svg>
  );
}

function RunSpan({ run, scale, slideNumber }: { run: Run; scale: number; slideNumber?: number }) {
  const { navigate } = useSlideCtx();
  if (run.br) return <br />;
  const c = color(run.color);
  const style: CSSProperties = {
    fontSize: run.size * scale,
    fontFamily: fontFamily(run.font),
    fontWeight: fontWeight(run.font, run.bold),
    fontStyle: run.italic ? 'italic' : undefined,
    textDecoration: [run.underline && 'underline', run.strike && 'line-through'].filter(Boolean).join(' ') || undefined,
    color: c,
    background: run.highlight ? `#${run.highlight}` : undefined,
    verticalAlign: run.baseline ? (run.baseline > 0 ? 'super' : 'sub') : undefined,
  };
  const content = decorate(run.text.replace('{{slide}}', String(slideNumber ?? '')), run.size * scale);
  if (run.link) {
    return (
      <span className="tx-link" style={style} onClick={(e) => { e.stopPropagation(); navigate(run.link as Link); }}>
        {content}
      </span>
    );
  }
  return <span style={style}>{content}</span>;
}

const NUMBER_RE = /([+\-–]?\s?)(\d{1,3}(?:[\s  ]\d{3})+|\d+)(,\d+)?/g;

/**
 * Remplace les triangles ▲▼ par des flèches nettes et anime les grands chiffres
 * (compteur qui défile jusqu'à la valeur finale).
 */
function decorate(text: string, size: number): ReactNode {
  const parts: ReactNode[] = [];
  const re = /[▲▼△▽⬆⬇]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(numbers(text.slice(last, m.index), size, parts.length));
    parts.push(<Arrow key={`a${m.index}`} dir={m[0] === '▲' || m[0] === '△' || m[0] === '⬆' ? 'up' : 'down'} />);
    last = m.index + 1;
  }
  if (last < text.length) parts.push(numbers(text.slice(last), size, parts.length));
  return parts.length === 1 ? parts[0] : parts;
}

function numbers(text: string, size: number, key: number): ReactNode {
  // Seuls les chiffres mis en avant (grande taille) sont animés.
  if (size < 15 || !/\d/.test(text)) return <span key={key}>{text}</span>;
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(NUMBER_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push(text.slice(last, idx));
    out.push(m[1]);
    out.push(<CountUp key={idx} value={m[2] + (m[3] ?? '')} />);
    last = idx + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <span key={key}>{out}</span>;
}

/** Compteur animé : conserve le format français (espaces des milliers, virgule). */
function CountUp({ value }: { value: string }) {
  const { playing, animate } = useSlideCtx();
  const digits = value.replace(/[\s  ]/g, '');
  const target = Number(digits.replace(',', '.'));
  const decimals = digits.includes(',') ? digits.split(',')[1].length : 0;
  const grouped = /[\s  ]/.test(value);
  const [shown, setShown] = useState(animate ? 0 : target);
  const ref = useRef<number>();

  useEffect(() => {
    if (!animate) {
      setShown(target);
      return;
    }
    if (!playing) {
      setShown(0);
      return;
    }
    const start = performance.now() + 250;
    const dur = 1100;
    const tick = (t: number) => {
      const k = Math.min(1, Math.max(0, (t - start) / dur));
      const eased = 1 - Math.pow(1 - k, 3);
      setShown(target * eased);
      if (k < 1) ref.current = requestAnimationFrame(tick);
    };
    ref.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(ref.current!);
  }, [playing, animate, target]);

  let s = shown.toFixed(decimals).replace('.', ',');
  if (grouped || target >= 10000) {
    const [int, dec] = s.split(',');
    s = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (dec ? `,${dec}` : '');
  }
  return <span className="tx-num">{s}</span>;
}

/** Couleur dominante d'un texte (pour colorer les badges d'écart). */
export function toneOf(body: TextBody | undefined): 'pos' | 'neg' | undefined {
  const run = body?.paragraphs.flatMap((p) => p.runs).find((r) => r.text.trim());
  if (!run) return undefined;
  if (isGreen(run.color)) return 'pos';
  if (isRed(run.color)) return 'neg';
  return undefined;
}
