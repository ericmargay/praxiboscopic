# ADR-0003 · Muestreo semiabierto y análisis del loop

**Contexto.** La película es un circuito cerrado: el fotograma N−1 va seguido del 0. Si se muestrea t ∈ [0, T]
incluido el extremo, el último fotograma duplica al primero y el loop «tartamudea».

**Decisión.** Los N fotogramas se toman en t_i = i·T/N, i = 0…N−1 (`frameTimes`). Las pistas de keyframes envuelven
(después del último keyframe se interpola hacia el primero desplazado un ciclo) y las expresiones periódicas tienen
ciclos enteros por loop. Los generadores construyen fondos que «reciclan» elementos (nubes, marcas de suelo) con
periodo entero, y el engranaje elige el número de rayos del cubo según la simetría del avance por ciclo.

El análisis (`analyzeLoop`) compara el salto geométrico de cierre con la mediana de los saltos internos. Como los
fondos reciclados cambian de identidad al cerrar, el coste de cierre es el **mínimo** entre el emparejamiento por
`itemId` y una **asignación óptima (algoritmo húngaro)** por clase (capa, tipo de geometría, colores), contando solo
lo visible dentro del lienzo y penalizando lo que aparece o desaparece por lo que se ve de ello. `analyzeLoopPixels`
hace lo mismo sobre los píxeles pintados (lo muestra la hoja de contactos).

**Consecuencias.** Las cinco animaciones de ejemplo pasan la prueba de continuidad; un keyframe suelto se detecta y
`closeKeyframeTracks` lo corrige. El coste del análisis es O(n³) por clase, despreciable para documentos de decenas
de elementos.
