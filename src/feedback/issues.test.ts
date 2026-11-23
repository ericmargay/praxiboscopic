import { describe, expect, it } from 'vitest';
import { FEEDBACK, GENERAL, fetchIssues, fetchReplies, issueBody, issueTitle, marker, newIssueUrl, openCounts, parseIssue, parseMarker, pieceKey, pieceLabel, plainText, viewUrl, type FeedbackDraft, type RawIssue, bitacoraSources, fetchBitacora, mergeIssues, parseBitacora, photoUrl } from './issues';

const draft: FeedbackDraft = { piece: 'E05', label: 'E05 Collar del motor', kind: 'falla', text: 'El motor no entra con la torre puesta:\nel conector no pasa.', sel: 'E05-1', step: 2, explode: 0.6, query: { demo: 'tambores' } };

describe('comentarios sobre las piezas como issues de GitHub (ADR-0014)', () => {
  it('la pieza de un comentario es su código de corte o impresión, y si no lo tiene, su id en la escena', () => {
    expect(pieceKey({ id: 'E05-1', name: 'E05 Collar del motor (1 de 2)' })).toBe('E05');
    expect(pieceKey({ id: 'E01', name: 'E01 Piso' })).toBe('E01');
    expect(pieceKey({ id: 'I07-g1', name: 'I07 Tapón de eje · arriba de la guía 1' })).toBe('I07');
    // el capuchón lleva su código en el nombre, no en el id
    expect(pieceKey({ id: 'hood-2', name: 'I10 Capuchón del sensor 2' })).toBe('I10');
    expect(pieceKey({ id: 'motor-1', name: 'Motor 1 · NEMA 17 17HS8401' })).toBe('motor-1');
    expect(pieceKey({ id: 'esp32', name: 'ESP32 DevKit' })).toBe('esp32');
    expect(pieceLabel({ id: 'E05-1', name: 'E05 Collar del motor (1 de 2)' })).toBe('E05 Collar del motor');
    expect(pieceLabel({ id: 'I01-2', name: 'I01 Núcleo del tambor · tambor 2' })).toBe('I01 Núcleo del tambor');
    expect(pieceLabel({ id: 'motor-1', name: 'Motor 1 · NEMA 17 17HS8401' })).toBe('Motor 1 · NEMA 17 17HS8401');
  });

  it('el issue nuevo lleva la pieza, el tipo, el paso y el enlace a la vista, y vuelve a leerse igual', () => {
    expect(issueTitle(draft)).toBe('[E05 Collar del motor] El motor no entra con la torre puesta: el conector no pasa.');
    expect(issueTitle({ ...draft, text: 'x'.repeat(200) }).length).toBeLessThanOrEqual('[E05 Collar del motor] '.length + 70);
    const body = issueBody(draft);
    expect(body.startsWith(draft.text)).toBe(true);
    expect(body).toContain('**Pieza:** E05 Collar del motor (`E05`) · **Tipo:** Falla · **Paso del ensamble:** 2');
    expect(body).toContain(`[Ver en el visor](${FEEDBACK.site}?demo=tambores&section=mechanical&sel=E05-1&ensamble=2&explosion=0.6)`);
    expect(parseMarker(body)).toEqual({ piece: 'E05', kind: 'falla', step: 2, sel: 'E05-1' });
    const url = new URL(newIssueUrl(draft));
    expect(url.origin + url.pathname).toBe(`https://github.com/${FEEDBACK.repo}/issues/new`);
    expect(url.searchParams.get('title')).toBe(issueTitle(draft));
    expect(url.searchParams.get('body')).toBe(body);
    expect(url.searchParams.get('labels')).toBe('visor-3d,falla');
    // sin paso, el enlace abre la mesa armada
    expect(viewUrl({ sel: 'motor-1', query: {} })).toBe(`${FEEDBACK.site}?section=mechanical&sel=motor-1`);
  });

  it('la marca no deja pasar nada que rompa el comentario oculto', () => {
    const m = marker({ piece: 'E05" --> <script>', kind: 'nota', sel: 'x-->y' });
    expect(m.match(/-->/g)).toHaveLength(1);
    expect(m).not.toContain('<script');
    expect(parseMarker('sin marca')).toEqual({});
    expect(parseMarker('<!-- praxiboscopic pieza="I01" tipo="otro" paso="cero" -->')).toEqual({ piece: 'I01', kind: undefined, step: undefined, sel: undefined });
  });

  const raw = (over: Partial<RawIssue>): RawIssue => ({ number: 4, title: '[E05 Collar del motor] El motor no entra', state: 'open', html_url: `https://github.com/${FEEDBACK.repo}/issues/4`, body: issueBody(draft), user: { login: 'ericmargay' }, created_at: '2026-11-22T18:00:00Z', comments: 2, ...over });

  it('un issue de la API se lee como comentario de su pieza', () => {
    const f = parseIssue(raw({}))!;
    expect(f).toMatchObject({ number: 4, title: 'El motor no entra', open: true, piece: 'E05', kind: 'falla', step: 2, sel: 'E05-1', author: 'ericmargay', replies: 2, text: draft.text });
    // los pull requests no son comentarios
    expect(parseIssue(raw({ pull_request: {} }))).toBeNull();
    // un issue escrito a mano, sin marca, es de la obra completa; el tipo sale de su etiqueta
    const hand = parseIssue(raw({ number: 9, body: 'Texto libre', labels: [{ name: 'mejora' }], state: 'closed', closed_at: '2026-11-23T10:00:00Z' }))!;
    expect(hand).toMatchObject({ piece: GENERAL, kind: 'mejora', open: false, text: 'Texto libre', closedAt: '2026-11-23T10:00:00Z' });
    // el enlace siempre va al repositorio de la obra
    expect(parseIssue(raw({ html_url: 'https://example.com/phish' }))!.url).toBe(`https://github.com/${FEEDBACK.repo}/issues/4`);
  });

  it('lee todos los issues, del más nuevo al más viejo, y cuenta los abiertos por pieza', async () => {
    const calls: string[] = [];
    const items = [raw({ number: 1, created_at: '2026-11-17T10:00:00Z', state: 'closed' }), raw({ number: 2, created_at: '2026-11-22T10:00:00Z' }), raw({ number: 3, created_at: '2026-11-20T10:00:00Z', body: 'general' }), raw({ number: 5, pull_request: {} })];
    const list = await fetchIssues(async (url) => {
      calls.push(url);
      return { ok: true, status: 200, json: async () => items };
    });
    expect(calls).toEqual([`https://api.github.com/repos/${FEEDBACK.repo}/issues?state=all&per_page=100&page=1`]);
    expect(list.map((f) => f.number)).toEqual([2, 3, 1]);
    expect([...openCounts(list)]).toEqual([['E05', 1], [GENERAL, 1]]);
    await expect(fetchIssues(async () => ({ ok: false, status: 403, json: async () => ({}) }))).rejects.toThrow('403');
  });

  it('el Markdown de un issue se muestra como texto llano', () => {
    expect(plainText('**Qué pasó.** El `E05` no deja pasar el conector.\n\n\n\n- [ ] Dibujar la muesca\n- [x] Cambiar el paso\n[foto](https://github.com/x.jpg) ![muesca](https://x/y.png)<!-- oculto -->')).toBe('Qué pasó. El E05 no deja pasar el conector.\n\n☐ Dibujar la muesca\n☑ Cambiar el paso\nfoto (https://github.com/x.jpg) (imagen: muesca)');
  });

  it('las respuestas de un issue llegan como texto', async () => {
    const rs = await fetchReplies(async () => ({ ok: true, status: 200, json: async () => [{ user: { login: 'ericmargay' }, created_at: '2026-11-22T19:00:00Z', body: 'Corté una muesca en el collar.<!-- nota -->' }] }), 4);
    expect(rs).toEqual([{ author: 'ericmargay', createdAt: '2026-11-22T19:00:00Z', text: 'Corté una muesca en el collar.' }]);
  });
  it('el visor de conexiones comenta con sus propios pasos y su propia página', () => {
    const d: FeedbackDraft = { piece: 'dm542-1', label: 'Driver DM542 del motor 1', kind: 'falla', text: 'El LED rojo parpadea al enchufar.', sel: 'dm542-1', step: 4, view: 'electronica' };
    const body = issueBody(d);
    expect(body).toContain('**Paso de las conexiones:** 4');
    expect(body).toContain('(https://ericmargay.github.io/praxiboscopic/electronica.html?paso=4&sel=dm542-1)');
    expect(parseMarker(body)).toEqual({ piece: 'dm542-1', kind: 'falla', step: 4, sel: 'dm542-1', view: 'electronica' });
    // sin vista, el paso es del ensamble
    expect(parseMarker(issueBody({ ...d, view: undefined })).view).toBeUndefined();
  });

  it('la bitácora trae cada comentario con sus respuestas y sus fotos (ADR-0016)', async () => {
    const raw = {
      version: 1,
      updatedAt: '2026-11-22T22:13:40Z',
      issues: [
        {
          number: 5,
          title: '[E05 Collar del motor] El motor no entra con la torre puesta',
          state: 'open',
          html_url: 'https://github.com/ericmargay/praxiboscopic/issues/5',
          user: { login: 'ericmargay' },
          created_at: '2026-11-22T21:00:00Z',
          updated_at: '2026-11-22T22:00:00Z',
          comments: 2,
          body: `El conector no pasa.\n\n---\n**Pieza:** E05 · **Tipo:** Falla · **Paso del ensamble:** 2\n\n${marker({ piece: 'E05', kind: 'falla', step: 2, sel: 'E05-1' })}`,
          replies: [{ user: { login: 'ericmargay' }, created_at: '2026-11-22T21:30:00Z', body: 'Corté una **muesca** en el collar.' }],
          photos: [
            { file: 'fotos/5-muesca del collar.jpg', caption: 'muesca del collar' },
            { file: 'fotos/../../secreto.png', caption: 'no' },
            { file: 'https://otro.sitio/x.jpg', caption: 'no' },
            { file: 'fotos/5/nota.svg', caption: 'no es foto' },
          ],
        },
      ],
    };
    const db = parseBitacora(raw)!;
    expect(db.updatedAt).toBe('2026-11-22T22:13:40Z');
    const f = db.issues[0];
    expect(f.piece).toBe('E05');
    expect(f.thread).toEqual([{ author: 'ericmargay', createdAt: '2026-11-22T21:30:00Z', text: 'Corté una muesca en el collar.' }]);
    // solo las fotos que se quedan dentro de bitacora/fotos/
    expect(f.photos).toEqual([{ file: 'fotos/5-muesca del collar.jpg', caption: 'muesca del collar' }]);
    expect(photoUrl('bitacora/', f.photos![0].file)).toBe('bitacora/fotos/5-muesca%20del%20collar.jpg');
    expect(parseBitacora({ version: 2, issues: [] })).toBeNull();
    expect(parseBitacora('nada')).toBeNull();

    // en el sitio: primero la copia viva del repositorio y luego la publicada; en la computadora, la del árbol de trabajo
    expect(bitacoraSources(false, 'master').map((x) => x.url)).toEqual(['https://raw.githubusercontent.com/ericmargay/praxiboscopic/master/bitacora/bitacora.json', 'bitacora/bitacora.json']);
    expect(bitacoraSources(true, 'master')).toEqual([{ url: 'bitacora/bitacora.json', base: 'bitacora/' }]);
    const seen: string[] = [];
    const got = await fetchBitacora(async (url) => {
      seen.push(url);
      return url.startsWith('https://raw') ? { ok: false, status: 404, json: async () => ({}) } : { ok: true, status: 200, json: async () => raw };
    }, bitacoraSources(false, 'master'));
    expect(seen).toHaveLength(2);
    expect(got.base).toBe('bitacora/');

    // con GitHub: manda lo que diga ahora; la bitácora pone las fotos, y las respuestas solo si el issue no cambió
    const same = { ...f, thread: undefined, photos: undefined, open: false };
    const merged = mergeIssues(db.issues, [same]);
    expect(merged[0].open).toBe(false);
    expect(merged[0].photos).toHaveLength(1);
    expect(merged[0].thread).toHaveLength(1);
    expect(mergeIssues(db.issues, [{ ...same, updatedAt: '2026-11-23T08:00:00Z' }])[0].thread).toBeUndefined();
    const fresh = { ...same, number: 9 };
    expect(mergeIssues(db.issues, [fresh])[0]).toBe(fresh);
  });
});
