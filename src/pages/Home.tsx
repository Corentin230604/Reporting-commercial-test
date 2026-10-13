import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Report, ReportSummary } from '../../shared/model.ts';
import { deleteReport, fetchReport, fetchReports, uploadPptx } from '../api.ts';
import { IconLink, IconPlay, IconTrash, IconUpload } from '../components/Icons.tsx';
import { OxigenLogo } from '../components/OxigenStack.tsx';
import { ScaledSlide } from '../components/ScaledSlide.tsx';

type Status = { kind: 'idle' } | { kind: 'upload'; progress: number } | { kind: 'process' } | { kind: 'error'; message: string };

export function Home() {
  const [reports, setReports] = useState<ReportSummary[] | null>(null);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [over, setOver] = useState(false);
  const [toast, setToast] = useState<string>();
  const input = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const refresh = () => fetchReports().then(setReports, () => setReports([]));
  useEffect(() => {
    document.title = 'Oxigen Reporting';
    refresh();
  }, []);

  async function handle(file: File | undefined) {
    if (!file) return;
    if (!/\.pptx$/i.test(file.name)) {
      setStatus({ kind: 'error', message: 'Merci de déposer un fichier PowerPoint (.pptx).' });
      return;
    }
    setStatus({ kind: 'upload', progress: 0 });
    try {
      const { id, warnings } = await uploadPptx(file, (p) => setStatus(p < 1 ? { kind: 'upload', progress: p } : { kind: 'process' }));
      if (warnings.length) sessionStorage.setItem(`warnings:${id}`, JSON.stringify(warnings));
      navigate(`/r/${id}`);
    } catch (e) {
      setStatus({ kind: 'error', message: (e as Error).message });
    }
  }

  const copy = async (id: string) => {
    const url = `${window.location.origin}/r/${id}?client`;
    try {
      await navigator.clipboard.writeText(url);
      setToast('Lien client copié');
    } catch {
      setToast(url);
    }
    setTimeout(() => setToast(undefined), 2500);
  };

  const remove = async (r: ReportSummary) => {
    if (!confirm(`Supprimer le reporting « ${r.client} — ${r.period} » ? Le lien client ne fonctionnera plus.`)) return;
    await deleteReport(r.id);
    refresh();
  };

  return (
    <div className="home">
      <header className="app-header">
        <OxigenLogo height={28} />
        <span className="sep" />
        <div className="app-title"><strong>Reporting</strong><span>Présentations clients animées</span></div>
      </header>
      <main className="home-body">
        <div className="home-hero">
          <h1>Publier un reporting</h1>
          <p>Déposez la présentation finalisée : elle devient une présentation web animée, à partager au client et exportable en PDF.</p>
        </div>

        <label
          className={`dropzone ${over ? 'over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); handle(e.dataTransfer.files[0]); }}
        >
          <input ref={input} type="file" accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation" onChange={(e) => handle(e.target.files?.[0])} />
          <div className="dropzone-icon"><IconUpload size={28} /></div>
          <div className="grow">
            <h3>Glissez votre fichier .pptx ici</h3>
            <p>ou cliquez pour le choisir — les graphiques et tableaux Excel collés sont convertis automatiquement.</p>
          </div>
          <span className="btn primary">Choisir un fichier</span>
        </label>

        {status.kind === 'upload' && (
          <div className="import-status">Envoi… <div className="bar"><i style={{ width: `${Math.round(status.progress * 100)}%` }} /></div></div>
        )}
        {status.kind === 'process' && (
          <div className="import-status">Analyse de la présentation et conversion des graphiques… <div className="bar indeterminate"><i /></div></div>
        )}
        {status.kind === 'error' && <div className="import-status error">{status.message}</div>}

        <div className="reports-head">
          <h2>Reportings publiés</h2>
          {reports && <span>{reports.length} reporting{reports.length > 1 ? 's' : ''}</span>}
        </div>
        {reports && reports.length === 0 && <div className="empty">Aucun reporting pour l’instant. Déposez votre premier fichier ci-dessus.</div>}
        <div className="report-list">
          {reports?.map((r) => (
            <article key={r.id} className="report-card">
              <Link to={`/r/${r.id}`}><CoverThumb id={r.id} /></Link>
              <div className="report-card-body">
                <strong>{r.client} — {r.period}</strong>
                <small>{r.title} · {r.slideCount} slides · importé le {new Date(r.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</small>
                <div className="report-card-actions">
                  <Link className="btn primary" to={`/r/${r.id}`}><IconPlay size={16} />Ouvrir</Link>
                  <button className="btn" onClick={() => copy(r.id)}><IconLink size={16} />Lien client</button>
                  <button className="btn icon danger" onClick={() => remove(r)} title="Supprimer"><IconTrash size={16} /></button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </main>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

const cache = new Map<string, Promise<Report>>();
function CoverThumb({ id }: { id: string }) {
  const [report, setReport] = useState<Report>();
  useEffect(() => {
    if (!cache.has(id)) cache.set(id, fetchReport(id));
    cache.get(id)!.then(setReport, () => {});
  }, [id]);
  if (!report) return <div className="thumb-frame" style={{ aspectRatio: '1.414' }} />;
  return <ScaledSlide report={report} slide={report.slides[0]} />;
}
