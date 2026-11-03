# ADR-0004 · Caché incremental de fotogramas por hash

**Contexto.** Al editar la animación deben actualizarse los fotogramas, la película, la cinta 3D y la proyección, y
el encargo pide regeneración eficiente e incremental.

**Decisión.** `FrameGenerator` calcula para cada fotograma un hash FNV de todo lo que lo determina: documento (capas,
lienzo, fondo, loop, duración), instante t_i, índice, ediciones y reemplazo de ese fotograma, y los ajustes globales
(resolución, color, orientación, fondo). Un fotograma con el mismo hash sale de la caché; el resto se pinta. El
conjunto tiene su propio hash (`FrameSet.hash`) que usan el atlas de la cinta 3D, los fotogramas impresos y las
vistas para saber si hay que reconstruir. `AppContext` memoiza `derived()`, `frames()` y `printedFrames()` por
identidad del proyecto y por hash.

**Consecuencias.** Editar un fotograma repinta 1; cambiar un parámetro del generador repinta N; cambiar un ajuste
de película o de óptica no repinta ninguno. Las pruebas de `frames.test.ts` fijan estos números.
