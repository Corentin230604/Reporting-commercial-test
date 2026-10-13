import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { importPptx } from './importPptx.ts';

// Usage : npm run import -- chemin/vers/reporting.pptx
const file = process.argv[2];
if (!file) {
  console.error('Usage : npm run import -- <fichier.pptx>');
  process.exit(1);
}
const t0 = Date.now();
const { report, warnings } = await importPptx(await readFile(file), basename(file));
console.log(`Reporting importé : ${report.id} (${report.slides.length} slides, ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
for (const w of warnings) console.warn(`  ! ${w}`);
