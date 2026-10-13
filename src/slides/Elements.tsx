import type { CSSProperties } from 'react';
import type { Box, Element, Fill, ImageElement, LineElement, ShapeElement, Stroke, TableElement } from '../../shared/model.ts';
import { color, rgba } from '../brand.ts';
import { InlineSvg } from '../components/InlineSvg.tsx';
import { useSlideCtx } from './context.ts';
import { DASHES, presetPath } from './geometry.ts';
import { TextBlock, toneOf } from './Text.tsx';

/**
 * Position d'un élément. Rotation et symétries passent par les propriétés CSS
 * `rotate` / `scale`, indépendantes de `transform` utilisé par les animations.
 */
function boxStyle(b: Box, delay: number): CSSProperties {
  return {
    left: b.x,
    top: b.y,
    width: b.w,
    height: b.h,
    rotate: b.rot ? `${b.rot}deg` : undefined,
    scale: b.flipH || b.flipV ? `${b.flipH ? -1 : 1} ${b.flipV ? -1 : 1}` : undefined,
    ['--d' as string]: `${delay}ms`,
  };
}

function fillPaint(fill: Fill | undefined, id: string): { paint: string; defs?: JSX.Element } {
  if (!fill) return { paint: 'none' };
  if (fill.kind === 'solid') return { paint: rgba(color(fill.color), fill.alpha ?? 1) };
  const stops = fill.stops ?? [];
  const ang = ((fill.angle ?? 90) * Math.PI) / 180;
  const x = Math.cos(ang) / 2, y = Math.sin(ang) / 2;
  return {
    paint: `url(#g-${id})`,
    defs: (
      <linearGradient id={`g-${id}`} x1={0.5 - x} y1={0.5 - y} x2={0.5 + x} y2={0.5 + y}>
        {stops.map((s, i) => (
          <stop key={i} offset={s.pos} stopColor={color(s.color)} stopOpacity={s.alpha ?? 1} />
        ))}
      </linearGradient>
    ),
  };
}

function dash(stroke: Stroke | undefined): string | undefined {
  if (!stroke?.dash) return undefined;
  return DASHES[stroke.dash]?.(Math.max(stroke.width, 0.75));
}

export function ShapeView({ el, delay }: { el: ShapeElement; delay: number }) {
  const { navigate } = useSlideCtx();
  const { w, h } = el.box;
  const { paint, defs } = fillPaint(el.fill, el.id);
  const sw = el.stroke?.width ?? 0;
  const hasGeometry = !!el.fill || !!el.stroke;
  const tone = toneOf(el.text);
  const shortText = el.text && el.text.paragraphs.length <= 2
    && el.text.paragraphs.map((p) => p.runs.map((r) => r.text).join('')).join('').length < 24;
  const isBadge = !hasGeometry && shortText && tone;
  const isCard = hasGeometry && w * h > 4000;
  const cls = [
    'el',
    isCard ? 'a-card' : hasGeometry ? 'a-pop' : isBadge ? 'a-pop' : 'a-text',
    el.link ? 'is-link' : '',
    isCard && el.fill && /roundRect|round2SameRect/.test(el.geom) ? 'soft-shadow' : '',
  ].join(' ');

  return (
    <div
      className={cls}
      style={boxStyle(el.box, delay)}
      onClick={el.link ? () => navigate(el.link!) : undefined}
    >
      {hasGeometry && (
        <svg className="el-geom" width={w} height={h} viewBox={`${-sw / 2} ${-sw / 2} ${w + sw} ${h + sw}`} style={{ left: -sw / 2, top: -sw / 2, width: w + sw, height: h + sw }}>
          {defs && <defs>{defs}</defs>}
          {el.path ? (
            el.path.map((p, i) => (
              <path
                key={i}
                d={p.d}
                transform={`scale(${w / (p.w || 1)} ${h / (p.h || 1)})`}
                fill={p.filled ? paint : 'none'}
                stroke={el.stroke ? rgba(color(el.stroke.color), el.stroke.alpha ?? 1) : 'none'}
                strokeWidth={sw}
                strokeDasharray={dash(el.stroke)}
                vectorEffect="non-scaling-stroke"
              />
            ))
          ) : (
            <path
              d={presetPath(el.geom, w, h, el.adj)}
              fill={paint}
              stroke={el.stroke ? rgba(color(el.stroke.color), el.stroke.alpha ?? 1) : 'none'}
              strokeWidth={sw}
              strokeDasharray={dash(el.stroke)}
            />
          )}
        </svg>
      )}
      {el.text && <TextBlock body={el.text} baseDelay={delay} />}
    </div>
  );
}

export function ImageView({ el, delay, appendix }: { el: ImageElement; delay: number; appendix?: boolean }) {
  const { file, navigate, zoom } = useSlideCtx();
  const src = file(el.src);
  const c = el.crop;
  const zoomable = !el.link && el.vector && zoom && (appendix || el.box.w * el.box.h > 60000);
  const onClick = el.link ? () => navigate(el.link!) : zoomable ? () => zoom!(src) : undefined;
  const imgStyle: CSSProperties = c
    ? {
        position: 'absolute',
        width: `${100 / (1 - c.l - c.r)}%`,
        height: `${100 / (1 - c.t - c.b)}%`,
        left: `${(-c.l / (1 - c.l - c.r)) * 100}%`,
        top: `${(-c.t / (1 - c.t - c.b)) * 100}%`,
      }
    : { width: '100%', height: '100%' };
  return (
    <div
      className={`el a-img ${el.vector ? 'is-chart' : ''} ${onClick ? 'is-link' : ''} ${zoomable ? 'is-zoomable' : ''}`}
      style={{ ...boxStyle(el.box, delay), overflow: c ? 'hidden' : undefined }}
      onClick={onClick}
      title={zoomable ? 'Cliquer pour agrandir' : undefined}
    >
      {el.vector && el.src.endsWith('.svg') ? (
        <InlineSvg src={src} style={imgStyle} />
      ) : (
        <img src={src} alt="" draggable={false} style={imgStyle} loading="eager" />
      )}
    </div>
  );
}

export function LineView({ el, delay }: { el: LineElement; delay: number }) {
  const pad = Math.max(el.stroke.width * 4, 6);
  const minX = Math.min(el.x1, el.x2) - pad, minY = Math.min(el.y1, el.y2) - pad;
  const w = Math.abs(el.x2 - el.x1) + pad * 2, h = Math.abs(el.y2 - el.y1) + pad * 2;
  const stroke = rgba(color(el.stroke.color), el.stroke.alpha ?? 1);
  const markerId = `mk-${el.id}`;
  const len = Math.hypot(el.x2 - el.x1, el.y2 - el.y1);
  return (
    <svg
      className="el a-line"
      style={{ left: minX, top: minY, width: w, height: h, ['--d' as string]: `${delay}ms`, ['--len' as string]: len }}
      viewBox={`${minX} ${minY} ${w} ${h}`}
    >
      {(el.headEnd || el.tailEnd) && (
        <defs>
          <marker id={markerId} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M0 0L10 5L0 10Z" fill={stroke} />
          </marker>
        </defs>
      )}
      <line
        x1={el.x1}
        y1={el.y1}
        x2={el.x2}
        y2={el.y2}
        stroke={stroke}
        strokeWidth={el.stroke.width}
        strokeDasharray={dash(el.stroke)}
        strokeLinecap="round"
        markerStart={el.headEnd ? `url(#${markerId})` : undefined}
        markerEnd={el.tailEnd ? `url(#${markerId})` : undefined}
      />
    </svg>
  );
}

export function TableView({ el, delay }: { el: TableElement; delay: number }) {
  const border = (s: Stroke | undefined) => (s ? `${s.width}px solid ${color(s.color)}` : undefined);
  return (
    <div className="el a-card" style={boxStyle(el.box, delay)}>
      <table className="el-table">
        <colgroup>
          {el.cols.map((w, i) => <col key={i} style={{ width: w }} />)}
        </colgroup>
        <tbody>
          {el.rows.map((r, ri) => (
            <tr key={ri} style={{ height: r.h }}>
              {r.cells.map((c, ci) =>
                c.merged ? null : (
                  <td
                    key={ci}
                    colSpan={c.gridSpan}
                    rowSpan={c.rowSpan}
                    style={{
                      background: c.fill?.kind === 'solid' ? color(c.fill.color) : undefined,
                      borderLeft: border(c.borders?.l),
                      borderRight: border(c.borders?.r),
                      borderTop: border(c.borders?.t),
                      borderBottom: border(c.borders?.b),
                    }}
                  >
                    <TextBlock body={c.text} baseDelay={delay} />
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ElementView({ el, delay, appendix }: { el: Element; delay: number; appendix?: boolean }) {
  switch (el.type) {
    case 'shape':
      return <ShapeView el={el} delay={delay} />;
    case 'image':
      return <ImageView el={el} delay={delay} appendix={appendix} />;
    case 'line':
      return <LineView el={el} delay={delay} />;
    case 'table':
      return <TableView el={el} delay={delay} />;
  }
}

/**
 * Chorégraphie d'entrée : les éléments apparaissent dans l'ordre de lecture
 * (de haut en bas, puis de gauche à droite), les conteneurs avant leur contenu.
 */
export function entranceDelays(els: Element[], slideH: number): Map<string, number> {
  const band = slideH * 0.05;
  const order = [...els].sort((a, b) => {
    const ra = Math.round(a.box.y / band), rb = Math.round(b.box.y / band);
    if (ra !== rb) return ra - rb;
    const area = (e: Element) => e.box.w * e.box.h;
    if (a.type === 'shape' && b.type === 'shape' && contains(a.box, b.box)) return -1;
    if (a.type === 'shape' && b.type === 'shape' && contains(b.box, a.box)) return 1;
    return a.box.x - b.box.x || area(b) - area(a);
  });
  const delays = new Map<string, number>();
  const step = Math.min(55, 1500 / Math.max(order.length, 1));
  order.forEach((e, i) => delays.set(e.id, 180 + i * step));
  return delays;
}

function contains(a: Box, b: Box): boolean {
  return a.x <= b.x + 1 && a.y <= b.y + 1 && a.x + a.w >= b.x + b.w - 1 && a.y + a.h >= b.y + b.h - 1;
}
