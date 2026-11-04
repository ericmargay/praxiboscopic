# ADR-0008 · Película de 10 s en festón y video como fuente

> Reemplazada en parte por ADR-0009: el festón toca la cara de la tinta y ya no es la forma por omisión.

**Contexto.** Eric quiere probar una animación de 10 s con el mismo fotograma (32 × 20 mm, paso 36 mm) y meter un video
vertical de 7 s, hecho en loop, alentado a 10 s, para imprimir los fotogramas con los colores correctos (3-nov-2026).

**El video.** 720 × 1280 (9:16), 30 fps, 217 cuadros, YUV BT.709 de rango limitado. El último cuadro no repite el
primero: el salto de cierre (45 de 255) es igual al mayor salto entre cuadros seguidos, así que el loop cierra y se
usan los 217.

**Decisión.**

- **21,7 fps, no 24.** 217 cuadros en 10 s dan 21,7 fps: cada cuadro sale una vez, sin cuadros inventados ni
  repetidos. A 24 fps harían falta 240 fotogramas con 23 repetidos (un tirón cada ~9) y 0,83 m más de película. Con
  disparo por sensor la frecuencia no tiene que ser entera. La cinta va a 781 mm/s y el desenfoque baja a 0,094 mm.
- **Película de 7,81 m en festón.** En el rectángulo de 4 rodillos un loop de 7,8 m pediría una mesa de unos 2 × 2 m.
  El festón hace idas y vueltas entre dos filas de rodillos: 4 pasadas, 11 rodillos de Ø103,1 mm (los mismos), filas a
  519 mm y un tramo frontal recto con la ventana. Los rodillos ocupan 932 × 716 mm y la base mide unos 96 × 74 cm. La
  longitud se resuelve exacta: L = (2k+2)(πR + S) + 2G + 4Rk.
- **El recorrido admite rodillos abrazados por cualquiera de las dos caras** (`sides` en `PathSpec`): entre rodillos de
  lados opuestos la película cruza por la tangente interior. El espacio detrás de la ventana se mide ahora con rayos
  contra rodillos y tramos de película, y vale igual para el rectángulo que para el festón.
- **Consecuencia física del festón:** la película toca rodillos por las dos caras. La tinta no debe rozar: rodillos con
  dos bandas de apoyo estrechas en los márgenes (fuera de la imagen y de la marca de sincronía) y el centro rebajado.
- **El video entra completo** con bandas negras a los lados (11,25 × 20 mm dentro de 32 × 20). La alternativa «llenar»
  recorta el 65 % de la altura. El negro es tinta opaca en la película, igual que el fondo del video.
- **Color.** La extracción declara BT.709 y rango limitado (ffmpeg usa BT.601 si no se le dice y corre rojos y verdes).
  El PDF lleva las imágenes sin pérdida y con un perfil sRGB incrustado (generado en código y validado con littleCMS),
  más una página con los 10 colores del video para comparar en el mismo acetato.
- **Impresión** en carta horizontal a 381 ppi (la resolución nativa de los fotogramas, sin remuestrear): 31 tramos en
  8 hojas, cortados entre fotogramas.

**Consecuencias.**

- **Brillo:** el video es oscuro (47 % negro y 24 % azul profundo) y la película transmite en promedio el 7 %. El
  laboratorio estima 0,3 cd/m² de promedio a 1 m, contando las bandas, y 0,9 cd/m² a 0,6 m. Hace falta sala oscura,
  pantalla cerca o más luz.
- **Empalmes:** 31 tramos en hojas carta son 30 empalmes más el de cierre. En tabloide serían unos 20; en rollo, uno.
- **Material de terceros:** el video, sus cuadros, los PDF y las capturas con el video no se versionan ni se publican
  en Pages.
- **Herramientas:** `scripts/video.mjs` importa cualquier video y `scripts/imprimir.mjs` genera los PDF. La biblioteca
  del estudio carga los videos importados.
