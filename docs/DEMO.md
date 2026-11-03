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
