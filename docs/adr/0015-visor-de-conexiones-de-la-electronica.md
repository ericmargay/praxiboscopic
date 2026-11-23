# ADR-0015 · La electrónica se cablea y se prueba en banco, con un visor de conexiones

**Contexto.** El 22-nov-2026, con los motores ya en sus torres, Eric pidió probar la electrónica antes de seguir armando: desde ese paso del ensamble, un visor 3D nuevo con los pasos de las conexiones entre toda la electrónica y los datos eléctricos de cada pieza, al estilo de Tinkercad Circuits y combinado con lo que ya hace el visor de la obra (seleccionar, ver propiedades, comentar).

- La vista del ensamble dibujaba los cables por grupos, sin decir de qué pin a qué pin.
- El paso 3 pedía cablear «potencia y señales» sin orden ni prueba.
- No había programa con qué mover un motor.

**Decisión.** Una página aparte, `electronica.html`, que se abre desde el paso 2 del ensamble.

- **El modelo** (`src/elec/wiring.ts`) guarda el circuito dos veces: como esquema (qué pines deben quedar unidos) y como montaje (cada pieza en su agujero de la protoboard y cada cable de punta a punta). Una prueba arma las redes que resultan del montaje y las compara con el esquema.
- **Diez pasos**, cada uno con lo que se conecta, cómo se prueba y qué debe dar: fuente sola, reguladores, riel de 5 V y ESP32, motor 1, motor 2, sensores I2C, sensor de marcas, driver del LED sin LED, capacitores y LED, y todo junto sin USB. Si un paso falla, el problema está en lo que se acaba de conectar.
- **El banco en 3D** (`src/elec/bench.ts`) usa las piezas del catálogo a escala real, extendidas sobre una mesa de trabajo. Cada cable se toca y dice de dónde a dónde va, qué lleva y con qué tipo de cable. Cada pieza muestra sus datos eléctricos, sus ajustes y con qué se une cada pin.
- **Programa de prueba** (`public/electronica/prueba-banco/prueba-banco.ino`): se maneja desde el monitor serie y no usa bibliotecas. Mueve cada motor, busca los sensores en el bus, les da su dirección, lee el encoder y el sensor de marcas, y da destellos de prueba. Usa los mismos pines que el modelo; una prueba falla si dejan de coincidir.
- **Comentarios** (ADR-0014): cada pieza del banco se comenta igual que en el visor de la obra. El issue guarda que salió de este visor y de cuál de sus pasos.

Lo que cambió en el circuito al escribirlo pin por pin:

- **El sensor de marcas F249 va a 3,3 V**, no a 5 V. Su salida sube hasta el voltaje con que se alimenta y llega directo al GPIO34, que no aguanta 5 V.
- **Nada depende de que los rieles de la protoboard estén unidos a la mitad.** El diseño anterior ponía 5 V y 12 V en el mismo riel, lo que solo funciona si está partido. Ahora los 12 V van directo al pin del IR2101, cada riel se usa de un solo lado y dos puentes unen las tierras.
- **Los 24 V del LED y del regulador de 12 V salen del riel con fusible**, y los tres capacitores de 1000 µF van directo en ese riel.
- **Faltaba una resistencia de 1 kΩ** en la lista: traía tres para dos transistores y la mesa lleva cuatro.
- **El ESP32 se alimenta por USB durante las pruebas.** Su pin 5V se conecta hasta el final, con el USB desconectado.

**Consecuencias.**

- El paso 2 del ensamble termina metiendo un tramo de varilla en cada cople, sin pegar, para ver girar los motores; el paso 3 fija la electrónica con las conexiones ya probadas.
- El cable de 18 AWG no entra en la protoboard: las puntas que llegan a ella terminan en medio jumper.
- El ESP32 suelto va volteado, con jumpers hembra, y así no se ven sus letreros: el visor lo dibuja volteado, con el nombre de cada pin. Con la placa de expansión va derecho.
- El fusible rápido de 500 mA queda al límite con la carga de los capacitores al encender (0,17 A²s contra 0,215 que lo funden): hay que verlo en banco y quizá cambiarlo por uno lento.
- El programa de prueba no lee distancias ni sincroniza el destello: eso es el programa de la obra, que sigue pendiente.
- Las tablas del DM542 y el orden de los pines salen de las hojas de datos de Leadshine, Espressif, Infineon, onsemi, SparkFun y Mean Well; los módulos genéricos (AS5600, F249) cambian según el fabricante y el visor lo dice.

Código: `src/elec/` (modelo, pruebas, escena y página), `electronica.html` y `public/electronica/prueba-banco/`.
