// Comentarios sobre las piezas del visor (ADR-0014). Cada comentario es un issue de GitHub del repositorio de la obra:
// el visor arma el issue ya escrito (pieza, tipo, paso del ensamble y enlace a la vista) y lee los que existen para
// mostrarlos sobre la pieza de la que hablan. No hay servidor propio: el hilo, las respuestas y el cierre viven en GitHub.
// Este archivo no toca el DOM ni la red salvo `fetchIssues` y `fetchReplies`, que reciben su `fetch`.

export const FEEDBACK = {
  /** repositorio público de la obra: ahí se abren y se leen los issues */
  repo: 'ericmargay/praxiboscopic',
  /** sitio publicado: los enlaces «ver en el visor» de los issues apuntan aquí aunque se escriban desde otra copia */
  site: 'https://ericmargay.github.io/praxiboscopic/',
  /** etiqueta de todo lo que sale del visor (GitHub solo la aplica si quien abre el issue puede etiquetar) */
  label: 'visor-3d',
} as const;

export type FeedbackKind = 'falla' | 'mejora' | 'pregunta' | 'nota';
export const KIND_LABEL: Record<FeedbackKind, string> = { falla: 'Falla', mejora: 'Mejora', pregunta: 'Pregunta', nota: 'Nota' };
export const KIND_HINT: Record<FeedbackKind, string> = {
  falla: 'Algo no encajó, no funcionó o se rompió',
  mejora: 'Funciona, pero se puede hacer mejor',
  pregunta: 'Una duda sobre la pieza o el paso',
  nota: 'Algo que conviene dejar anotado',
};
const KINDS = Object.keys(KIND_LABEL) as FeedbackKind[];
/** sin pieza: el comentario es de la obra completa */
export const GENERAL = 'general';

/** lo mínimo de una pieza del visor para comentarla */
export interface PieceRef {
  id: string;
  name: string;
}

/**
 * De qué pieza habla un comentario: el código de corte o impresión (E05, I01) si la pieza lo lleva en su id o al
 * principio de su nombre, para que el comentario salga en todas sus copias; si no, el id de la pieza en la escena.
 */
export function pieceKey(n: PieceRef): string {
  const code = /^([EANI]\d{2})(?:-|$)/.exec(n.id) ?? /^([EANI]\d{2})\b/.exec(n.name);
  return code ? code[1] : n.id;
}

/** «E05 Collar del motor»: el nombre sin el número de copia ni el lugar donde va */
export function pieceLabel(n: PieceRef): string {
  if (pieceKey(n) === n.id && !/^[EANI]\d{2}\b/.test(n.name)) return n.name;
  return n.name.replace(/\s*\(\d+ de \d+\)$/, '').replace(/\s+·\s.*$/, '');
}

export interface FeedbackDraft {
  /** clave de la pieza (`pieceKey`) o `GENERAL` */
  piece: string;
  /** nombre legible de la pieza */
  label: string;
  kind: FeedbackKind;
  text: string;
  /** id de la pieza en la escena, para el enlace */
  sel?: string;
  /** paso del ensamble que se estaba viendo */
  step?: number;
  explode?: number;
  /** parámetros de la obra abierta (demo, video…) que el enlace debe conservar */
  query?: Record<string, string>;
  /** desde qué visor se comenta: el de conexiones (ADR-0015) tiene sus propios pasos y su propia página */
  view?: FeedbackViewer;
}

export type FeedbackViewer = 'electronica';

const clean = (s: string) => s.replace(/[^\p{L}\p{N} .:+_-]/gu, '').trim();
const short = (s: string, n: number) => {
  const one = s.replace(/\s+/g, ' ').trim();
  return one.length > n ? `${one.slice(0, n - 1).trimEnd()}…` : one;
};

/** enlace al visor con la pieza seleccionada y el paso del ensamble en que se comentó */
export function viewUrl(d: Pick<FeedbackDraft, 'sel' | 'step' | 'explode' | 'query' | 'view'>, site: string = FEEDBACK.site): string {
  if (d.view === 'electronica') {
    const e = new URLSearchParams();
    if (d.step) e.set('paso', String(d.step));
    if (d.sel) e.set('sel', d.sel);
    const s = e.toString();
    return `${site}electronica.html${s ? `?${s}` : ''}`;
  }
  const q = new URLSearchParams(d.query ?? {});
  q.set('section', 'mechanical');
  if (d.sel) q.set('sel', d.sel);
  if (d.step) {
    q.set('ensamble', String(d.step));
    q.set('explosion', String(Math.round((d.explode ?? 0) * 100) / 100));
  }
  return `${site}?${q.toString()}`;
}

export function issueTitle(d: FeedbackDraft): string {
  return `[${d.piece === GENERAL ? 'General' : d.label}] ${short(d.text, 70)}`;
}

/** la marca que el visor lee de vuelta: va oculta al final del issue */
export function marker(d: Pick<FeedbackDraft, 'piece' | 'kind' | 'step' | 'sel' | 'view'>): string {
  const attrs = [`pieza="${clean(d.piece)}"`, `tipo="${d.kind}"`, ...(d.view ? [`vista="${d.view}"`] : []), ...(d.step ? [`paso="${d.step}"`] : []), ...(d.sel ? [`sel="${clean(d.sel)}"`] : [])];
  return `<!-- praxiboscopic ${attrs.join(' ')} -->`;
}

export function issueBody(d: FeedbackDraft, site: string = FEEDBACK.site): string {
  const where = d.piece === GENERAL ? 'La obra completa' : `${d.label} (\`${clean(d.piece)}\`)`;
  return [
    d.text.trim(),
    '',
    '---',
    `**Pieza:** ${where} · **Tipo:** ${KIND_LABEL[d.kind]}${d.step ? ` · **Paso ${d.view === 'electronica' ? 'de las conexiones' : 'del ensamble'}:** ${d.step}` : ''}`,
    `[Ver en el visor](${viewUrl(d, site)})`,
    '',
    marker(d),
  ].join('\n');
}

/** GitHub abre el formulario de issue nuevo con el título, el texto y las etiquetas ya puestos */
export function newIssueUrl(d: FeedbackDraft, repo: string = FEEDBACK.repo, site: string = FEEDBACK.site): string {
  const q = new URLSearchParams({ title: issueTitle(d), body: issueBody(d, site), labels: [FEEDBACK.label, d.kind].join(',') });
  return `https://github.com/${repo}/issues/new?${q.toString()}`;
}

export const issuesUrl = (repo: string = FEEDBACK.repo, closed = false) => `https://github.com/${repo}/issues${closed ? '?q=is%3Aissue+is%3Aclosed' : ''}`;

/** lo que la API de GitHub da de un issue (solo lo que se usa) */
export interface RawIssue {
  number: number;
  title: string;
  state: string;
  html_url: string;
  body?: string | null;
  user?: { login?: string } | null;
  created_at: string;
  closed_at?: string | null;
  comments?: number;
  pull_request?: unknown;
  labels?: ({ name?: string } | string)[];
  updated_at?: string | null;
  /** solo en la bitácora (ADR-0016): las respuestas y las fotos ya vienen con el issue */
  replies?: RawReply[];
  photos?: { file?: unknown; caption?: unknown }[];
}

export interface RawReply {
  user?: { login?: string } | null;
  created_at?: string;
  body?: string | null;
}

/** foto de `bitacora/fotos/` ligada a un comentario por el número de su nombre */
export interface FeedbackPhoto {
  /** ruta dentro de `bitacora/` */
  file: string;
  caption: string;
}

export interface FeedbackIssue {
  number: number;
  title: string;
  open: boolean;
  url: string;
  /** clave de la pieza, o `GENERAL` si el issue no la dice */
  piece: string;
  /** el nombre de la pieza como quedó en el título («E05 Collar del motor»): sirve donde la pieza no está a la vista */
  pieceName?: string;
  kind?: FeedbackKind;
  step?: number;
  sel?: string;
  /** el visor desde el que se comentó, si no fue el del ensamble: su `step` es de ese visor */
  view?: FeedbackViewer;
  author: string;
  createdAt: string;
  closedAt?: string;
  replies: number;
  /** el texto del comentario, sin el pie que agrega el visor */
  text: string;
  updatedAt?: string;
  /** fotos del comentario: solo las trae la bitácora */
  photos?: FeedbackPhoto[];
  /** las respuestas, cuando vienen en la bitácora y siguen al día: así no hay que pedirlas a GitHub */
  thread?: FeedbackReply[];
}

export function parseMarker(body: string): { piece?: string; kind?: FeedbackKind; step?: number; sel?: string; view?: FeedbackViewer } {
  const m = /<!--\s*praxiboscopic\b([^>]*?)-->/.exec(body);
  if (!m) return {};
  const a: Record<string, string> = {};
  for (const x of m[1].matchAll(/(\w+)="([^"]*)"/g)) a[x[1]] = x[2];
  const step = Number(a.paso);
  return {
    piece: a.pieza ? clean(a.pieza) : undefined,
    kind: KINDS.includes(a.tipo as FeedbackKind) ? (a.tipo as FeedbackKind) : undefined,
    step: Number.isInteger(step) && step > 0 ? step : undefined,
    sel: a.sel ? clean(a.sel) : undefined,
    view: a.vista === 'electronica' ? 'electronica' : undefined,
  };
}

/** el Markdown de GitHub como texto llano: el visor nunca pinta HTML ajeno */
export function plainText(md: string): string {
  return md
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '(imagen: $1)')
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '$1 ($2)')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^(\s*)- \[( |x)\] /gim, (_m, sp: string, x: string) => `${sp}${x === ' ' ? '☐' : '☑'} `)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** un issue de la API como comentario del visor; los pull requests no cuentan */
export function parseIssue(raw: RawIssue, repo: string = FEEDBACK.repo): FeedbackIssue | null {
  if (raw.pull_request || !Number.isInteger(raw.number)) return null;
  const body = raw.body ?? '';
  const mk = parseMarker(body);
  const labels = (raw.labels ?? []).map((l) => (typeof l === 'string' ? l : (l.name ?? '')));
  const kind = mk.kind ?? KINDS.find((k) => labels.includes(k));
  // el pie empieza en la regla «---» que pone el visor; sin ella, todo el cuerpo es el comentario
  const cut = body.search(/\n-{3,}\s*\n\*\*Pieza:\*\*/);
  const text = plainText(cut >= 0 ? body.slice(0, cut) : body);
  // solo se enlaza a GitHub: el texto de un issue lo escribe cualquiera
  const url = raw.html_url?.startsWith(`https://github.com/${repo}/issues/`) ? raw.html_url : `https://github.com/${repo}/issues/${raw.number}`;
  return {
    number: raw.number,
    title: String(raw.title ?? '').replace(/^\[[^\]]*\]\s*/, ''),
    open: raw.state === 'open',
    url,
    piece: mk.piece || GENERAL,
    pieceName: mk.piece ? /^\[([^\]]{1,80})\]/.exec(String(raw.title ?? ''))?.[1] : undefined,
    kind,
    step: mk.step,
    sel: mk.sel,
    view: mk.view,
    author: raw.user?.login ?? '—',
    createdAt: raw.created_at,
    closedAt: raw.closed_at ?? undefined,
    replies: raw.comments ?? 0,
    text,
    updatedAt: raw.updated_at ?? undefined,
    photos: Array.isArray(raw.photos) ? raw.photos.map(safePhoto).filter((x): x is FeedbackPhoto => x !== null) : undefined,
    thread: Array.isArray(raw.replies) ? raw.replies.filter((c) => !PHOTO_MARK.test(c.body ?? '')).map(toReply) : undefined,
  };
}

/** la marca de la respuesta con que la acción pone una foto en su issue: no cuenta como respuesta */
const PHOTO_MARK = /<!--\s*praxiboscopic\s+foto="[^"]*"\s*-->/;
const toReply = (c: RawReply): FeedbackReply => ({ author: c.user?.login || '—', createdAt: c.created_at ?? '', text: plainText(c.body ?? '') });

/** una foto de la bitácora, solo si su ruta se queda dentro de `fotos/` y es una imagen */
function safePhoto(p: { file?: unknown; caption?: unknown }): FeedbackPhoto | null {
  const file = typeof p.file === 'string' ? p.file : '';
  if (file.length > 200 || !/^fotos\/[^\\"<>?#]+\.(jpe?g|png|webp|gif)$/i.test(file) || file.split('/').some((seg) => seg === '..' || seg === '.' || seg === '')) return null;
  return { file, caption: typeof p.caption === 'string' ? p.caption.slice(0, 160) : '' };
}

/** dirección de una foto a partir de dónde se leyó la bitácora */
export const photoUrl = (base: string, file: string) => `${base}${file.split('/').map(encodeURIComponent).join('/')}`;

// --- bitácora: el archivo del repositorio con todo lo anterior (ADR-0016) -------------------------------------------------
export interface Bitacora {
  issues: FeedbackIssue[];
  /** fecha del último cambio en los issues cuando se escribió */
  updatedAt: string | null;
  /** de dónde se leyó: las fotos cuelgan de ahí */
  base: string;
}
export interface BitacoraSource {
  url: string;
  base: string;
}

/**
 * Dónde buscar la bitácora: en el sitio publicado, primero la copia viva del repositorio (cambia con cada push, sin
 * volver a publicar) y luego la que se publicó con el sitio; en la computadora, solo la del árbol de trabajo.
 */
export function bitacoraSources(local: boolean, ref: string, repo: string = FEEDBACK.repo): BitacoraSource[] {
  const bundled = { url: 'bitacora/bitacora.json', base: 'bitacora/' };
  const raw = `https://raw.githubusercontent.com/${repo}/${encodeURIComponent(ref)}/bitacora/`;
  return local ? [bundled] : [{ url: `${raw}bitacora.json`, base: raw }, bundled];
}

export function parseBitacora(json: unknown, repo: string = FEEDBACK.repo): { issues: FeedbackIssue[]; updatedAt: string | null } | null {
  const db = json as { version?: unknown; issues?: unknown; updatedAt?: unknown } | null;
  if (!db || db.version !== 1 || !Array.isArray(db.issues)) return null;
  const issues = (db.issues as RawIssue[]).map((it) => parseIssue(it, repo)).filter((x): x is FeedbackIssue => x !== null);
  return { issues: issues.sort((a, b) => b.createdAt.localeCompare(a.createdAt)), updatedAt: typeof db.updatedAt === 'string' ? db.updatedAt : null };
}

export async function fetchBitacora(fetchImpl: FetchLike, sources: BitacoraSource[], repo: string = FEEDBACK.repo): Promise<Bitacora> {
  for (const src of sources) {
    try {
      const r = await fetchImpl(src.url, { cache: 'no-store' });
      if (!r.ok) continue;
      const db = parseBitacora(await r.json(), repo);
      if (db) return { ...db, base: src.base };
    } catch {
      /* la siguiente fuente */
    }
  }
  throw new Error('sin bitácora');
}

/**
 * Lo que dice GitHub ahora, con lo que solo sabe la bitácora: las fotos, y las respuestas si el issue no ha cambiado
 * desde que se escribió.
 */
export function mergeIssues(db: FeedbackIssue[], live: FeedbackIssue[]): FeedbackIssue[] {
  const byNumber = new Map(db.map((d) => [d.number, d]));
  return live.map((l) => {
    const d = byNumber.get(l.number);
    if (!d) return l;
    return { ...l, photos: d.photos, thread: d.updatedAt && d.updatedAt === l.updatedAt ? d.thread : undefined };
  });
}

export type FetchLike = (url: string, init?: { headers?: Record<string, string>; cache?: 'no-store' }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/** todos los issues del repositorio, abiertos y cerrados, del más nuevo al más viejo */
export async function fetchIssues(fetchImpl: FetchLike, repo: string = FEEDBACK.repo): Promise<FeedbackIssue[]> {
  const out: FeedbackIssue[] = [];
  // tres páginas de 100 alcanzan de sobra para una obra; la API pública deja 60 consultas por hora
  for (let page = 1; page <= 3; page++) {
    const r = await fetchImpl(`https://api.github.com/repos/${repo}/issues?state=all&per_page=100&page=${page}`, { headers: { accept: 'application/vnd.github+json' }, cache: 'no-store' });
    if (!r.ok) throw new Error(`GitHub respondió ${r.status}`);
    const items = (await r.json()) as RawIssue[];
    if (!Array.isArray(items)) throw new Error('respuesta inesperada de GitHub');
    for (const it of items) {
      const f = parseIssue(it, repo);
      if (f) out.push(f);
    }
    if (items.length < 100) break;
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export interface FeedbackReply {
  author: string;
  createdAt: string;
  text: string;
}

/** las respuestas de un issue: lo que se hizo y cómo quedó */
export async function fetchReplies(fetchImpl: FetchLike, number: number, repo: string = FEEDBACK.repo): Promise<FeedbackReply[]> {
  const r = await fetchImpl(`https://api.github.com/repos/${repo}/issues/${number}/comments?per_page=50`, { headers: { accept: 'application/vnd.github+json' }, cache: 'no-store' });
  if (!r.ok) throw new Error(`GitHub respondió ${r.status}`);
  const items = (await r.json()) as { user?: { login?: string } | null; created_at?: string; body?: string | null }[];
  return (Array.isArray(items) ? items : []).filter((c) => !PHOTO_MARK.test(c.body ?? '')).map(toReply);
}

/** cuántos comentarios abiertos tiene cada pieza */
export function openCounts(list: FeedbackIssue[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const f of list) if (f.open) m.set(f.piece, (m.get(f.piece) ?? 0) + 1);
  return m;
}
