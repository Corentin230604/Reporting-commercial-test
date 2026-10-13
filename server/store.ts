import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { Report, ReportSummary } from '../shared/model.ts';

export const DATA_DIR = resolve(process.env.DATA_DIR ?? 'data');
const REPORTS_DIR = join(DATA_DIR, 'reports');

export const reportDir = (id: string) => join(REPORTS_DIR, safeId(id));

function safeId(id: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error('Identifiant invalide');
  return id;
}

export async function saveReport(report: Report, files: Map<string, Uint8Array | string>): Promise<void> {
  const dir = reportDir(report.id);
  await mkdir(join(dir, 'files'), { recursive: true });
  for (const [name, data] of files) await writeFile(join(dir, 'files', name), data);
  await writeFile(join(dir, 'report.json'), JSON.stringify(report));
}

export async function loadReport(id: string): Promise<Report | null> {
  try {
    return JSON.parse(await readFile(join(reportDir(id), 'report.json'), 'utf8')) as Report;
  } catch {
    return null;
  }
}

export async function listReports(): Promise<ReportSummary[]> {
  await mkdir(REPORTS_DIR, { recursive: true });
  const out: ReportSummary[] = [];
  for (const id of await readdir(REPORTS_DIR)) {
    const r = await loadReport(id);
    if (!r) continue;
    out.push({
      id: r.id,
      createdAt: r.createdAt,
      client: r.meta.client,
      title: r.meta.title,
      period: r.meta.period,
      slideCount: r.slides.length,
      fileName: r.source.kind === 'pptx' ? r.source.fileName : undefined,
    });
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function deleteReport(id: string): Promise<void> {
  await rm(reportDir(id), { recursive: true, force: true });
}
