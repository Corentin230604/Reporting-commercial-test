import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

const SOFFICE = process.env.SOFFICE_PATH ?? 'soffice';

let available: boolean | undefined;
export async function libreOfficeAvailable(): Promise<boolean> {
  if (available !== undefined) return available;
  try {
    await run(SOFFICE, ['--version'], { timeout: 30_000 });
    available = true;
  } catch {
    available = false;
  }
  return available;
}

/**
 * Convertit des métafichiers Windows (EMF/WMF : graphiques et tableaux collés
 * depuis Excel) en SVG vectoriels, recadrés sur leur contenu.
 * Retourne, pour chaque fichier d'entrée, le SVG obtenu (ou null en cas d'échec).
 */
export async function convertMetafiles(files: { name: string; data: Uint8Array }[]): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();
  if (!files.length) return result;
  if (!(await libreOfficeAvailable())) {
    for (const f of files) result.set(f.name, null);
    return result;
  }
  const dir = await mkdtemp(join(tmpdir(), 'oxr-'));
  try {
    const inDir = join(dir, 'in');
    const outDir = join(dir, 'out');
    await run('mkdir', ['-p', inDir, outDir]);
    for (const f of files) await writeFile(join(inDir, f.name), f.data);
    // Un profil LibreOffice dédié évite les conflits entre conversions simultanées.
    const profile = `file://${join(dir, 'profile')}`;
    await run(
      SOFFICE,
      [`-env:UserInstallation=${profile}`, '--headless', '--convert-to', 'svg', '--outdir', outDir, ...files.map((f) => join(inDir, f.name))],
      { timeout: 300_000, maxBuffer: 16 * 1024 * 1024 },
    );
    const produced = new Set(await readdir(outDir));
    for (const f of files) {
      const svgName = f.name.replace(/\.[^.]+$/, '.svg');
      result.set(f.name, produced.has(svgName) ? cleanSvg(await readFile(join(outDir, svgName), 'utf8'), f.name.replace(/\.[^.]+$/, '')) : null);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  return result;
}

/** Largeur d'Arial Narrow rapportée à Arial (Arimo, aux métriques d'Arial, la remplace). */
const NARROW_RATIO = 0.82;

/**
 * Prépare un SVG produit par LibreOffice pour être intégré dans la page :
 * - recadre le viewBox sur l'objet (LibreOffice le centre sur une page A4) ;
 * - supprime les polices SVG embarquées (non gérées par les navigateurs) ;
 * - compresse horizontalement les textes en Arial Narrow, police rarement
 *   disponible, rendue avec Arimo : chaque fragment garde sa position de départ ;
 * - préfixe les identifiants pour pouvoir afficher plusieurs SVG dans une page.
 */
export function cleanSvg(svg: string, prefix: string): string {
  const graphicAt = svg.indexOf('<g class="Graphic">');
  const bound = /<rect class="BoundingBox"[^>]*?x="(-?[\d.]+)" y="(-?[\d.]+)" width="([\d.]+)" height="([\d.]+)"/.exec(
    graphicAt >= 0 ? svg.slice(graphicAt) : svg,
  );
  let out = svg
    .replace(/<\?xml[^>]*>\s*/, '')
    .replace(/<!DOCTYPE[^>]*>\s*/, '')
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<font[\s>][\s\S]*?<\/font>/g, '')
    .replace(/<defs class="EmbeddedBulletChars">[\s\S]*?<\/defs>/, '')
    .replace(/<defs class="TextShapeIndex">[\s\S]*?<\/defs>/, '');
  if (bound) {
    const [, x, y, w, h] = bound;
    out = out
      .replace(/<svg([^>]*?) width="[^"]*" height="[^"]*"/, '<svg$1')
      .replace(/viewBox="[^"]*"/, `viewBox="${x} ${y} ${w} ${h}"`)
      .replace(/preserveAspectRatio="[^"]*"/, 'preserveAspectRatio="none"');
  }
  out = out.replace(/<text([^>]*)>([\s\S]*?)<\/text>/g, (whole, attrs: string, body: string) => {
    if (!/Narrow/i.test(body)) return whole;
    const x = Number(/x="(-?[\d.]+)"/.exec(body)?.[1] ?? 0);
    const k = NARROW_RATIO;
    return `<text${attrs} transform="matrix(${k} 0 0 1 ${+(x * (1 - k)).toFixed(1)} 0)">${body}</text>`;
  });
  out = out
    .replace(/font-family="[^"]*"/g, 'font-family="Arimo, Arial, sans-serif"')
    .replace(/ id="([^"]+)"/g, ` id="${prefix}-$1"`)
    .replace(/url\(#([^)]+)\)/g, `url(#${prefix}-$1)`)
    .replace(/href="#([^"]+)"/g, `href="#${prefix}-$1"`);
  return out;
}
