# Demostración integral: de la pelota a la pantalla

Recorrido del flujo completo con el proyecto de demostración (`?demo=1`). Cada paso dice qué tocar y qué debe verse.

## 1. Crear la animación (Animation Studio → Editor)

La biblioteca carga la **pelota rebotando**: un generador procedural real. En *Propiedades → Panel paramétrico*
cambia radio, color, altura del rebote, rebotes por ciclo, curva (parábola, seno, easings), squash & stretch,
amortiguación, fotogramas y FPS. Cada cambio reconstruye las capas procedurales y conserva lo que hayas añadido a
mano (capas no procedurales y ediciones por fotograma). *Hornear* convierte las capas en editables.

Las otras cuatro animaciones (ave, figura caminando, engranaje, abstracta) también son paramétricas. El campo
**Describir animación** acepta frases como «pelota azul rebotando 3 veces, 36 fotogramas a 12 fps» (motor procedural;
un servicio de IA se conecta en *IA…* con endpoint, modelo y llave).

**Seamless Loop** (abajo a la derecha): compara la transición N−1 → 0 con las internas. Los generadores salen
continuos; si rompes una pista (p. ej. una `x` con keyframes 0 → 400), el panel lo detecta y *Cerrar pistas de
keyframes* lo corrige.

## 2. Generar los fotogramas (pestaña Fotogramas)

24 fotogramas a 24 FPS = 1 s. Prueba:

- **FPS 12** con *Conservar duración* → 12 fotogramas; con *Conservar fotogramas* → 24 fotogramas y 2 s de ciclo.
- Resolución 480 × 300 px, tamaño físico 32 × 20 mm (15 px/mm ≈ 381 ppi).
- Fondo transparente y canal alfa; brillo/contraste/saturación/umbral/grises/negativo; orientación; dirección
  inversa (el índice de película se invierte); prefijo y numeración.

La hoja de contactos muestra las 24 imágenes con su instante; *Editar* abre el fotograma en el editor en modo
«Editar fotograma individual» (las ediciones van a `frameOverrides` de ese índice); *Reemplazar…* sustituye el
fotograma por una imagen. La cabecera informa cuántos fotogramas se repintaron y cuántos vinieron de la caché:
cambia un parámetro y verás «24 repintados»; edita un solo fotograma y verás «1 repintado, 23 de caché».

## 3. Construir la película (pestaña Película)

Paso 36 mm × 24 = **864 mm**, separación de 4 mm, sin perforaciones y con una marca de sincronía por fotograma. La vista
desplegada pinta la tira con los fotogramas reales. Si desactivas *Rediseñar el recorrido automáticamente* y pones 36
fotogramas, verás el error en mm y las propuestas.

## 4–6. Recorrido, transporte y la obra en 3D (Mechanical Simulation)

Cuatro rodillos Ø103,1 mm miden exactamente 864 mm: 9 fotogramas por vuelta, 160 rpm. Quedan a 10 mm entre sí en el
lado corto y a 54 mm en el lado de la ventana, donde pasa la luz. El rodillo 3 tira de la película justo después de la
ventana y el 0 es el tensor con resorte.

El visor funciona como un CAD:

- **Seleccionar:** clic en una pieza o en el **Navegador** de la izquierda. Las **Propiedades** muestran medidas de
  catálogo y del modelo, especificaciones, conexiones, precio y alternativas, con enlace a la lista de compras.
- **Herramientas:** *Encuadrar* (o doble clic, o F), *Aislar*, *Ocultar*, *Medir* (dos clics, en mm), *Rótulos*,
  *Ortográfica* y *Base transparente*. Esc quita la selección.
- **Vistas:** Inicio, Frente, Arriba, Derecha, Ventana, Motor, Electrónica (caja de control), Interior (base) y Pantalla.

Prueba *Electrónica* y selecciona el MOSFET o el ESP32; luego *Interior* para ver la fuente y el DM542 dentro de la
base. Con *Medir* comprueba los 10 mm entre rodillos.

## 7–8. Estroboscopio

El LED lo dispara la marca de cada fotograma. Pon **Error deliberado de velocidad = 3 %**: los destellos siguen
centrados y solo sube la frecuencia. Para estudiar la deriva, cambia *Disparo* a **Reloj propio**. **Parar motor** deja
la pantalla negra, porque sin marcas no hay destellos. El tambor de ranuras queda solo como comparación y no cabe en
este loop: el panel de avisos lo marca en rojo.

## 9–11. Proyección y óptica (Projection Laboratory)

El panel A reproduce la animación digital, el B muestra la tira en la ventana y el C solo recibe lo que la ventana deja
pasar durante cada destello. Prueba el desfase del LED, la escala de tiempo a 0,05 y los medios de impresión. En
*Mechanical Simulation → Óptica* cambia la distancia de proyección y desenfoca moviendo la distancia película–lente.

## 12. Exportar (pestaña Exportar)

- **Fotogramas**: secuencia PNG con manifiesto, spritesheet + JSON, SVG por fotograma (el documento es vectorial).
- **Película**: PNG de la tira a los PPI elegidos (dividida si supera el límite de canvas), SVG con los fotogramas
  vectoriales anidados a tamaño real, **PDF imprimible** con portada, segmentos que cortan entre fotogramas, marcas
  de corte y alineación, solapes, rótulos y una regla de 50 mm para comprobar la escala.
- **Medio y ruta**: inyección de tinta sobre acetato para inkjet, láser sobre acetato para láser, laboratorio
  fotográfico o fotolito; el panel avisa de incompatibilidades (acetato para inkjet en una láser, ruta de laboratorio
  con perfil de escritorio, tira estrecha en impresora doméstica) y distingue prueba de escritorio de calidad óptica.
- **Calibración**: estrella de Siemens, pares de líneas en lp/mm, cuña de densidades, cruz con graduación en mm,
  parches de color, carta completa.
- **Instalación física**: lista de compras en el formato SHOPPING.md de OMEGA (motor, driver, rodillos, rodamientos,
  ejes, acoplamiento, base, ventana, lente, condensador, LED y driver de pulso o tambor y lámpara, ESP32, sensor,
  fuente, hojas o laboratorio, cinta de empalme, pantalla) y BOM en CSV. Ver `docs/COMPRAS.md`.

## 13. Video de 5 s a 24 fps sin rozar la tinta (ADR-0008, ADR-0009 y ADR-0010)

1. Importa el video: `npm run video -- "archivo.mp4" --nombre=cried-out`. Escribe los cuadros con el color BT.709
   bien convertido y la paleta en `public/videos/cried-out/`.
2. En *Animation Studio → Biblioteca → Videos*, elige la duración (5 s), la proyección (24 fps), el encuadre y la
   película, y pulsa «Usar en el proyecto». También sirve abrir `?video=cried-out&segundos=5&fps=24`. Salen 120
   fotogramas: se saltan 97 de los 217 cuadros. Con «Uno por cuadro del video» y 10 s salen los 217 a 21,7 fps.
3. En *Mechanical Simulation*, con la película laminada (por omisión), el recorrido es el festón de 7 rodillos: 4,32 m
   de película en una mesa de rodillos de 520 × 656 mm. En *Recorrido*, «Tinta» dice que 2 rodillos tocan la cubierta,
   y «Grosor y rigidez» da 0,217 mm y el 1,9 % de la tensión. Sube la base a 0,381 mm y la cubierta a 0,381 mm para
   ver el aviso de rigidez. Con `&pelicula=sencilla` sale el rectángulo de 4 rodillos (base de 1288 × 972 mm), donde
   ningún rodillo toca la tinta; en él, cambia la forma a festón para ver el aviso de la tinta.
4. En *Projection Laboratory* mira el brillo: el video es oscuro. Acerca la pantalla (distancia de proyección 600 mm)
   para verlo mejor.
5. Imprime: `npm run imprimir -- --video=cried-out --segundos=5 --fps=24`. Primero imprime
   `impresion/cried-out-5s-24fps-prueba-de-color.pdf` (portada, colores y la primera hoja) y luego
   `impresion/cried-out-5s-24fps-tira-letter.pdf`, siempre al 100 %. `impresion/cried-out-5s-24fps.mp4` muestra los
   fotogramas tal como se imprimen.
6. Sin el video: `?demo=laminada&section=mechanical` arma la misma máquina
   con la pelota repetida 5 veces. Son los mismos 4,32 m de película laminada en festón de 7 rodillos, a 160 rpm y con
   115 µs, sin avisos.

## 14. Dos tambores con la mano (ADR-0011)

1. Abre `?demo=tambores&section=mechanical`: la película de 5 s laminada entre dos tambores, en una mesa de
   383 × 262 mm. Arranca quieta, con el fotograma 1 en la ventana y casi toda la película en el tambor 2.
2. En *Manos del visitante*, marca «Mano sobre el tambor 1» (o mantén presionada la tecla 1). Tras 150 ms la película
   arranca, llega a 24 fps en 0,4 s y corre hacia el tambor 1. La animación avanza. El tambor 1 se llena (de Ø103,6 a
   Ø109,2 mm) y gira más despacio; el 2 se vacía y gira más rápido. El destello dura 116 µs.
3. Sube la mano a 35 cm: 6 fps, destellos de 463 µs y parpadeo. Bájala a 3 cm: 30 fps y 93 µs.
4. Retira la mano: la película frena y se queda con un fotograma centrado. El LED pulsa a 200 Hz con la misma luz
   promedio, sin parpadeo.
5. Lleva la película hasta el final: frena a tiempo (a 24 fps, unos 5 fotogramas antes; a 30 fps, unos 8) y se queda
   en el último. Pon la mano sobre el tambor 2:
   la película regresa y la animación corre al revés.
6. En *Programa del ESP32* prueba «Dos manos a la vez», «Sin visitantes» y «Al final de la película». Quita
   «Compensar el borde de la marca en reversa» y mira en *Projection Laboratory* cómo salta la imagen al regresar.
7. Vista «Manos»: los conos de lectura de 18° y la mano a su altura. «Interior»: la fuente de pie, los dos DM542, la
   protoboard y el ESP32 dentro de la base. «Arriba»: la planta de la propuesta.
8. Lista de compras: `compras.html?demo=tambores` (o `node scripts/bom.mjs --tambores` para
   `docs/COMPRAS-TAMBORES.md`). Con el video: `?video=cried-out&segundos=5&fps=24&recorrido=tambores`.

## 15. La mesa sin tornillos: ensamble, corte láser e impresión 3D (ADR-0012)

1. En *Mechanical Simulation*, el grupo «Ensamble sin tornillos» recorre los 12 pasos. «▶ Armar» los pasa solos. Las
   piezas de cada paso llegan desde afuera y las de pasos futuros no se ven. «Explosión» separa lo ya armado.
   `?demo=tambores&section=mechanical&ensamble=5&explosion=0.4` abre directo en un paso.
2. Cada pieza de corte lleva su código: E en MDF, A en acrílico transparente y N en acrílico negro. Las impresas en 3D
   empiezan con I. Selecciónala para ver qué hace, en qué paso entra y si se pega.
3. `compras.html?demo=tambores#fabricacion` abre la pestaña *Taller*:
   - los archivos de corte (DXF R12, SVG y PDF 1:1 por hoja);
   - los 16 STL;
   - los dos textos para copiar y mandar;
   - el rango de lo que debería costar.
4. `npm run fabricar` vuelve a generar el paquete en `public/fabricacion/tambores/` y `docs/FABRICACION-TAMBORES.md`.
   Si el MDF real no mide 5,5 mm: `npm run fabricar -- --mdf=5.7`. Si la lente que consigas tiene otro barril:
   `--lente=62`.
