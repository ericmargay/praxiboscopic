# ADR-0016 · La bitácora es un archivo del repositorio que se reescribe con cada push

**Contexto.** En la obra trabajan Eric y Andrea, y lo que se guarda es poco: qué falló, cómo se resolvió y las fotos. El 22-nov-2026 Eric pidió no depender de un servidor: un archivo de base de datos compartido en el repositorio, que se actualice con cada push, y subir las fotos de los issues directo al repositorio.

- Los comentarios ya son issues de GitHub (ADR-0014), pero el visor los leía en vivo: 60 consultas por hora por red y una consulta más por cada hilo de respuestas.
- El sitio se compila en la computadora de Eric (OMEGA es privado), así que GitHub no puede volver a publicarlo.

**Decisión.** La carpeta `bitacora/` del repositorio es la base de datos.

- **`bitacora/bitacora.json`** guarda cada comentario con su texto, su estado, sus respuestas y sus fotos. No se edita a mano: lo escribe `scripts/bitacora.mjs` (`npm run bitacora`), un script de Node sin dependencias.
- **`bitacora/fotos/`** recibe las fotos. Cada una se liga a su issue por el número con que empieza su nombre (`5-muesca-del-collar.jpg`) o su carpeta (`5/`).
- **Una acción de GitHub** (`.github/workflows/bitacora.yml`) corre el script después de cada push y cada vez que alguien abre, responde o cierra un issue. Si el archivo cambió, lo guarda con un commit en esa misma rama, y pone cada foto nueva como respuesta en su issue.
- **El visor** lee primero la bitácora: en el sitio, la copia viva del repositorio (cambia con cada push, sin volver a publicar) y, si no la alcanza, la que se publicó con él. Encima pone lo que diga GitHub en ese momento. Si GitHub no responde, muestra lo guardado y lo dice.
- Las fotos se ven junto a su comentario, en el visor de la obra y en el de conexiones.

**Consecuencias.**

- Sigue sin haber servidor ni cuentas nuevas: todo vive en el repositorio y en sus issues.
- La acción hace commits en la rama donde se hizo el push. Antes del siguiente push hay que traerlos (`git pull --rebase`); si se corre `npm run bitacora` antes de hacer commit, la acción no encuentra nada que cambiar.
- Los avisos de issues solo disparan la acción desde la rama principal del repositorio (`master`). Mientras el trabajo siga en otra rama, la bitácora se actualiza solo con los push.
- El sitio busca la bitácora en la rama desde la que se compiló. Si el trabajo cambia de rama, hay que volver a publicar.
- El repositorio es público: lo que entra a la bitácora y a `fotos/` lo ve cualquiera. Sin costos estimados, datos personales ni tickets.
- Las fotos pesan en la historia del repositorio para siempre: conviene subirlas reducidas. Las HEIC del iPhone no se ven en el navegador y el script las deja fuera.
- La acción no se ha probado en GitHub todavía: corre por primera vez cuando este trabajo se suba.

Código: `scripts/bitacora.mjs`, `.github/workflows/bitacora.yml`, `src/feedback/issues.ts` (lectura y mezcla, con pruebas) y `src/ui/sim/feedback.ts` (interfaz).
