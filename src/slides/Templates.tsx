import type { CSSProperties } from 'react';
import type { Report, Run, Slide } from '../../shared/model.ts';
import { color, OX, sectionColor } from '../brand.ts';
import { OxigenDiamonds } from '../components/OxigenStack.tsx';
import { useSlideCtx } from './context.ts';

const d = (ms: number) => ({ ['--d' as string]: `${ms}ms` }) as CSSProperties;

export function Chevron({ color: c, size = 18 }: { color: string; size?: number }) {
  return (
    <svg width={size * 0.62} height={size} viewBox="0 0 10 16" aria-hidden>
      <path d="M1.5 1.5L8 8L1.5 14.5" fill="none" stroke={c} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Losanges Oxigen ancrés sur le bord gauche de la slide. */
function LeftDiamonds({ report, scale = 0.42, cy }: { report: Report; scale?: number; cy?: number }) {
  const { w, h } = report.size;
  return (
    <svg className="tpl-diamonds" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <OxigenDiamonds cx={0} cy={cy ?? h * 0.62} r={h * scale} animated />
    </svg>
  );
}

function Divider({ x, y1, y2, c = OX.violet }: { x: number; y1: number; y2: number; c?: string }) {
  return (
    <div
      className="tpl-divider a-grow"
      style={{ left: x, top: y1, height: y2 - y1, background: `linear-gradient(180deg, transparent, ${c} 18%, ${c} 82%, transparent)`, ...d(250) }}
    />
  );
}

function Contact({ report, text }: { report: Report; text?: string }) {
  if (!text) return null;
  return (
    <div className="tpl-contact a-text" style={{ top: report.size.h - 34, width: report.size.w, ...d(900) }}>
      {text}
    </div>
  );
}

export function CoverSlide({ report, slide }: { report: Report; slide: Slide }) {
  const { file } = useSlideCtx();
  const { w, h } = report.size;
  const m = report.meta;
  const x = w * 0.53;
  const versionParts = (m.version ?? '').split(/(XX)/);
  return (
    <>
      <LeftDiamonds report={report} scale={0.3} cy={h * 0.5} />
      <Divider x={w * 0.465} y1={h * 0.12} y2={h * 0.82} />
      <div className="tpl-col" style={{ left: x, top: h * 0.12, width: w - x - 40 }}>
        {m.clientLogo && <img className="cover-logo a-pop" src={file(m.clientLogo)} alt={m.client} style={d(300)} />}
        <div className="cover-client a-text" style={d(450)}>{m.client}</div>
        <div className="cover-title a-text" style={d(600)}>{m.title}</div>
        <div className="cover-period a-text" style={d(720)}>{m.period}</div>
        {m.version && (
          <div className="cover-version a-text" style={d(850)}>
            {versionParts.map((p, i) => (p === 'XX' ? <mark key={i}>XX</mark> : <span key={i}>{p}</span>))}
          </div>
        )}
      </div>
      <Contact report={report} text={(slide.data?.contact as string) ?? undefined} />
    </>
  );
}

export function SectionSlide({ report, slide }: { report: Report; slide: Slide }) {
  const { w, h } = report.size;
  const c = sectionColor(slide.section);
  const num = slide.appendix ? 'A' : String((slide.section ?? 0) + 1).padStart(2, '0');
  return (
    <>
      <LeftDiamonds report={report} scale={0.24} cy={h * 0.6} />
      <Divider x={w * 0.56} y1={h * 0.14} y2={h * 0.8} />
      <div className="tpl-col" style={{ left: w * 0.62, top: h * 0.3, width: w * 0.34 }}>
        <div className="section-num a-text" style={{ WebkitTextStroke: `1.5px ${c}`, ...d(300) }}>{num}</div>
        <div className="section-title a-text" style={d(480)}>
          <Chevron color={c} size={26} />
          <span>{slide.title}</span>
        </div>
        <div className="section-bar a-grow-x" style={{ background: c, ...d(650) }} />
      </div>
    </>
  );
}

export function TocSlide({ report, slide }: { report: Report; slide: Slide }) {
  const { navigate } = useSlideCtx();
  const { w, h } = report.size;
  const entries = (slide.data?.entries as string[]) ?? report.sections.map((s) => s.label);
  return (
    <>
      <LeftDiamonds report={report} scale={0.24} cy={h * 0.6} />
      <Divider x={w * 0.56} y1={h * 0.12} y2={h * 0.86} />
      <div className="tpl-col" style={{ left: w * 0.61, top: h * 0.17, width: w * 0.35 }}>
        <div className="tpl-heading a-text" style={d(250)}>{slide.title ?? 'Sommaire'}</div>
        <div className="toc-list">
          {entries.map((e, i) => {
            const target = report.sections[i]?.dividerSlide ?? report.sections[i]?.firstSlide;
            return (
              <button
                key={i}
                className="toc-item a-text"
                style={d(400 + i * 120)}
                onClick={() => target !== undefined && navigate({ slide: target })}
              >
                <span className="toc-num" style={{ color: sectionColor(i) }}>{String(i + 1).padStart(2, '0')}</span>
                <Chevron color={sectionColor(i)} size={18} />
                <span className="toc-label">{e}</span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

export function GlossarySlide({ report, slide }: { report: Report; slide: Slide }) {
  const { w, h } = report.size;
  const rows = (slide.data?.rows as [string, string][]) ?? [];
  return (
    <>
      <LeftDiamonds report={report} scale={0.24} cy={h * 0.6} />
      <Divider x={w * 0.56} y1={h * 0.1} y2={h * 0.88} />
      <div className="tpl-col" style={{ left: w * 0.6, top: h * 0.12, width: w * 0.36 }}>
        <div className="tpl-heading a-text" style={d(250)}>{slide.title}</div>
        <dl className="glossary">
          {rows.map(([term, def], i) => (
            <div key={i} className="glossary-row a-text" style={d(350 + i * 28)}>
              <dt>{term}</dt>
              <dd>{def}</dd>
            </div>
          ))}
        </dl>
      </div>
    </>
  );
}

export function ClosingSlide({ report, slide }: { report: Report; slide: Slide }) {
  const { w, h } = report.size;
  const tagline = (slide.data?.tagline as Run[]) ?? [];
  const services = (slide.data?.services as { text: string; color?: string }[]) ?? [];
  const bandH = h * 0.3;
  const size = Math.min(150, (w - 120) / Math.max(services.length, 1) / 1.45);
  return (
    <>
      <div className="closing-band a-band" style={{ height: bandH, width: w, background: OX.violet, ...d(0) }}>
        <svg width={w} height={bandH} viewBox={`0 0 ${w} ${bandH}`} aria-hidden>
          <OxigenDiamonds cx={0} cy={bandH * 0.62} r={bandH * 0.9} animated />
        </svg>
      </div>
      <div className="closing-tagline a-text" style={{ top: bandH * 0.18, width: w, ...d(350) }}>
        {tagline.map((r, i) =>
          r.text === '\n' ? <br key={i} /> : (
            <span key={i} style={{ color: r.color && /FF6600/i.test(r.color) ? OX.orange : '#fff' }}>{r.text}</span>
          ),
        )}
      </div>
      <div className="closing-services" style={{ top: bandH + (h - bandH - 40) / 2 - size / 2 }}>
        {services.map((s, i) => {
          const c = color(s.color, OX.violet);
          return (
            <div key={i} className="closing-service a-pop" style={{ width: size * 1.45, height: size * 1.45, ...d(600 + i * 160) }}>
              <svg viewBox="0 0 100 100" aria-hidden>
                <path d="M50 3L97 50L50 97L3 50Z" fill="#fff" stroke={c} strokeWidth="2.4" strokeLinejoin="round" />
              </svg>
              <span style={{ color: c }}>{s.text}</span>
            </div>
          );
        })}
      </div>
      <Contact report={report} text={(slide.data?.contact as string) ?? undefined} />
    </>
  );
}
