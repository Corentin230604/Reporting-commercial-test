import express from 'express';
import multer from 'multer';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { libreOfficeAvailable } from './convert.ts';
import { importPptx } from './importPptx.ts';
import { deleteReport, listReports, loadReport, reportDir } from './store.ts';

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });
const PORT = Number(process.env.PORT ?? 3001);

app.get('/api/health', async (_req, res) => {
  res.json({ ok: true, libreOffice: await libreOfficeAvailable() });
});

app.get('/api/reports', async (_req, res) => {
  res.json(await listReports());
});

app.get('/api/reports/:id', async (req, res) => {
  const report = await loadReport(req.params.id).catch(() => null);
  if (!report) return res.status(404).json({ error: 'Reporting introuvable' });
  res.json(report);
});

app.post('/api/reports', upload.single('file'), async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'Aucun fichier reçu' });
  if (!/\.pptx$/i.test(file.originalname)) return res.status(400).json({ error: 'Le fichier doit être un .pptx' });
  try {
    // multer décode le nom en latin1 : on le réinterprète en UTF-8 (accents).
    const name = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const { report, warnings } = await importPptx(file.buffer, name);
    res.json({ id: report.id, warnings });
  } catch (err) {
    console.error(err);
    res.status(422).json({ error: `Lecture du fichier impossible : ${(err as Error).message}` });
  }
});

app.delete('/api/reports/:id', async (req, res) => {
  await deleteReport(req.params.id);
  res.json({ ok: true });
});

app.get('/files/:id/:name', (req, res) => {
  const { id, name } = req.params;
  if (!/^[\w.-]+$/.test(name) || name.startsWith('.')) return res.status(400).end();
  let dir: string;
  try {
    dir = join(reportDir(id), 'files');
  } catch {
    return res.status(400).end();
  }
  if (name === 'source.pptx') res.setHeader('Content-Disposition', 'attachment');
  res.sendFile(name, { root: dir, maxAge: '7d', immutable: true }, (err) => {
    if (err && !res.headersSent) res.status(404).end();
  });
});

// En production, le serveur sert aussi l'application web compilée.
const dist = resolve('dist');
if (existsSync(dist)) {
  app.use(express.static(dist, { index: false, maxAge: '1h' }));
  app.get('*', (_req, res) => res.sendFile(join(dist, 'index.html')));
}

app.listen(PORT, () => {
  console.log(`Oxigen Reporting — API sur http://localhost:${PORT}`);
});
