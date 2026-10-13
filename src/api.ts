import type { Report, ReportSummary } from '../shared/model.ts';

export const fileUrl = (id: string, name: string) => `/files/${id}/${encodeURIComponent(name)}`;

export async function fetchReports(): Promise<ReportSummary[]> {
  const r = await fetch('/api/reports');
  if (!r.ok) throw new Error('Impossible de charger les reportings');
  return r.json();
}

export async function fetchReport(id: string): Promise<Report> {
  const r = await fetch(`/api/reports/${id}`);
  if (!r.ok) throw new Error(r.status === 404 ? 'Ce reporting n’existe pas ou a été supprimé.' : 'Chargement impossible');
  return r.json();
}

export async function deleteReport(id: string): Promise<void> {
  await fetch(`/api/reports/${id}`, { method: 'DELETE' });
}

/** Envoie un .pptx ; `onProgress` reçoit la progression de l'envoi (0..1). */
export function uploadPptx(file: File, onProgress: (p: number) => void): Promise<{ id: string; warnings: string[] }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/reports');
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      let body: { id?: string; warnings?: string[]; error?: string } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* réponse non JSON */
      }
      if (xhr.status >= 200 && xhr.status < 300 && body.id) resolve({ id: body.id, warnings: body.warnings ?? [] });
      else reject(new Error(body.error ?? `Erreur ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error('Connexion au serveur impossible'));
    const form = new FormData();
    form.append('file', file);
    xhr.send(form);
  });
}
