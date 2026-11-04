# ADR-0009 · La tinta no toca nada: recorrido convexo y video de 5 s a 24 fps

> Ampliada por ADR-0010: con la película laminada la tinta va cubierta y el festón vuelve a ser posible. El rectángulo
> queda para la película sencilla.

**Contexto.** Eric pide el mismo video con 5 s a 24 fps y que la película no se toque por las dos caras, para evitar el
rozamiento (3-nov-2026). En el festón de ADR-0008, 4 de los 11 rodillos tocaban la cara de la tinta.

**Decisión.**

- **Una sola cara.** Con la película de canto y rodillos de eje vertical, todos los rodillos tocan la misma cara solo
  si la película dobla siempre hacia el mismo lado, es decir, si el recorrido es convexo. Todo festón en el plano tiene
  rodillos de los dos lados. También se evitaría torciendo la película media vuelta entre filas, pero eso pasa la marca
  de sincronía al borde de abajo en las filas alternas y estira los bordes un ~0,7 % en 519 mm. Se descarta.
- **La tinta va hacia la lente**, en la cara exterior del loop. Los 4 rodillos (el motriz incluido) y la placa de la
  ventana tocan la cara de la lámpara. Del lado de la lente nada toca la película. La placa de la ventana pasa al lado
  de la lámpara.
- **5 s a 24 fps son 120 fotogramas y 4,32 m de película.** El video (217 cuadros, 7,23 s) va 1,45 veces más rápido. El
  fotograma k toma el cuadro ⌊k · 217 / 120⌋: avanza de 1 o de 2 cuadros y se saltan 97. No se interpolan cuadros,
  porque saldrían imágenes fantasma que no se pueden pintar.
- **Rectángulo de 4 rodillos con huella 4:3.** Los rodillos ocupan 1264 × 948 mm y la base mide 1288 × 972 × 125 mm.
  La cubierta sale de una pieza de una hoja de MDF de 1220 × 2440 mm con router CNC, o de dos piezas en láser. Los
  tramos libres miden 1157 y 841 mm, y la tensión es de 2 N.
- `videoProject` usa el rectángulo si no se le pide otra forma. El festón queda como opción, y el proyecto avisa
  cuando un rodillo toca la cara de la tinta (`Derived.faces`, también con la tinta hacia la lámpara).
- **Destello de 115 µs**, porque a 864 mm/s el desenfoque queda en 0,099 mm.

**Consecuencias.**

- **Compras:** la lista es la del prototipo de 4 rodillos (3,621 MXN). Solo crece la base, y las hojas son carta.
- **Mesa:** sale más grande que el festón de 10 s (96 × 74 cm) aunque la película es más corta. Es el precio de no
  tocar la tinta: un loop convexo de largo L pide una huella cuyo ancho más fondo sea al menos L/2 (2,16 m aquí).
- **Vibración:** con tramos libres de más de un metro la película puede flamear en la ventana. A 2 N, el primer modo de
  un tramo de 1,16 m de acetato de 0,1 mm anda por 8 Hz. Si se ve vibrar, se pueden poner rodillos de apoyo en los
  lados largos, también por dentro: siguen tocando solo la cara limpia.
- **Impresión:** 18 tramos en 5 hojas carta, que son 17 empalmes más el de cierre. `scripts/imprimir.mjs` acepta
  `--fps` y escribe también un MP4 con los fotogramas tal como se imprimen (`impresion/<video>-5s-24fps.mp4`).
- **Brillo:** el mismo de ADR-0008, porque el video es el mismo.
