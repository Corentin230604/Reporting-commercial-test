import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { Link, Report } from '../../shared/model.ts';
import { fetchReport, fileUrl } from '../api.ts';
import { sectionColor } from '../brand.ts';
import { IconClose, IconExpand, IconGrid, IconHome, IconLeft, IconLink, IconPdf, IconReplay, IconRight } from '../components/Icons.tsx';
import { OxigenLogo } from '../components/OxigenStack.tsx';
import { ScaledSlide } from '../components/ScaledSlide.tsx';
import { InlineSvg } from '../components/InlineSvg.tsx';
import { SlideView } from '../slides/SlideView.tsx';

export function Viewer() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const clientMode = params.has('client');
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    fetchReport(id).then(setReport, (e: Error) => setError(e.message));
  }, [id]);

  useEffect(() => {
    if (report) document.title = `${report.meta.client} — ${report.meta.title} ${report.meta.period}`;
  }, [report]);

  if (error) return <div className="empty" style={{ margin: 40 }}>{error}</div>;
  if (!report) return <div className="viewer"><div className="viewer-main"><div className="bar indeterminate" style={{ width: 200 }}><i /></div></div></div>;
  return <RoutedPresentation report={report} clientMode={clientMode} />;
}

function RoutedPresentation({ report, clientMode }: { report: Report; clientMode: boolean }) {
  const navigate = useNavigate();
  return (
    <Presentation
      report={report}
      clientMode={clientMode}
      onHome={() => navigate('/')}
      onExportPdf={() => {
        window.open(`/r/${report.id}/print`, '_blank', 'noopener');
      }}
      shareUrl={`${window.location.origin}/r/${report.id}?client`}
    />
  );
}

/** Ancre d'URL : « <préfixe><numéro de slide> », ex. #12 ou #abc-12. */
function indexFromHash(n: number, prefix: string): number {
  const h = window.location.hash.replace('#', '');
  if (!h.startsWith(prefix)) return 0;
  const v = Number(h.slice(prefix.length));
  return Number.isInteger(v) && v >= 1 && v <= n ? v - 1 : 0;
}

export interface PresentationProps {
  report: Report;
  clientMode: boolean;
  /** Retour à la liste des reportings (absent : bouton masqué). */
  onHome?: () => void;
  /** Export PDF ; peut renvoyer un message à afficher. */
  onExportPdf?: () => Promise<string | void> | void;
  /** Lien à copier pour le client (absent : bouton masqué). */
  shareUrl?: string;
  hashPrefix?: string;
}

export function Presentation({ report, clientMode, onHome, onExportPdf, shareUrl, hashPrefix = '' }: PresentationProps) {
  const total = report.slides.length;
  const [index, setIndex] = useState(() => indexFromHash(total, hashPrefix));
  const [playing, setPlaying] = useState(false);
  const [replay, setReplay] = useState(0);
  const [overview, setOverview] = useState(false);
  const [zoomSrc, setZoomSrc] = useState<string>();
  const [fullscreen, setFullscreen] = useState(false);
  const [toast, setToast] = useState<string>();
  // Avertissements de l'import (graphique non converti…), affichés une fois à l'auteur.
  const [warnings, setWarnings] = useState<string[]>(() => {
    if (clientMode) return [];
    try {
      const raw = sessionStorage.getItem(`warnings:${report.id}`);
      sessionStorage.removeItem(`warnings:${report.id}`);
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  });
  const mainRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  const go = useCallback((i: number) => setIndex(Math.max(0, Math.min(total - 1, i))), [total]);
  const next = useCallback(() => go(index + 1), [go, index]);
  const prev = useCallback(() => go(index - 1), [go, index]);

  // Relance les animations à chaque changement de slide.
  useEffect(() => {
    setPlaying(false);
    const r = requestAnimationFrame(() => requestAnimationFrame(() => setPlaying(true)));
    try {
      history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${hashPrefix}${index + 1}`);
    } catch {
      /* historique indisponible (page intégrée) */
    }
    // Précharge les images des slides voisines.
    for (const s of [report.slides[index + 1], report.slides[index - 1]]) {
      s?.elements.forEach((e) => e.type === 'image' && (new Image().src = fileUrl(report.id, e.src)));
    }
    return () => cancelAnimationFrame(r);
  }, [index, replay, report]);

  useEffect(() => {
    const onHash = () => setIndex(indexFromHash(total, hashPrefix));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [total, hashPrefix]);

  // Mise à l'échelle de la slide dans l'espace disponible.
  useLayoutEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const fit = () => {
      const cs = getComputedStyle(el);
      const aw = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const ah = el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      setScale(Math.max(0.1, Math.min(aw / report.size.w, ah / report.size.h)));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [report.size, fullscreen]);

  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.().catch(() => setFullscreen((f) => !f));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (zoomSrc) {
        if (e.key === 'Escape') setZoomSrc(undefined);
        return;
      }
      if (overview && e.key === 'Escape') return setOverview(false);
      switch (e.key) {
        case 'ArrowRight': case 'PageDown': case ' ': e.preventDefault(); next(); break;
        case 'ArrowLeft': case 'PageUp': e.preventDefault(); prev(); break;
        case 'Home': go(0); break;
        case 'End': go(total - 1); break;
        case 'g': case 'G': setOverview((o) => !o); break;
        case 'f': case 'F': toggleFullscreen(); break;
        case 'r': case 'R': setReplay((n) => n + 1); break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev, go, total, overview, zoomSrc, toggleFullscreen]);

  // Balayage tactile.
  const touch = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY });
  const onTouchEnd = (e: React.TouchEvent) => {
    const t = touch.current;
    if (!t) return;
    const dx = e.changedTouches[0].clientX - t.x, dy = e.changedTouches[0].clientY - t.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) (dx < 0 ? next : prev)();
    touch.current = null;
  };

  const navigate = useCallback((l: Link) => {
    if ('slide' in l) go(l.slide);
    else window.open(l.url, '_blank', 'noopener');
  }, [go]);

  const ctx = useMemo(() => ({
    playing,
    animate: true,
    navigate,
    file: (n: string) => fileUrl(report.id, n),
    zoom: (src: string) => setZoomSrc(src),
  }), [playing, navigate, report.id]);

  const copyLink = async () => {
    const url = shareUrl ?? window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setToast('Lien client copié dans le presse-papiers');
    } catch {
      setToast(url);
    }
    setTimeout(() => setToast(undefined), 2600);
  };

  const slide = report.slides[index];
  const sectionLabel = slide.section !== undefined ? report.sections[slide.section]?.label : undefined;

  return (
    <div className={`viewer ${fullscreen ? 'fullscreen' : ''}`}>
      <header className="app-header">
        {!clientMode && onHome && (
          <button className="btn icon ghost" onClick={onHome} title="Tous les reportings"><IconHome /></button>
        )}
        <OxigenLogo height={26} />
        <span className="sep hide-sm" />
        <div className="app-title">
          <strong>{report.meta.client} · {report.meta.title}</strong>
          <span>{report.meta.period}{sectionLabel ? ` — ${sectionLabel}` : ''}</span>
        </div>
        <span className="spacer" />
        <button className="btn ghost hide-sm" onClick={() => setReplay((n) => n + 1)} title="Rejouer l’animation (R)"><IconReplay /></button>
        <button className="btn" onClick={() => setOverview(true)} title="Vue d’ensemble (G)"><IconGrid /><span className="hide-sm">Sommaire</span></button>
        <button className="btn hide-sm" onClick={toggleFullscreen} title="Plein écran (F)"><IconExpand /><span>Présenter</span></button>
        {!clientMode && shareUrl && <button className="btn hide-sm" onClick={copyLink} title="Copier le lien à envoyer au client"><IconLink /><span>Lien client</span></button>}
        {onExportPdf && <button className="btn accent" onClick={async () => {
          const msg = await onExportPdf();
          if (msg) {
            setToast(msg);
            setTimeout(() => setToast(undefined), 3200);
          }
        }}><IconPdf /><span className="hide-sm">Export PDF</span></button>}
      </header>

      <div className="viewer-main" ref={mainRef} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <button className="viewer-nav-btn prev" onClick={prev} disabled={index === 0} aria-label="Slide précédente"><IconLeft /></button>
        {scale > 0 && (
          <div className="viewer-frame" style={{ width: report.size.w * scale, height: report.size.h * scale }} onClick={(e) => {
            if (fullscreen && !(e.target as HTMLElement).closest('.is-link, button, .tx-link')) next();
          }}>
            <SlideView key={`${index}-${replay}`} report={report} slide={slide} ctx={ctx} scale={scale} />
          </div>
        )}
        <button className="viewer-nav-btn next" onClick={next} disabled={index === total - 1} aria-label="Slide suivante"><IconRight /></button>
      </div>

      <footer className="viewer-bar">
        <div className="progress">
          {report.slides.map((s, i) => (
            <button
              key={i}
              className={`progress-seg ${i < index ? 'done' : ''} ${i === index ? 'current' : ''}`}
              style={{ ['--c' as string]: sectionColor(s.section) }}
              onClick={() => go(i)}
              aria-label={`Slide ${i + 1}`}
            >
              <span className="tip">{i + 1}. {s.title ?? report.meta.client}</span>
            </button>
          ))}
        </div>
        <span className="counter">{index + 1} / {total}</span>
      </footer>

      {overview && (
        <Overview report={report} current={index} onPick={(i) => { go(i); setOverview(false); }} onClose={() => setOverview(false)} />
      )}
      {zoomSrc && (
        <div className="lightbox" onClick={() => setZoomSrc(undefined)}>
          {zoomSrc.endsWith(".svg") ? <InlineSvg src={zoomSrc} /> : <img src={zoomSrc} alt="" />}
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
      {warnings.length > 0 && (
        <div className="warnings floating">
          <strong>Import terminé avec {warnings.length} remarque{warnings.length > 1 ? 's' : ''}</strong>
          <button className="btn icon ghost" onClick={() => setWarnings([])} aria-label="Fermer"><IconClose size={16} /></button>
          <ul>{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
        </div>
      )}
    </div>
  );
}

function Overview({ report, current, onPick, onClose }: { report: Report; current: number; onPick: (i: number) => void; onClose: () => void }) {
  const groups: { label: string; color: string; slides: number[] }[] = [];
  report.slides.forEach((s, i) => {
    const label = s.section !== undefined ? report.sections[s.section]?.label ?? '' : 'Introduction';
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.slides.push(i);
    else groups.push({ label, color: sectionColor(s.section), slides: [i] });
  });
  return (
    <div className="overview">
      <div className="overview-head">
        <h2>Vue d’ensemble</h2>
        <button className="btn icon" onClick={onClose} aria-label="Fermer"><IconClose /></button>
      </div>
      {groups.map((g, gi) => (
        <section key={gi}>
          <div className="overview-section"><i style={{ background: g.color }} />{g.label}</div>
          <div className="overview-grid">
            {g.slides.map((i) => (
              <div
                key={i}
                role="button"
                tabIndex={0}
                className={`thumb ${i === current ? 'current' : ''}`}
                onClick={() => onPick(i)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onPick(i)}
              >
                <ScaledSlide report={report} slide={report.slides[i]} />
                <div className="thumb-label"><b>{i + 1}</b><span>{report.slides[i].title ?? report.meta.client}</span></div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
