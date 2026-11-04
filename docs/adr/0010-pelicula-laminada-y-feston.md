# ADR-0010 · Película laminada: la tinta va cubierta y vuelve el festón

**Contexto.** Eric propone comprar un rollo de 5 m de acetato transparente y hacer la película de dos capas. Los
fotogramas se pintan sobre la base y encima se pega una cubierta que tapa el arte, así los rodillos ya no rozan la
pintura (3-nov-2026). El objetivo es una mesa más chica con más rodillos. Pregunta qué calibre deja fluir la
película sin que quede rígida y qué otros materiales hay en rollo.

**Decisión.**

- **Película laminada** (`FilmSpec.laminate`, con `baseMm` y `coverMm`). La cubierta va sobre la cara de la tinta, que
  sigue hacia la lente. Los rodillos de esa cara tocan la cubierta, no la pintura. ADR-0009 sigue en pie: nada roza la
  tinta.
- **Con la película laminada el video va en festón.** 5 s a 24 fps son los mismos 4,32 m, ahora en 2 pasadas y 7
  rodillos:
  - 5 rodillos tocan la cara de la lámpara y 2 la cubierta.
  - Los rodillos ocupan 520 × 656 mm y la base mide unos 544 × 680 × 125 mm, frente a 1288 × 972 mm del rectángulo:
    el 30 % del área.
  - Sigue a 160 rpm, con 2 N de tensión, sin choques y sin avisos.
  - La película sencilla sigue yendo en el rectángulo convexo.
- **Grosor total de 0,2 a 0,3 mm.** Pegada, la laminada se dobla como una sola hoja, y su rigidez EI = E·b·t³/12
  crece con el cubo del grosor. `filmBending` compara el momento que hace falta para curvarla al radio del rodillo con
  el que le da la tensión, EI / (T·R²), con E = 3000 N/mm². Por debajo de 0,1 la película abraza el rodillo.
  - **Por omisión** (`DEFAULT_LAMINATE`): base de calibre 5 (0,127 mm) más laminado en frío de 75–80 µm con su adhesivo
    (0,09 mm), 0,217 mm en total. Doblarla pide el 1,9 % de la tensión, y la cara exterior se estira un 0,21 % sobre
    el rodillo de Ø103,1 mm.
  - **Aviso por rigidez:** por encima de 0,1. Dos capas de calibre 15 (0,76 mm) piden el 83 %: la película se despega
    de los rodillos y el empalme golpea.
  - **Nota por delgadez:** por debajo de 0,15 mm, porque la película se arruga y ondula en la ventana.
- **Rodillos sobre la cubierta.** Llevan el centro rebajado y apoyan solo en los márgenes de 10 mm, así no rayan la
  cubierta donde va la imagen. El proyecto lo indica con una nota, no con un aviso.

**Materiales.**

- **Base:**
  - PET cristal, de preferencia. Es tenaz, casi no guarda la curva del rollo, no amarillea y no cambia de medida.
  - PVC rígido cristal, el "acetato" de papelería, también sirve.
  - No sirve el "plástico cristal" flexible: se estira y su plastificante ataca la pintura y el adhesivo.
- **Cubierta:**
  - Laminado en frío **brillante** con adhesivo acrílico, pasado en laminadora de rodillos de una tienda de rotulación.
  - El mate vela la imagen.
  - El enmicado térmico ablanda el PVC rígido.
- **El calor no es problema:** el LED da destellos de 115 µs, el 0,3 % del tiempo.

**Consecuencias.**

- **Proceso:**
  1. Pintar en una tira de unos 6 cm.
  2. Dejar curar la pintura, porque el solvente atrapado hace burbujas.
  3. Laminar en un lugar limpio. La imagen se proyecta ~19 veces más grande: una mota de 0,05 mm se ve de 1 mm.
  4. Cortar a 40 mm al final.
  5. Hacer el empalme escalonado: la base a tope en un punto y la cubierta en otro, sin cinta.
- **Compras:**
  - Con la película laminada se suman un rollo base de al menos 4,8 m y el laminado.
  - El festón lleva 7 rodillos en lugar de 4, con sus rodamientos y ejes.
  - La caja base se reduce.
  - Total: 3,849 MXN frente a 3,621 de la película sencilla, sin contar el rollo ni el laminado, que aún no tienen
    precio.
- **Un rollo de 5 m** alcanza para la película de 5 s, pero no para la de 10 s (7,81 m).
- **Interfaz:**
  - La biblioteca de videos tiene «Película: Laminada / Sencilla», con laminada por omisión, y acepta
    `?pelicula=sencilla`.
  - `?demo=laminada` arma la misma máquina con la pelota repetida 5 veces, para mostrarla sin el video: 4,32 m,
    7 rodillos, 160 rpm y 115 µs. Desde el 4-nov-2026 el sitio se publica con el video (`--con-videos`), a pedido de
    Eric.
  - En *Recorrido* se eligen la película, los grosores de base y cubierta, y se lee «Grosor y rigidez».
  - Al cambiar a festón, las pasadas salen de `festoonPasses` para el largo de la película.
- **Sin modelar:** el material base no cambia el módulo (se supone PVC), y la cubierta no cambia la transmisión.
