# ADR-0005 · Modelo de exposición

**Contexto.** El encargo prohíbe sustituir la simulación óptica por la reproducción del archivo: la imagen proyectada
debe depender de qué fotograma hay en la ventana, su posición, su velocidad, la luz, la duración del destello, la
lente y la distancia.

**Decisión.** `TimeEngine.advance(dt)` calcula de forma analítica los destellos cuyo inicio cae en el intervalo (sin
pasos fijos: resolución de microsegundos aunque la pantalla vaya a 60 Hz) y la posición de la cinta en cada uno. Para
cada destello, `ProjectionCompositor.expose` pinta la ventana K veces a lo largo de su duración (K según el
desplazamiento en píxeles), pesa cada submuestra con el perfil del destello (rectangular en LED, trapezoidal en el
tambor: la ranura entra, se solapa con la abertura y sale) y las acumula de forma aditiva. La imagen pasa por el
medio (fotogramas «impresos» con transmitancia, Dmax, punto y velo), por la lente (inversión o espejo, desenfoque por
foco con el círculo de confusión) y se suma a la pantalla con persistencia retiniana (decaimiento exponencial). El
peso de cada destello se normaliza con (1 − e^(−T/τ)) para que el régimen permanente tenga brillo 1 y la mezcla de
fotogramas descentrados se vea como mezcla, no como saturación.

Motor parado ⇒ φ no avanza y se repite el fotograma. Batido entre transporte y estroboscopio ⇒ el fotograma centrado
en cada destello cambia y la imagen deriva, se parte o se mezcla. Destello largo ⇒ desenfoque horizontal.

**Consecuencias.** La fotometría absoluta (cd/m², lux) se reporta aparte (`brightnessReport`); la pantalla del
simulador está normalizada al brillo relativo. El modelo no incluye difracción, aberraciones de la lente ni el
espectro de la lámpara más allá del color Kelvin.
