# ADR-0014 · Los comentarios sobre las piezas son issues de GitHub

**Contexto.** Al armar la mesa de dos tambores (noviembre de 2026) empezaron a salir fallas: piezas impresas que faltaban, un paso del ensamble en mal orden, encajes demasiado apretados. Eric pidió el 22-nov-2026 poder comentar cada pieza desde el visor y que eso abra un issue en GitHub, para dejar documentado qué falla, sobre qué pieza y cómo se resolvió.

- El sitio es estático (GitHub Pages): no hay servidor donde guardar comentarios.
- El repositorio es público y tiene issues.
- Lo ven Eric, Andrea y los talleres.

**Decisión.** Cada comentario es un issue del repositorio de la obra. No hay almacén propio.

- **Escribir.** Con una pieza seleccionada, *Comentar esta pieza* pide el tipo (falla, mejora, pregunta, nota) y el texto, y abre el formulario de issue nuevo de GitHub ya escrito: título con la pieza, el texto, la pieza y su código, el paso del ensamble que se estaba viendo y un enlace que abre el visor en esa pieza y ese paso. Quien comenta lo publica con su cuenta; ahí puede arrastrar fotos.
- **Leer.** El visor consulta los issues con la API pública de GitHub, sin token, y los muestra sobre la pieza de la que hablan: en su panel, con una insignia en el navegador de piezas, en el paso del ensamble donde se reportaron y en el grupo *Comentarios* del panel lateral, que lista los abiertos y lleva a cada pieza.
- **Responder y cerrar.** En GitHub. El visor muestra el estado, cuántas respuestas hay y, al abrir un comentario, su texto y las respuestas.
- **La pieza.** Una marca oculta al final del issue (`<!-- praxiboscopic pieza="E05" tipo="falla" paso="2" sel="E05-1" -->`) dice de qué pieza habla. La pieza es su código de corte o impresión (E05, I01), para que el comentario salga en todas sus copias; lo que no tiene código usa su id en la escena. Un issue sin marca es de la obra completa.
- **Etiquetas.** `falla`, `mejora`, `pregunta`, `nota`; `armado` para lo que sale al armar; `electronica` para lo que sale al cablear y probar la electrónica; `visor-3d` para lo abierto desde el visor.
- **Otros visores.** El visor de conexiones (ADR-0015) tiene sus propios pasos: sus issues llevan `vista="electronica"` en la marca, y su `paso` es de ese visor.
- **Bitácora.** Los issues, sus respuestas y sus fotos quedan además en un archivo del repositorio, que el visor lee primero (ADR-0016).

**Consecuencias.**

- Para comentar hace falta una cuenta de GitHub. Para leer, no.
- Todo lo escrito es público: en un issue no van costos estimados ni datos personales.
- GitHub solo aplica las etiquetas del enlace a quien puede etiquetar en el repositorio; por eso la pieza va en la marca y no en una etiqueta.
- La API sin token deja 60 consultas por hora por red. El visor guarda la lista dos minutos y solo vuelve a leer al pulsar *Actualizar* o al regresar de GitHub después de comentar.
- El texto de un issue lo escribe cualquiera: el visor lo pinta como texto llano, nunca como HTML, y solo enlaza al repositorio de la obra.
- Si GitHub no responde, el visor lo dice y da el enlace a los issues.

Código: `src/feedback/issues.ts` (formato, lectura y pruebas) y `src/ui/sim/feedback.ts` (interfaz).
