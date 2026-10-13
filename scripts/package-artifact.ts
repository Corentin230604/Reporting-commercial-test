/**
 * Assemble la version hébergée sur Claude dans artifact-out/ :
 *   index.html                  page (JS et CSS intégrés)
 *   reports/index.json          liste des reportings
 *   reports/<id>/...            report.json, graphiques, logo, reporting.pdf
 *
 * Usage : npx vite build -c vite.artifact.config.ts && npx tsx scripts/package-artifact.ts <id> [<id>…]
 * Le PDF (reporting.pdf) est copié s'il existe dans data/reports/<id>/files/.
 */
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Report, ReportSummary } from '../shared/model.ts';

const DATA = process.env.DATA_DIR ?? 'data';
const OUT = 'artifact-out';
const ids = process.argv.slice(2);
if (!ids.length) {
  console.error('Usage : tsx scripts/package-artifact.ts <id> [<id>…]');
  process.exit(1);
}

await rm(OUT, { recursive: true, force: true });
await mkdir(join(OUT, 'reports'), { recursive: true });

const js = (await readFile('dist-artifact/app.js', 'utf8')).replace(/<\/script/gi, '<\\/script');
const css = await readFile('dist-artifact/app.css', 'utf8');
const html = `<title>Oxigen Reporting</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Arimo:ital,wght@0,400;0,700;1,400;1,700&family=Lato:wght@300;400;700;900&display=swap">
<style>${css}
html, body, #root { height: 100%; }</style>
<div id="root"></div>
<script type="module">${js}</script>
`;
await writeFile(join(OUT, 'index.html'), html);
// Variante « site web » (Netlify, OVH…) : document HTML complet.
const standalone = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<link rel="icon" type="image/svg+xml" href="oxigen-mark.svg">
${html.replace(/<div id="root">[\s\S]*$/, '')}</head>
<body>
<div id="root"></div>
<script type="module">${js}</script>
</body>
</html>
`;

const index: ReportSummary[] = [];
for (const id of ids) {
  const src = join(DATA, 'reports', id);
  const report = JSON.parse(await readFile(join(src, 'report.json'), 'utf8')) as Report;
  const dst = join(OUT, 'reports', id);
  await mkdir(dst, { recursive: true });
  await copyFile(join(src, 'report.json'), join(dst, 'report.json'));
  for (const f of await readdir(join(src, 'files'))) {
    if (f === 'source.pptx') continue;
    await copyFile(join(src, 'files', f), join(dst, f));
  }
  if (!existsSync(join(dst, 'reporting.pdf'))) console.warn(`  ! pas de PDF pour ${id}`);
  index.push({
    id, createdAt: report.createdAt, client: report.meta.client, title: report.meta.title,
    period: report.meta.period, slideCount: report.slides.length,
  });
}
index.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
await writeFile(join(OUT, 'reports', 'index.json'), JSON.stringify(index));
// Copie « site web » : même contenu, page HTML complète.
await rm('site-out', { recursive: true, force: true });
await mkdir('site-out', { recursive: true });
await writeFile(join('site-out', 'index.html'), standalone);
await copyDir(join(OUT, 'reports'), join('site-out', 'reports'));
await copyFile('public/oxigen-mark.svg', join('site-out', 'oxigen-mark.svg'));

async function copyDir(from: string, to: string): Promise<void> {
  await mkdir(to, { recursive: true });
  for (const e of await readdir(from, { withFileTypes: true })) {
    if (e.isDirectory()) await copyDir(join(from, e.name), join(to, e.name));
    else await copyFile(join(from, e.name), join(to, e.name));
  }
}

console.log(`Page assemblée dans ${OUT}/ (${ids.length} reporting${ids.length > 1 ? 's' : ''})`);
