/**
 * Version hébergée sur Claude (Artifact) : page statique sans serveur.
 * Les reportings sont publiés à côté de la page, dans reports/<id>/ :
 * report.json, graphiques convertis et PDF pré-généré. L'import d'un
 * nouveau .pptx se fait côté Claude, qui republie la page.
 */
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Report, ReportSummary } from '../shared/model.ts';
import { setFileBase } from './api.ts';
import { IconPlay } from './components/Icons.tsx';
import { OxigenLogo } from './components/OxigenStack.tsx';
import { ScaledSlide } from './components/ScaledSlide.tsx';
import { Presentation } from './pages/Viewer.tsx';
import './styles.css';

setFileBase((id, name) => `reports/${id}/${encodeURIComponent(name)}`);

interface ClaudeRuntime {
  use(name: 'downloads'): Promise<{ save(r: { filename: string; data: Blob }): Promise<unknown> } | null>;
}
const runtime = () => (window as unknown as { claude?: ClaudeRuntime }).claude;

const reportCache = new Map<string, Promise<Report>>();
function loadReport(id: string): Promise<Report> {
  let p = reportCache.get(id);
  if (!p) {
    p = fetch(`reports/${id}/report.json`).then((r) => {
      if (!r.ok) throw new Error('Reporting introuvable');
      return r.json();
    });
    reportCache.set(id, p);
  }
  return p;
}

/** Ancre « <id>-<slide> » : rouvre le bon reporting à la bonne slide. */
function idFromHash(): string | undefined {
  return /^#([a-z0-9]+)-\d+$/.exec(window.location.hash)?.[1];
}

async function exportPdf(report: Report): Promise<string | void> {
  const url = `reports/${report.id}/reporting.pdf`;
  const filename = `${report.meta.client} - ${report.meta.title} - ${report.meta.period}.pdf`.replace(/[\\/:*?"<>|]/g, '');
  const rt = runtime();
  if (!rt) {
    // Site web classique : simple lien de téléchargement.
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    return;
  }
  const downloads = await rt.use('downloads').catch(() => null);
  if (!downloads) return 'Le téléchargement n’est pas disponible dans cette vue.';
  const res = await fetch(url);
  if (!res.ok) return 'Le PDF de ce reporting n’est pas encore disponible.';
  try {
    await downloads.save({ filename, data: await res.blob() });
    return 'PDF téléchargé';
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === 'declined') return;
    return 'Le téléchargement a échoué. Réessayez dans un instant.';
  }
}

function App() {
  const [list, setList] = useState<ReportSummary[]>();
  const [error, setError] = useState<string>();
  const [openId, setOpenId] = useState<string | undefined>(idFromHash);
  const [report, setReport] = useState<Report>();

  useEffect(() => {
    fetch('reports/index.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((l: ReportSummary[]) => {
        setList(l);
        // Ouvre directement le reporting le plus récent.
        setOpenId((cur) => cur ?? l[0]?.id);
      })
      .catch(() => setError('Impossible de charger la liste des reportings.'));
  }, []);

  useEffect(() => {
    setReport(undefined);
    if (openId) loadReport(openId).then(setReport, () => setError('Ce reporting est introuvable.'));
  }, [openId]);

  if (error) return <div className="empty" style={{ margin: 40 }}>{error}</div>;

  if (openId) {
    if (!report) return <div className="viewer"><div className="viewer-main"><div className="bar indeterminate" style={{ width: 200 }}><i /></div></div></div>;
    return (
      <Presentation
        key={report.id}
        report={report}
        clientMode={false}
        hashPrefix={`${report.id}-`}
        onHome={list && list.length > 1 ? () => setOpenId(undefined) : undefined}
        onExportPdf={() => exportPdf(report)}
      />
    );
  }

  return (
    <div className="home">
      <header className="app-header">
        <OxigenLogo height={28} />
        <span className="sep" />
        <div className="app-title"><strong>Reporting</strong><span>Présentations clients animées</span></div>
      </header>
      <main className="home-body">
        <div className="reports-head">
          <h2>Reportings publiés</h2>
          {list && <span>{list.length} reporting{list.length > 1 ? 's' : ''}</span>}
        </div>
        <div className="report-list">
          {list?.map((r) => (
            <article key={r.id} className="report-card">
              <div role="button" tabIndex={0} onClick={() => setOpenId(r.id)} onKeyDown={(e) => e.key === 'Enter' && setOpenId(r.id)} style={{ cursor: 'pointer' }}>
                <CoverThumb id={r.id} />
              </div>
              <div className="report-card-body">
                <strong>{r.client} — {r.period}</strong>
                <small>{r.title} · {r.slideCount} slides</small>
                <div className="report-card-actions">
                  <button className="btn primary" onClick={() => setOpenId(r.id)}><IconPlay size={16} />Ouvrir</button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </main>
    </div>
  );
}

function CoverThumb({ id }: { id: string }) {
  const [report, setReport] = useState<Report>();
  useEffect(() => {
    loadReport(id).then(setReport, () => {});
  }, [id]);
  if (!report) return <div className="thumb-frame" style={{ aspectRatio: '1.414' }} />;
  return <ScaledSlide report={report} slide={report.slides[0]} />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
