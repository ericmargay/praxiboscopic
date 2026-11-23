// Comentarios sobre las piezas del visor (ADR-0014): lee los issues de GitHub de la obra, los muestra sobre la pieza de
// la que hablan y arma el issue nuevo ya escrito. Todo el texto de un issue se pinta como texto, nunca como HTML: lo
// puede escribir cualquiera.
import { button, el, group } from '../controls';
import { GENERAL, KIND_HINT, KIND_LABEL, bitacoraSources, fetchBitacora, fetchIssues, fetchReplies, issuesUrl, mergeIssues, newIssueUrl, photoUrl, pieceKey, pieceLabel, type FeedbackIssue, type FeedbackKind, type FeedbackReply, type FeedbackViewer, type PieceRef } from '../../feedback/issues';

/** lo que se estaba viendo al comentar: va en el enlace del issue */
export interface FeedbackView {
  step: number | null;
  explode: number;
  /** parámetros de la obra abierta (demo, video…) */
  query: Record<string, string>;
  /** el visor de conexiones comenta con sus propios pasos */
  view?: FeedbackViewer;
}

export interface FeedbackUi {
  /** lee los issues (de la sesión si son recientes; `force` consulta a GitHub) */
  load(force?: boolean): void;
  /** cambia cada vez que llega una lista nueva: sirve de llave para repintar */
  version(): number;
  /** comentarios abiertos de una pieza */
  count(n: PieceRef): number;
  /** sección del panel de la pieza seleccionada: su hilo y el formulario */
  section(n: PieceRef, view: () => FeedbackView): HTMLElement;
  /** grupo del panel lateral: los comentarios abiertos, por pieza */
  overview(pieces: PieceRef[], view: () => FeedbackView, onGo: (id: string) => void): HTMLElement;
  /** lo reportado en un paso del ensamble, o de otro visor (nulo si no hay nada) */
  stepList(step: number, view?: FeedbackViewer): HTMLElement | null;
}

/** rama desde la que se compiló el sitio (vite.config.ts): ahí vive la copia viva de la bitácora */
declare const __BITACORA_REF__: string | undefined;
const BITACORA_REF = typeof __BITACORA_REF__ === 'string' && __BITACORA_REF__ ? __BITACORA_REF__ : 'master';
const CACHE_KEY = 'praxi-feedback-2';
const CACHE_MS = 120_000;
const KINDS = Object.keys(KIND_LABEL) as FeedbackKind[];
const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
};
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function createFeedback(onChange: () => void): FeedbackUi {
  let list: FeedbackIssue[] = [];
  let status: 'idle' | 'loading' | 'ok' | 'error' = 'idle';
  let ver = 0;
  let showClosed = false;
  // de dónde cuelgan las fotos (la bitácora que se leyó) y si GitHub no respondió y solo se ve lo guardado en ella
  let photoBase = 'bitacora/';
  let stale: string | null | false = false;
  const drafts = new Map<string, { kind: FeedbackKind; text: string }>();
  const replies = new Map<number, FeedbackReply[]>();
  // tras abrir GitHub: al volver a esta pestaña se vuelve a leer, y si el issue ya existe se limpia el borrador
  let pending: { key: string; before: number } | null = null;
  const fetchImpl = (url: string, init?: RequestInit) => fetch(url, init);

  const countKey = (key: string, all = false) => list.filter((f) => f.piece === key && (all || f.open)).length;
  function apply(next: FeedbackIssue[]): void {
    list = next;
    status = 'ok';
    ver++;
    if (pending && countKey(pending.key, true) > pending.before) {
      drafts.delete(pending.key);
      pending = null;
    }
    onChange();
  }
  function load(force = false): void {
    if (status === 'loading') return;
    if (!force) {
      if (status === 'ok') return;
      try {
        const c = JSON.parse(sessionStorage.getItem(CACHE_KEY) ?? 'null') as { t: number; list: FeedbackIssue[]; base?: string } | null;
        if (c && Date.now() - c.t < CACHE_MS && Array.isArray(c.list)) {
          if (typeof c.base === 'string') photoBase = c.base;
          return apply(c.list);
        }
      } catch {
        /* sin caché */
      }
    }
    status = 'loading';
    onChange();
    // primero la bitácora del repositorio (respuestas y fotos, sin límite de consultas); encima, lo que diga GitHub ahora
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
    const db = fetchBitacora(fetchImpl, bitacoraSources(local, BITACORA_REF)).catch(() => null);
    void Promise.all([db, fetchIssues(fetchImpl).catch(() => null)]).then(([b, live]) => {
      if (!b && !live) {
        status = 'error';
        ver++;
        return onChange();
      }
      if (b) photoBase = b.base;
      stale = live ? false : (b?.updatedAt ?? null);
      const next = live ? (b ? mergeIssues(b.issues, live) : live) : b!.issues;
      try {
        if (live) sessionStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), list: next, base: photoBase }));
      } catch {
        /* sin caché */
      }
      replies.clear();
      apply(next);
    });
  }
  window.addEventListener('focus', () => {
    if (pending) load(true);
  });

  const chip = (cls: string, text: string, title?: string) => el('span', { class: `fb-chip ${cls}`, text, title });
  const statusLine = (): HTMLElement | null =>
    status === 'loading'
      ? el('p', { class: 'hint', text: 'Leyendo los comentarios en GitHub…' })
      : status === 'error'
        ? el('p', { class: 'hint warn' }, 'No se pudieron leer los comentarios (sin conexión, o GitHub pide esperar). ', el('a', { href: issuesUrl(), target: '_blank', rel: 'noopener', text: 'Verlos en GitHub ↗' }))
        : stale !== false
          ? el('p', { class: 'hint warn', text: `GitHub no respondió: esto es lo guardado en la bitácora${stale ? ` el ${when(stale)}` : ''}.` })
          : null;

  /** un comentario: tipo, estado, título, quién y cuándo; al abrirlo, el texto y las respuestas */
  function entry(f: FeedbackIssue, piece?: { label: string; go?: () => void }): HTMLElement {
    const box = el('div', { class: 'fb-replies' });
    // con las respuestas ya en la bitácora no hace falta pedirlas
    const count = f.thread ? f.thread.length : f.replies;
    const paint = () => {
      const rs = f.thread ?? replies.get(f.number);
      box.replaceChildren(...(rs ?? []).map((r) => el('div', { class: 'fb-reply' }, el('div', { class: 'hint', text: `${r.author} · ${when(r.createdAt)}` }), el('p', { class: 'fb-text', text: r.text }))));
    };
    paint();
    const more = el('details', { class: 'fb-more' }, el('summary', { text: count ? `Leer el comentario y ${plural(count, 'respuesta', 'respuestas')}` : 'Leer el comentario' }), el('p', { class: 'fb-text', text: f.text || '(sin texto)' }), box) as HTMLDetailsElement;
    more.addEventListener('toggle', () => {
      if (!more.open || f.thread || !f.replies || replies.has(f.number)) return;
      box.replaceChildren(el('p', { class: 'hint', text: 'Leyendo las respuestas…' }));
      fetchReplies(fetchImpl, f.number)
        .then((rs) => {
          replies.set(f.number, rs);
          paint();
        })
        .catch(() => box.replaceChildren(el('p', { class: 'hint warn', text: 'No se pudieron leer las respuestas: ábrelo en GitHub.' })));
    });
    const meta = [f.author, when(f.createdAt), f.step ? (f.view === 'electronica' ? `conexiones, paso ${f.step}` : `paso ${f.step}`) : '', !f.open && f.closedAt ? `resuelto el ${when(f.closedAt)}` : ''].filter(Boolean).join(' · ');
    const where = piece ? (piece.go ? el('button', { class: 'fb-go', type: 'button', text: `${piece.label} →`, title: 'Seleccionar la pieza en el visor' }) : el('span', { class: 'fb-where', text: piece.label })) : null;
    if (where && piece?.go) (where as HTMLButtonElement).onclick = piece.go;
    return el(
      'div',
      { class: `fb-item ${f.open ? 'open' : 'closed'}` },
      el('div', { class: 'fb-h' }, f.kind ? chip(`k-${f.kind}`, KIND_LABEL[f.kind]) : null, chip(f.open ? 's-open' : 's-closed', f.open ? 'Abierto' : 'Resuelto'), el('a', { class: 'fb-n', href: f.url, target: '_blank', rel: 'noopener', text: `#${f.number} ↗`, title: 'Abrir en GitHub: ahí se responde y se cierra' })),
      where,
      el('div', { class: 'fb-t', text: f.title }),
      el('div', { class: 'hint', text: meta }),
      f.photos?.length
        ? el(
            'div',
            { class: 'fb-photos' },
            ...f.photos.map((p) => {
              const url = photoUrl(photoBase, p.file);
              return el('a', { class: 'fb-photo', href: url, target: '_blank', rel: 'noopener', title: p.caption || 'Abrir la foto' }, el('img', { src: url, alt: p.caption || `Foto del comentario ${f.number}`, loading: 'lazy' }));
            }),
          )
        : null,
      more,
    );
  }

  /** el formulario: tipo, texto y el botón que abre GitHub con el issue ya escrito */
  function composer(key: string, label: string, sel: string | undefined, view: () => FeedbackView, summary: string): HTMLElement {
    const draft = drafts.get(key) ?? { kind: 'falla' as FeedbackKind, text: '' };
    const save = () => drafts.set(key, draft);
    const kinds = el('div', { class: 'fb-kinds', role: 'radiogroup' });
    for (const k of KINDS) {
      const b = el('button', { class: `fb-chip k-${k}`, type: 'button', text: KIND_LABEL[k], title: KIND_HINT[k], 'aria-pressed': String(draft.kind === k) }) as HTMLButtonElement;
      b.onclick = () => {
        draft.kind = k;
        save();
        for (const x of kinds.children) x.setAttribute('aria-pressed', String(x === b));
      };
      kinds.append(b);
    }
    const text = el('textarea', { class: 'fb-input', rows: 4, placeholder: '¿Qué pasó o qué debería cambiar? Concreto: qué parte, qué viste, qué esperabas y cómo lo resolviste si ya lo hiciste.' }) as HTMLTextAreaElement;
    text.value = draft.text;
    text.oninput = () => {
      draft.text = text.value;
      save();
    };
    const send = button('Abrir issue en GitHub ↗', () => {
      if (!draft.text.trim()) return text.focus();
      pending = { key, before: countKey(key, true) };
      const v = view();
      window.open(newIssueUrl({ piece: key, label, kind: draft.kind, text: draft.text, sel, step: v.step ?? undefined, explode: v.explode, query: v.query, view: v.view }), '_blank', 'noopener');
    }, { kind: 'primary', title: 'Un issue nuevo en el repositorio de la obra, con este comentario ya escrito' });
    return el(
      'details',
      { class: 'fb-compose', open: draft.text.length > 0 },
      el('summary', { text: summary }),
      kinds,
      text,
      el('div', { class: 'btn-row' }, send),
      el('p', { class: 'hint', text: 'Se abre GitHub con el comentario ya escrito: ahí lo publicas con tu cuenta y puedes arrastrar fotos. Las respuestas y el cierre también son allá; aquí se ven al volver.' }),
    );
  }

  return {
    load,
    version: () => ver,
    count: (n) => countKey(pieceKey(n)),
    section(n, view) {
      const key = pieceKey(n);
      const mine = list.filter((f) => f.piece === key);
      const open = mine.filter((f) => f.open);
      const closed = mine.length - open.length;
      const toggle = closed ? (el('button', { class: 'fb-link', type: 'button', text: showClosed ? 'Solo los abiertos' : `Ver también ${plural(closed, 'el resuelto', 'los resueltos')}` }) as HTMLButtonElement) : null;
      if (toggle)
        toggle.onclick = () => {
          showClosed = !showClosed;
          onChange();
        };
      return el(
        'section',
        { class: 'sp-sec fb' },
        el('h4', {}, 'Comentarios', open.length ? chip('s-open', plural(open.length, 'abierto', 'abiertos')) : null),
        statusLine(),
        ...(showClosed ? mine : open).map((f) => entry(f)),
        status === 'ok' && !mine.length ? el('p', { class: 'hint', text: 'Nadie ha comentado esta pieza.' }) : null,
        toggle,
        composer(key, pieceLabel(n), n.id, view, 'Comentar esta pieza'),
      );
    },
    overview(pieces, view, onGo) {
      const open = list.filter((f) => f.open);
      const closed = list.length - open.length;
      const byKey = new Map<string, PieceRef>();
      for (const n of pieces) if (!byKey.has(pieceKey(n))) byKey.set(pieceKey(n), n);
      const byId = new Map(pieces.map((n) => [n.id, n]));
      const where = (f: FeedbackIssue) => {
        if (f.piece === GENERAL) return { label: 'La obra completa' };
        // la pieza exacta desde la que se comentó, si sigue en la escena; si no, la primera con ese código
        const n = (f.sel ? byId.get(f.sel) : undefined) ?? byKey.get(f.piece);
        return { label: n ? pieceLabel(n) : (f.pieceName ?? f.piece), go: n ? () => onGo(n.id) : undefined };
      };
      const refresh = button('Actualizar', () => load(true), { kind: 'ghost', title: 'Vuelve a leer los comentarios en GitHub' });
      return group(
        `Comentarios${open.length ? ` · ${plural(open.length, 'abierto', 'abiertos')}` : ''}`,
        [
          el('p', { class: 'hint', text: 'Lo que se va encontrando al armar y cómo se resolvió. Selecciona una pieza para comentarla: el comentario se abre como issue en GitHub y aquí queda sobre la pieza.' }),
          statusLine(),
          ...open.map((f) => entry(f, where(f))),
          status === 'ok' && !open.length ? el('p', { class: 'hint', text: 'No hay comentarios abiertos.' }) : null,
          el('div', { class: 'btn-row fb-foot' }, refresh, el('a', { class: 'btn btn-ghost', href: issuesUrl(), target: '_blank', rel: 'noopener', text: 'Todos en GitHub ↗' }), closed ? el('a', { class: 'btn btn-ghost', href: issuesUrl(undefined, true), target: '_blank', rel: 'noopener', text: `${plural(closed, 'resuelto', 'resueltos')} ↗` }) : null),
          composer(GENERAL, 'General', undefined, view, 'Comentar la obra en general'),
        ],
        { open: open.length > 0 },
      );
    },
    stepList(step, view) {
      const mine = list.filter((f) => f.step === step && f.view === view);
      if (!mine.length) return null;
      return el('div', { class: 'fb fb-step' }, el('p', { class: 'hint', text: 'Reportado en este paso:' }), ...mine.map((f) => entry(f)));
    },
  };
}
