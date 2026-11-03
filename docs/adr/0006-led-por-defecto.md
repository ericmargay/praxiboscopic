# ADR-0006 · LED para el primer prototipo

**Contexto.** Con transporte continuo a 24 fotogramas/s y paso de 36 mm la cinta corre a 864 mm/s; para no pasar de
0,1 mm de desplazamiento el destello debe durar unos 116 µs. Un tambor de ranuras no sirve: un haz de 32 × 20 mm no pasa
por una ranura de 0,5 mm sin enfocarlo, y su destello de ≈ 1 ms deja 0,86 mm de borrón. Eric confirmó el 2-nov-2026
que el tambor de referencia no es de ranuras; por las fotos parece el de espejos del Théâtre Optique.

**Decisión.** El primer prototipo usa un LED pulsado, disparado por la marca impresa de cada fotograma. El LED elegido
es de 10 W con emisor de 10,8 mm: la lente f/1.8 admite ~42 % de su luz, frente a ~8 % del de 100 W (emisor de 24,6 mm),
y funciona con 24 V. Película sin perforar, movida por fricción. El tambor de ranuras queda en el simulador solo como
comparación; el tambor de espejos es trabajo futuro y no está modelado.

**Consecuencias.** Sin marcas no hay destello: con el motor parado la pantalla queda negra. El flujo de pico de 3 000 lm
a unas 5 veces la corriente nominal es una estimación y hay que medirla en banco.
