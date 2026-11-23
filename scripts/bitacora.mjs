#!/usr/bin/env node
// Bitácora de la obra (ADR-0016): la base de datos compartida es un archivo del repositorio, bitacora/bitacora.json.
// Guarda cada comentario (issue de GitHub) con sus respuestas y las fotos de bitacora/fotos/. No hay servidor: lo
// reescribe la acción .github/workflows/bitacora.yml después de cada push, y también `npm run bitacora`.
// Sin dependencias, para que corra en GitHub Actions sin instalar nada.
//
//   node scripts/bitacora.mjs                    lee los issues y las fotos, y reescribe bitacora/bitacora.json
//   node scripts/bitacora.mjs --comentar-fotos   además pone cada foto nueva como respuesta en su issue (pide token)
//   node scripts/bitacora.mjs --sin-red          solo vuelve a listar las fotos; los issues quedan como estaban
//   node scripts/bitacora.mjs --revisar          no escribe: termina con error si el archivo está atrasado
//
// Las fotos se ligan a su issue por el número con que empieza el nombre (5-muesca-del-collar.jpg) o la carpeta (5/).
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? '1']));
const REPO = process.env.GITHUB_REPOSITORY || 'ericmargay/praxiboscopic';
const DIR = path.join(root, 'bitacora');
const OUT = path.join(root, args.get('salida') ?? 'bitacora/bitacora.json');
const PHOTO_EXT = /\.(jpe?g|png|webp|gif)$/i;
/** la marca que deja la acción en la respuesta donde pone una foto: así no la repite */
const photoMark = (file) => `<!-- praxiboscopic foto="${file}" -->`;
const PHOTO_MARK = /<!--\s*praxiboscopic\s+foto="([^"]*)"\s*-->/;
const MAX_POSTS = 10;

const sh = (cmd, argv) => {
  try {
    return execFileSync(cmd, argv, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
};
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || (args.has('sin-red') ? '' : sh('gh', ['auth', 'token']));

async function api(route, init = {}) {
  const r = await fetch(`https://api.github.com${route}`, {
    ...init,
    headers: { accept: 'application/vnd.github+json', 'user-agent': 'praxiboscopic-bitacora', 'x-github-api-version': '2022-11-28', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(init.headers ?? {}) },
  });
  if (!r.ok) throw new Error(`GitHub respondió ${r.status} en ${route}`);
  return r.json();
}
async function pages(route) {
  const out = [];
  for (let page = 1; page <= 20; page++) {
    const items = await api(`${route}${route.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
    if (!Array.isArray(items)) throw new Error(`respuesta inesperada en ${route}`);
    out.push(...items);
    if (items.length < 100) break;
  }
  return out;
}

/** las fotos de bitacora/fotos/, hasta un nivel de carpetas; el número del principio dice de qué issue son */
function listPhotos() {
  const base = path.join(DIR, 'fotos');
  if (!existsSync(base)) return [];
  const out = [];
  const skipped = [];
  const walk = (dir, rel, depth) => {
    for (const name of readdirSync(dir).sort((a, b) => a.localeCompare(b, 'es'))) {
      if (name.startsWith('.')) continue;
      const full = path.join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) {
        if (depth < 1) walk(full, `${rel}${name}/`, depth + 1);
        continue;
      }
      if (name === 'LEEME.md') continue;
      if (!PHOTO_EXT.test(name) || /[\\"<>]/.test(name)) {
        skipped.push(`${rel}${name}`);
        continue;
      }
      const folder = /^(\d+)\/$/.exec(rel)?.[1];
      const m = /^(\d+)(?:[-_ .]+|$)(.*)$/.exec(name.replace(PHOTO_EXT, ''));
      const issue = folder ? Number(folder) : m ? Number(m[1]) : null;
      const rest = (folder || !m ? name.replace(PHOTO_EXT, '') : m[2]).replace(/[-_]+/g, ' ').trim();
      out.push({ file: `fotos/${rel}${name}`, issue, caption: rest, bytes: st.size });
    }
  };
  walk(base, '', 0);
  for (const s of skipped) console.warn(`  (no entra: ${s} · solo JPG, PNG, WEBP o GIF; las HEIC del iPhone hay que exportarlas a JPG)`);
  return out;
}

const fileUrl = (file, ref) => `https://raw.githubusercontent.com/${REPO}/${ref}/bitacora/${file.split('/').map(encodeURIComponent).join('/')}`;

async function main() {
  const photos = listPhotos();
  const before = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
  let prev = null;
  try {
    prev = before ? JSON.parse(before) : null;
  } catch {
    prev = null;
  }

  let issues;
  if (args.has('sin-red')) {
    issues = (prev?.issues ?? []).map((i) => ({ ...i }));
  } else {
    const raw = (await pages(`/repos/${REPO}/issues?state=all`)).filter((i) => !i.pull_request);
    const comments = await pages(`/repos/${REPO}/issues/comments?sort=created&direction=asc`);
    const byIssue = new Map();
    for (const c of comments) {
      const n = Number(/\/issues\/(\d+)$/.exec(c.issue_url ?? '')?.[1]);
      if (n) byIssue.set(n, [...(byIssue.get(n) ?? []), c]);
    }

    // cada foto nueva, como respuesta en su issue: quien lo abre en GitHub la ve ahí
    if (args.has('comentar-fotos')) {
      const sha = process.env.GITHUB_SHA || sh('git', ['rev-parse', 'HEAD']);
      const pushed = !!process.env.GITHUB_ACTIONS || sh('git', ['branch', '-r', '--contains', sha]) !== '';
      if (!token) console.warn('  (sin token: no se ponen las fotos en los issues)');
      else if (!pushed) console.warn('  (este commit todavía no está en GitHub: las fotos se ponen en los issues después del push)');
      else {
        let posted = 0;
        for (const ph of photos) {
          if (ph.issue === null || posted >= MAX_POSTS) continue;
          const issue = raw.find((i) => i.number === ph.issue);
          if (!issue) {
            console.warn(`  (${ph.file}: no existe el issue #${ph.issue})`);
            continue;
          }
          const mine = byIssue.get(ph.issue) ?? [];
          if (mine.some((c) => (c.body ?? '').includes(photoMark(ph.file))) || (issue.body ?? '').includes(photoMark(ph.file))) continue;
          const body = [`![${ph.caption || 'foto'}](${fileUrl(ph.file, sha)})`, '', ph.caption ? `Foto: ${ph.caption}` : 'Foto', '', photoMark(ph.file)].join('\n');
          const made = await api(`/repos/${REPO}/issues/${ph.issue}/comments`, { method: 'POST', body: JSON.stringify({ body }) });
          byIssue.set(ph.issue, [...mine, made]);
          issue.comments = (issue.comments ?? 0) + 1;
          posted++;
          console.log(`  foto en el issue #${ph.issue}: ${ph.file}`);
        }
      }
    }

    issues = raw
      .sort((a, b) => b.number - a.number)
      .map((i) => ({
        number: i.number,
        title: i.title,
        state: i.state,
        html_url: i.html_url,
        user: { login: i.user?.login ?? '' },
        labels: (i.labels ?? []).map((l) => ({ name: typeof l === 'string' ? l : (l.name ?? '') })).sort((a, b) => a.name.localeCompare(b.name)),
        created_at: i.created_at,
        updated_at: i.updated_at,
        closed_at: i.closed_at ?? null,
        comments: i.comments ?? 0,
        body: i.body ?? '',
        // las respuestas que solo traen una foto no cuentan como respuesta: la foto ya va en `photos`
        replies: (byIssue.get(i.number) ?? []).filter((c) => !PHOTO_MARK.test(c.body ?? '')).map((c) => ({ user: { login: c.user?.login ?? '' }, created_at: c.created_at, body: c.body ?? '' })),
      }));
  }
  for (const i of issues) i.photos = photos.filter((p) => p.issue === i.number).map((p) => ({ file: p.file, caption: p.caption }));

  const stamps = issues.map((i) => i.updated_at).filter(Boolean).sort();
  const db = {
    version: 1,
    about: 'Bitácora de Praxiboscopic: comentarios (issues de GitHub), respuestas y fotos. Lo genera scripts/bitacora.mjs; no se edita a mano.',
    repo: REPO,
    // la fecha del último cambio en los issues: el archivo solo cambia si cambió algo
    updatedAt: stamps[stamps.length - 1] ?? null,
    issues,
    photos: photos.map((p) => ({ file: p.file, issue: p.issue, caption: p.caption })),
  };
  const text = `${JSON.stringify(db, null, 2)}\n`;
  const open = issues.filter((i) => i.state === 'open').length;
  const n = (k, one, many) => `${k} ${k === 1 ? one : many}`;
  const summary = `${n(issues.length, 'comentario', 'comentarios')} (${n(open, 'abierto', 'abiertos')}), ${n(issues.reduce((s, i) => s + i.replies.length, 0), 'respuesta', 'respuestas')}, ${n(photos.length, 'foto', 'fotos')}`;
  if (text === before) return console.log(`→ bitácora al día: ${summary}`);
  if (args.has('revisar')) {
    console.error(`✗ bitacora/bitacora.json está atrasado (${summary}): corre npm run bitacora`);
    process.exit(1);
  }
  writeFileSync(OUT, text);
  console.log(`→ ${path.relative(root, OUT)}: ${summary}`);
}

main().catch((e) => {
  console.error(`✗ ${e.message}`);
  process.exit(1);
});
