import { useMemo, type CSSProperties } from 'react';
import type { Report, Run, Slide } from '../../shared/model.ts';
import { fontFamily, sectionColor } from '../brand.ts';
import { OxigenMark } from '../components/OxigenStack.tsx';
import { SlideContext, useSlideCtx, type SlideCtx } from './context.ts';
import { ElementView, entranceDelays } from './Elements.tsx';
import { Chevron, ClosingSlide, CoverSlide, GlossarySlide, SectionSlide, TocSlide } from './Templates.tsx';

/**
 * Rendu d'une slide dans son repère d'origine (points), mis à l'échelle par
 * le conteneur. `ctx.playing` déclenche les animations d'entrée.
 */
export function SlideView({ report, slide, ctx, scale = 1 }: { report: Report; slide: Slide; ctx: SlideCtx; scale?: number }) {
  const { w, h } = report.size;
  const cls = ['stage', `kind-${slide.kind}`, ctx.animate ? 'animated' : 'static', ctx.playing ? 'play' : ''].join(' ');
  return (
    <SlideContext.Provider value={ctx}>
      <div className={cls} style={{ width: w, height: h, transform: scale !== 1 ? `scale(${scale})` : undefined }}>
        <SlideBody report={report} slide={slide} />
      </div>
    </SlideContext.Provider>
  );
}

function SlideBody({ report, slide }: { report: Report; slide: Slide }) {
  switch (slide.kind) {
    case 'cover':
      return <CoverSlide report={report} slide={slide} />;
    case 'section':
      return <SectionSlide report={report} slide={slide} />;
    case 'toc':
      return <TocSlide report={report} slide={slide} />;
    case 'glossary':
      return <GlossarySlide report={report} slide={slide} />;
    case 'closing':
      return <ClosingSlide report={report} slide={slide} />;
    default:
      return <ContentSlide report={report} slide={slide} />;
  }
}

function ContentSlide({ report, slide }: { report: Report; slide: Slide }) {
  const delays = useMemo(() => entranceDelays(slide.elements, report.size.h), [slide, report.size.h]);
  return (
    <>
      <ContentChrome report={report} slide={slide} />
      {slide.elements.map((el) => (
        <ElementView key={el.id} el={el} delay={delays.get(el.id) ?? 0} appendix={slide.appendix} />
      ))}
    </>
  );
}

/** Habillage Oxigen modernisé : bandeau de sections, titre, filet, pied de page. */
function ContentChrome({ report, slide }: { report: Report; slide: Slide }) {
  const { navigate } = useSlideCtx();
  const { w, h } = report.size;
  const c = sectionColor(slide.section);
  const tabsLeft = 74;
  const tabW = Math.min(150, (w * 0.72 - tabsLeft) / Math.max(report.sections.length, 1));
  const titleY = titleTop(slide, h);

  return (
    <>
      <div className="chrome-nav" style={{ width: w }}>
        <button className="chrome-home" title="Sommaire" onClick={() => {
          const toc = report.slides.find((s) => s.kind === 'toc');
          navigate({ slide: toc?.index ?? 0 });
        }}>
          <OxigenMark size={22} />
        </button>
        {report.sections.map((s, i) => {
          const active = i === slide.section;
          const target = s.firstSlide ?? s.dividerSlide;
          return (
            <button
              key={i}
              className={`chrome-tab ${active ? 'is-active' : ''}`}
              style={{ left: tabsLeft + i * tabW, width: tabW - 10, ['--c' as string]: sectionColor(i) } as CSSProperties}
              onClick={() => target !== undefined && navigate({ slide: target })}
            >
              <Chevron color={active ? sectionColor(i) : '#C9C6DA'} size={12} />
              <span>{s.label}</span>
            </button>
          );
        })}
      </div>

      <div className="chrome-rail" style={{ top: titleY - 4, height: h - titleY - 40, background: `linear-gradient(180deg, ${c}, ${c}33 70%, transparent)` }} />

      {slide.titleRuns && (
        <div className="chrome-title a-title" style={{ top: titleY, left: 60, width: w - 100 }}>
          <span className="chrome-title-mark" style={{ background: c }} />
          <TitleText runs={slide.titleRuns} />
          {slide.appendix && <span className="chrome-chip">Annexe</span>}
        </div>
      )}

      <div className="chrome-footer" style={{ top: h - 24, width: w }}>
        <span>{report.meta.footer ?? `${report.meta.client} | ${report.meta.title} | ${report.meta.period}`}</span>
      </div>
      <div className="chrome-page" style={{ top: h - 27, left: w - 46 }}>{slide.sourceNumber}</div>
    </>
  );
}

function titleTop(slide: Slide, h: number): number {
  // Les annexes (grands tableaux) ont un titre plus haut que les slides d'analyse.
  return slide.appendix ? h * 0.085 : h * 0.105;
}

function TitleText({ runs }: { runs: Run[] }) {
  const size = Math.min(22, Math.max(...runs.map((r) => r.size || 20)));
  return (
    <span className="chrome-title-text" style={{ fontSize: size, fontFamily: fontFamily(undefined) }}>
      {runs.map((r, i) =>
        r.br ? ' ' : (
          <span key={i} className={r.bold ? 'tt-strong' : 'tt-light'}>{r.text}</span>
        ),
      )}
    </span>
  );
}
