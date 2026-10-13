import { customAlphabet } from 'nanoid';
import type { Report } from '../shared/model.ts';
import { convertMetafiles } from './convert.ts';
import { parsePptx, type ParsedPptx } from './pptx/parse.ts';
import { resolvePath } from './pptx/xml.ts';
import { saveReport } from './store.ts';

const newId = customAlphabet('abcdefghijkmnopqrstuvwxyz23456789', 10);

export interface ImportResult {
  report: Report;
  warnings: string[];
}

/** Importe un .pptx finalisé : lecture, conversion des graphiques, enregistrement. */
export async function importPptx(buffer: Buffer, fileName: string): Promise<ImportResult> {
  const parsed = await parsePptx(buffer);
  const { media, zip, warnings } = parsed;
  const files = new Map<string, Uint8Array | string>();

  const metafiles: { name: string; data: Uint8Array }[] = [];
  for (const m of media) {
    const data = await zip.file(m.zipPath)?.async('uint8array');
    if (!data) {
      warnings.push(`Image manquante : ${m.zipPath}`);
      continue;
    }
    if (m.ext === 'emf' || m.ext === 'wmf') metafiles.push({ name: `${m.outBase}.${m.ext}`, data });
    else {
      const ext = m.ext === 'jpeg' ? 'jpg' : m.ext;
      m.outName = `${m.outBase}.${ext}`;
      files.set(m.outName, data);
    }
  }

  const converted = await convertMetafiles(metafiles);
  for (const m of media) {
    if (m.ext !== 'emf' && m.ext !== 'wmf') continue;
    const svg = converted.get(`${m.outBase}.${m.ext}`);
    if (svg) {
      m.outName = `${m.outBase}.svg`;
      files.set(m.outName, svg);
    } else {
      m.outName = '';
      warnings.push(`Graphique non converti (${m.zipPath}) : LibreOffice est-il installé ?`);
    }
  }

  const nameByBase = new Map(media.map((m) => [m.outBase, m.outName]));
  for (const slide of parsed.report.slides) {
    slide.elements = slide.elements.filter((e) => {
      if (e.type !== 'image') return true;
      const name = nameByBase.get(e.src);
      if (!name) return false;
      e.src = name;
      return true;
    });
  }

  const report: Report = {
    id: newId(),
    createdAt: new Date().toISOString(),
    source: { kind: 'pptx', fileName },
    ...parsed.report,
  };
  const logo = await findClientLogo(parsed);
  if (logo) {
    files.set(logo.name, logo.data);
    report.meta.clientLogo = logo.name;
  }

  files.set('source.pptx', buffer);
  await saveReport(report, files);
  return { report, warnings: [...new Set(warnings)] };
}

/** Logo client : image compacte placée dans la moitié droite du gabarit de page de garde. */
async function findClientLogo(parsed: ParsedPptx): Promise<{ name: string; data: Uint8Array } | undefined> {
  const { zip, report } = parsed;
  for (const f of Object.keys(zip.files)) {
    if (!/^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(f)) continue;
    const xml = await zip.file(f)!.async('string');
    if (!/<p:cSld name="(Page de garde|Couverture)"/i.test(xml)) continue;
    const rels = (await zip.file(f.replace('slideLayouts/', 'slideLayouts/_rels/') + '.rels')?.async('string')) ?? '';
    for (const m of xml.matchAll(/<p:pic>[\s\S]*?r:embed="([^"]+)"[\s\S]*?<a:off x="(-?\d+)" y="(-?\d+)"\/><a:ext cx="(\d+)" cy="(\d+)"/g)) {
      const [, rid, x, , cx, cy] = m;
      const w = Number(cx) / 12700;
      const ratio = Number(cx) / Number(cy);
      if (Number(x) / 12700 < report.size.w * 0.35 || ratio < 0.4 || ratio > 4 || w > report.size.w * 0.3) continue;
      const target = new RegExp(`Id="${rid}"[^>]*Target="([^"]+)"`).exec(rels)?.[1];
      if (!target) continue;
      const zipPath = resolvePath(f, target);
      const ext = zipPath.split('.').pop()!.toLowerCase();
      if (!['png', 'jpg', 'jpeg', 'svg'].includes(ext)) continue;
      const data = await zip.file(zipPath)?.async('uint8array');
      if (data) return { name: `logo.${ext === 'jpeg' ? 'jpg' : ext}`, data };
    }
  }
  return undefined;
}
