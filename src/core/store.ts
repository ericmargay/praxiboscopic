// Tienda reactiva mínima: un único estado (el proyecto), parches inmutables y suscripciones con selector.
// Es el hilo que une Animation Studio, Mechanical Simulation y Projection Laboratory: todos leen el mismo
// `Project` y cualquier cambio (animación, fotogramas, película, mecánica, óptica) notifica a quien lo mire.
// Sin dependencias; corre en Node para las pruebas.

export type Listener<T> = (value: T, previous: T) => void;
export type Unsubscribe = () => void;

export interface Store<S> {
  get(): S;
  /** reemplaza el estado completo */
  set(next: S): void;
  /** parche superficial */
  patch(partial: Partial<S>): void;
  /** actualización funcional (debe devolver un objeto nuevo; no mutar el anterior) */
  update(fn: (s: S) => S): void;
  /** se dispara cuando `select(state)` cambia (comparación `Object.is` o `equals`) */
  subscribe<T>(select: (s: S) => T, listener: Listener<T>, equals?: (a: T, b: T) => boolean): Unsubscribe;
  /** se dispara en cada cambio de estado */
  onChange(listener: Listener<S>): Unsubscribe;
  /** agrupa varios cambios en una sola notificación */
  batch(fn: () => void): void;
}

export function createStore<S>(initial: S): Store<S> {
  let state = initial;
  let depth = 0;
  let pendingPrevious: S | null = null;
  const listeners = new Set<{ select: (s: S) => unknown; equals: (a: unknown, b: unknown) => boolean; last: unknown; fn: Listener<unknown> }>();
  const raw = new Set<Listener<S>>();

  const notify = (previous: S) => {
    for (const l of raw) l(state, previous);
    for (const l of listeners) {
      const next = l.select(state);
      if (!l.equals(l.last, next)) {
        const prev = l.last;
        l.last = next;
        l.fn(next, prev);
      }
    }
  };

  const commit = (next: S) => {
    if (Object.is(next, state)) return;
    const previous = state;
    state = next;
    if (depth > 0) {
      pendingPrevious ??= previous;
      return;
    }
    notify(previous);
  };

  return {
    get: () => state,
    set: (next) => commit(next),
    patch: (partial) => commit({ ...state, ...partial }),
    update: (fn) => commit(fn(state)),
    subscribe(select, listener, equals = Object.is) {
      const entry = { select, equals: equals as (a: unknown, b: unknown) => boolean, last: select(state) as unknown, fn: listener as Listener<unknown> };
      listeners.add(entry);
      return () => {
        listeners.delete(entry);
      };
    },
    onChange(listener) {
      raw.add(listener);
      return () => {
        raw.delete(listener);
      };
    },
    batch(fn) {
      depth++;
      try {
        fn();
      } finally {
        depth--;
        if (depth === 0 && pendingPrevious !== null) {
          const prev = pendingPrevious;
          pendingPrevious = null;
          notify(prev);
        }
      }
    },
  };
}

/** Igualdad superficial de objetos planos (para selectores que devuelven objetos derivados). */
export function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (!Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) return false;
  return true;
}
