# ADR-0001 · Obra sobre OMEGA

**Contexto.** El estudio quiere que las obras no reinventen lo que OMEGA ya resuelve (docs/LIBRARY.md de OMEGA). El
encargo pide integrar el simulador con la arquitectura de Omega y Matter y reutilizar herramientas existentes sin
comprometer las funciones de ingeniería.

**Decisión.** Praxiboscopic es un repo de obra con `"@aminoacid/omega": "file:../omega"`, `tsconfig` y `vite.config`
equivalentes a los del scaffold de OMEGA (`--configLoader runner`, `dedupe` de three y zod, `fs.allow`). Se usan:
`@aminoacid/omega/mech` (catálogo de motores y rodamientos, curva par–velocidad), `@aminoacid/omega/render`
(fotometría: lux, candela, Kelvin), `@aminoacid/omega/parts` y `@aminoacid/omega/fabricate` (piezas y lista de
compras en el formato SHOPPING.md, convención de capas láser para los SVG de corte). La app de OMEGA (fluidos, LEDs,
VM Arduino) no se importa. Matter no se toca: comparte convenciones (three, zustand-like store propio aquí) pero no
código.

**Consecuencias.** Vite 7, three 0.186.1, zod 4.6.7 y TypeScript 5.9.3 fijados a las versiones de OMEGA. Las
pruebas en Node usan `@napi-rs/canvas` porque el pipeline de fotogramas pinta en canvas. Cuando OMEGA se publique
(decisión 3 de su STATUS.md), basta cambiar el `file:` por la versión.
