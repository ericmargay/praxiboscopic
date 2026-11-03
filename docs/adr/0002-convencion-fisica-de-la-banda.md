# ADR-0002 · Convención física de la banda

**Contexto.** En el dispositivo de referencia (fotos del encargo: mesa, rodillos de latón, linterna) la película es
una banda que corre **horizontalmente de canto** alrededor de rodillos de eje vertical, como en el Théâtre Optique
de Reynaud, no una película que baja verticalmente por una ventana como en un proyector de cine. Un primer borrador
colocó el ancho de la imagen cruzando la tira (convención de 35 mm) y la imagen salía girada 90° para el espectador.

**Decisión.**
- La imagen va **derecha** sobre la banda: su ancho (`widthMm`, horizontal) corre **a lo largo** del avance
  (`alongMm`) y su alto (`heightMm`, vertical) **cruza** la tira (`acrossMm`). El paso se compara con el ancho.
- `σ` es la coordenada a lo largo de la tira desde la cabecera; la cabecera va delante. Un punto de la tira está en la
  posición del recorrido `s = φ − σ` (φ = avance de la cinta). La ventana en `s_gate` ve `σ = φ − s_gate`, así que el
  índice de fotograma crece al avanzar y `phiForSlotAtGate` centra cualquier fotograma.
- Vista desde la lente (lado exterior del polígono de rodillos, normal hacia fuera), la banda corre de derecha a
  izquierda: los fotogramas que aún no han llegado se dibujan a la derecha (`renderGate`, panel B, cinta 3D).
- La lente invierte la imagen; `filmMountedInverted` indica que la película se monta invertida para compensarlo.

**Consecuencias.** `FilmLayout` usa `alongMm`/`acrossMm` (no width/height) para que no vuelva a confundirse; el
strip 2D, el SVG, el compositor y la malla 3D comparten la misma orientación; las pruebas de coincidencia fotograma ↔
destello verifican que el destello n ve el fotograma n.
