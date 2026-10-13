import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { Report } from '../../shared/model.ts';
import { fetchReport, fileUrl } from '../api.ts';
import { SlideView } from '../slides/SlideView.tsx';

/** 1 point de slide = 1 px CSS ; la page A4 paysage fait 297 mm = 1122,5 px. */
const PX_PER_MM = 96 / 25.4;

export function Print() {
  const { id = '' } = useParams();
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    fetchReport(id).then(setReport, (e: Error) => setError(e.message));
  }, [id]);

  useEffect(() => {
    if (!report) return;
    document.title = `${report.meta.client} - ${report.meta.title} - ${report.meta.period}`;
    let cancelled = false;
    // Attend polices et images avant d'ouvrir la boîte d'impression.
    (async () => {
      await document.fonts.ready;
      const imgs = [...document.images];
      await Promise.all(imgs.map((img) => (img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; }))));
      await new Promise((r) => setTimeout(r, 300));
      if (!cancelled && !new URLSearchParams(window.location.search).has('noprint')) window.print();
    })();
    return () => {
      cancelled = true;
    };
  }, [report]);

  if (error) return <div className="empty" style={{ margin: 40 }}>{error}</div>;
  if (!report) return null;

  const scale = (297 * PX_PER_MM) / report.size.w;
  const ctx = { playing: false, animate: false, navigate: () => {}, file: (n: string) => fileUrl(report.id, n) };
  return (
    <div className="print-root">
      <div className="print-hint">
        Pour enregistrer le PDF, choisissez « Enregistrer au format PDF » comme imprimante.
        <button className="btn" onClick={() => window.print()}>Imprimer / PDF</button>
      </div>
      {report.slides.map((s) => (
        <div className="print-page" key={s.index}>
          <SlideView report={report} slide={s} ctx={ctx} scale={scale} />
        </div>
      ))}
    </div>
  );
}
