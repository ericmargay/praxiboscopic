# ADR-0011 · Dos tambores: la película va y viene con la mano

**Contexto.** El 4-nov-2026 el cliente pidió estudiar otra configuración: dos tambores con motor en lugar del loop. La
película va de un tambor a otro y, al acabarse, regresa. Un sensor de distancia sobre cada tambor lo activa, y la
película corre más rápido entre más cerca esté la mano. Eric propuso un sensor de distancia «lo más preciso posible».
La propuesta quedó en Claude Docs (https://claude.ai/artifact/B3RKM3CKqwqeYmCrSBghfK). El 5-nov-2026 Eric avisó que se
construye y pidió modelarla en el simulador, con la lista final de compras. Las seis decisiones de la propuesta seguían
sin marcar, así que el simulador toma lo recomendado y deja cada una como opción (ver abajo).

**Decisión.**

- **Recorrido abierto** (`pathLayout: 'reels'`, `src/mech/reels.ts`):
  - La película sale del tambor 2 (+x), pasa por el brazo tensor, la guía 2, la ventana y la guía 1, y llega al
    tambor 1 (−x).
  - Avanzar (φ crece) la lleva hacia el tambor 1 y la animación corre hacia adelante. En la ventana va hacia −x, como
    en el loop (ADR-0002).
  - Las colas transparentes no se imprimen: la del tambor 1 va en σ < 0 y la del tambor 2 después del último
    fotograma. Así la impresión no cambia.
- **Tambores impresos:**
  - Núcleo de Ø103,1 mm, el de los rodillos: la película se dobla igual. Bridas de Ø130 mm con ventanas.
  - Cada tambor va directo sobre su NEMA 17 17HS8401, con cople y dos 608 (uno en la cubierta y otro en un
    alojamiento impreso).
  - Radio enrollado: π(r² − r0²) = ℓ·t. El giro desde el núcleo es 2π(r − r0)/t.
  - Lleno con la película de 5 s mide Ø109,2 mm (4,65 m). El radio cambia un 5,9 % y el ESP32 lo compensa contando
    marcas.
- **Guías y brazo tensor:**
  - Dos guías de Ø60 mm doblan la película hacia la ventana y tocan la cara de la lámpara.
  - El brazo tensor (rodillo de Ø40 mm, brazo de 44 mm) empuja la película 22 mm por la cara de la cubierta. Tiene un
    resorte bajo la cubierta (1,5 N) y un imán diametral en el eje que lee un AS5600.
  - El ESP32 corrige con ese ángulo el motor que suelta.
- **La mano** (`ReelController`), con pasos de 2 ms:
  - Sensor VL53L4CD sobre una tapa de acrílico fija encima de cada tambor. Para la prueba de banco, VL53L0X.
  - Tabla de distancia a velocidad: 35 cm → 6 fps, 25 → 15, 15 → 24 y 3 cm o menos → 30 fps; se interpola entre
    puntos. Más allá de 35 cm no hay mano.
  - Lectura filtrada (60 ms). La mano tiene que quedarse 150 ms antes de que la película se mueva.
  - Rampa de 2 m/s².
  - Frena antes del final con v ≤ √(2·a·d), para quedar con el primer o el último fotograma centrado.
  - Sin mano, se detiene en el primer fotograma que la deja frenar sin pasarse de la aceleración.
- **La luz:**
  - Cada marca dispara su destello, de 0,1 mm / v: 463 µs a 6 fps, 116 a 24 y 93 a 30.
  - Con la película quieta, el LED da pulsos de 13,9 µs a 200 Hz. La luz promedio es siempre el 0,28 % del tiempo.
  - En reversa el sensor ve primero el otro borde de la marca, 3 mm antes. El programa compensa con un retraso; sin
    compensar, la imagen salta 3 mm (unos 57 mm en pantalla).
  - El tambor de ranuras y el LED con reloj propio son error en esta mesa.
- **Mesa compacta de 380 × 262 × 125 mm** (`buildReelsAssembly`):
  - Las manos necesitan el espacio sobre los tambores, así que toda la electrónica va dentro de la base.
  - La fuente va de pie contra la pared trasera, cada DM542 delante de su motor y la protoboard con el ESP32 al centro.
  - Los motores de los tambores cuelgan como el motriz del loop. La lente sigue al frente, fuera de la base.
- **Par:**
  - La tensión de 1,5 N en el tambor lleno pide 8,2 N·cm; con los rodamientos y la inercia a 2 m/s², 9,7 N·cm.
  - El NEMA 17 da 17,3 N·cm a 200 rpm (30 fps con el núcleo vacío): margen de 1,8. Por eso el tope es 30 fps.

**Las seis decisiones del cliente, como opciones del programa** (*Mechanical Simulation → Programa del ESP32*):

| Decisión | Por omisión | Otras |
|---|---|---|
| Sin visitantes | Quieta en un cuadro iluminado | Va y viene sola a 12 fps tras 20 s |
| Al final de la película | Espera a que alguien use el otro tambor | Regresa sola al otro extremo y ahí se queda |
| Velocidades | De 6 a 30 fps, 24 fps a 15 cm | Los cuatro puntos de la tabla se editan |
| Dos manos a la vez | Manda la primera que llegó | La más cercana (con 2 cm de margen), o se detiene |
| Película | Los mismos 5 s (120 fotogramas, 4,32 m) | Cualquier video o animación del estudio |
| Mesa | Compacta, 380 × 262 mm | La de exhibición, con la película a la vista, no está modelada |

**Interfaz.**

- `?demo=tambores` arranca con la pelota de 5 s en la mesa de dos tambores. `&mano=1&cm=15` pone la mano del
  visitante sobre el tambor 1 a 15 cm.
- `?video=cried-out&segundos=5&fps=24&recorrido=tambores` hace lo mismo con el video.
- En *Recorrido*, «Forma» cambia entre rectángulo, festón y dos tambores.
- Las teclas 1 y 2 ponen la mano mientras se mantienen presionadas.
- La escena muestra:
  - los tambores con la película enrollada, que crece y gira;
  - las guías y el brazo tensor rodando;
  - las tapas con los sensores, su cono de lectura y la mano a su altura.
- Hay una vista «Manos» y el laboratorio dibuja la planta de los tambores.
- `compras.html?demo=tambores` da la lista de compras de esta mesa.

**Consecuencias.**

- **Compras** (la lista generada está en `docs/COMPRAS-TAMBORES.md`):
  - Además de lo del loop: un segundo NEMA 17, DM542, soporte y cople; dos S8050 más; dos VL53L4CD; AS5600; resorte;
    jumpers hembra-hembra para el bus I2C; tornillería M3.
  - Salen la caja de control de acrílico, sus separadores y el tensor del loop.
  - 12 rodamientos 608 y 6 ejes de 8 mm.
  - Película: 5,61 m con las colas. Hay que comprar 6,1 m de base y de laminado, así que el rollo de 5 m ya no alcanza.
- **Sin modelar:**
  - La dinámica real del brazo tensor. La escena solo lo abre un poco al acelerar.
  - El tiempo de búsqueda del extremo al encender.
  - La variante de exhibición con la película alrededor de la mesa.
  - El parpadeo a menos de 16 fps se ve en el laboratorio, pero no se mide.
- **Por medir en banco:**
  - Que el LED aguante pulsos de 463 µs.
  - La tensión al invertir.
  - Cómo se siente la mano.
  - El cuadro fijo a 200 Hz.
