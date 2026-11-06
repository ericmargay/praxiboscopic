# ADR-0013 · La película sigue laminada: la laca en aerosol no la sustituye

**Contexto.** El 5-nov-2026 Eric preguntó si, en lugar del laminado en frío (ADR-0010), convendría una laca transparente en aerosol. Ya seca, protegería la película del roce con el brazo tensor y consigo misma dentro de los tambores.

- **Rozamientos de la película:**
  - El brazo tensor toca la cara de la imagen, solo por los márgenes.
  - Las guías y la ventana tocan el dorso.
  - En cada tambor, unas 14 vueltas se aprietan una contra otra a 1,5 N, a 20–35 °C.
- **Exigencia óptica:** la imagen se proyecta a ~19×: una mota de 0,05 mm se ve de 1 mm.

**Decisión.** Se sigue con el laminado en frío brillante. La laca queda solo como opción para tramos pintados a mano, con tres condiciones:

- los márgenes van enmascarados;
- se cura al menos 7 días antes de enrollar;
- tiene que pasar la prueba de banco de abajo.

Investigado con fuentes el 5-nov-2026:

- **La tinta:**
  - La tinta inkjet dye se vuelve a disolver con agua, así que las lacas al agua y el laminado líquido quedan fuera ([Freedom Paper](https://blog.freedompaper.com/?p=571), [Marabu ClearShield](https://cdn.shopify.com/s/files/1/0080/5509/5343/files/ClearShield_Classic_Lite_Technical_Data_Sheet.pdf)).
  - Con las de solvente la tinta corre si la capa no es muy ligera ([VideoHelp](https://forum.videohelp.com/showthread.php?p=742916)).
  - La acetona, el acetato de butilo y el xileno de Krylon 1303 atacan el PVC rígido ([Hubbard](https://www.hubbardsupply.com/2583213/product/n/krylon-1303), [Palram](https://www.palram.com/au/wp-content/uploads/sites/3/2020/05/Palram_En_PVC_Chemical_Resistance_61312.pdf)).
  - El protector hecho para inkjet (Hahnemühle) es mate y velaría la imagen ([ficha](https://factor.bg/userfiles/product_files_shared/protectivespray_rev01.pdf)).
- **La adherencia:** sobre PET liso la laca pide lijar o un primer ([Krylon](https://www.sherwin.com.ar/wp-content/uploads/2021/11/KRY-ACB.pdf)), y lijar arruina la óptica. Donde apoya el tensor, en los márgenes, se descascararía primero.
- **El blocking:**
  - En el tambor la presión es de unos 0,7 kPa por vuelta y llega a ~10 kPa en las de adentro, durante días y hasta a 35 °C.
  - Se parece a la prueba ASTM D4946, que aplica 15 kPa a 50 °C ([PCI](https://www.pcimag.com/articles/114470-enhancing-block-resistance-in-low-voc-acrylic-paints-using-silane-modified-colloidal-silica)).
  - Las más propensas son las lacas termoplásticas que se pueden retirar, como Golden Archival y Kamar.
- **La óptica:** en 5,6 m de tira barnizados a mano son casi seguros la piel de naranja, los escurrimientos y el polvo atrapado ([FineScale](https://forum.finescale.com/t/orange-peel-with-spray-varnish-please-help/255090)). El laminado pegado en taller deja la superficie lisa.
- **La abrasión:** una capa líquida de ~25 µm no resiste como un laminado de 75–80 µm ([Signs101](https://www.signs101.com/threads/thinnest-most-conformable-over-laminate.134792)).
- **Los empalmes:** el laminado une las hojas inkjet empalmadas; una laca no puentea el escalón.
- **El precedente del cine:** la Eastman Protective Film Lacquer medía unos 2,5 µm. Se aplicaba a máquina por las dos caras y se podía quitar y volver a poner ([International Projectionist](https://lantern.mediahist.org/catalog/internationalpro1617finn_0027)). Era de 5 a 10 veces más delgada que una pasada de aerosol, de 15 a 25 µm.
- **El espesor:** con laca la película mediría unos 0,15 mm en lugar de 0,217. El tambor lleno bajaría de Ø109,2 a Ø107,4 mm (`woundRadius`) y la rigidez a un tercio. La mesa no lo necesita.

**Consecuencias.**

- **El laminado:**
  - Se deja reposar 72 h antes de enrollar, para que se vaya el plateado del aire atrapado ([PrintFinishing](https://printfinishing.com/pages/whysilvering)).
  - Se cotiza como servicio de rotulación: 6,1 m × 1 m de ancho mínimo a $170/m², unos $1,040 (Maxicopias).
  - La alternativa barata es un rollo brillante de 33 cm (MercadoLibre, $399 con uno mate) aplicado a mano con espátula, con más riesgo de burbujas.
- **El dorso:** no se barniza, porque el PET desnudo es más duro que la laca. Lo que más lo roza son las guías de la ventana. En ADR-0012 son de acrílico negro y tocan solo los márgenes, con la cara de fábrica (lisa) hacia la película y las puntas redondeadas con lija fina. Si rayan, se forran con cinta de PTFE.
- **Prueba de banco antes de usar laca en arte pintado:**
  1. **Muestras:** tiras de 40 × 300 mm por triplicado, con negro sólido y un borde fino:
     - PET desnudo, como control;
     - tinta dye y pigmento con laminado;
     - tinta dye y pigmento con tres capas ligeras de Krylon 1303;
     - el arte pintado con cada cubierta.
  2. **La tinta:** a las 24 h, con lupa de 10×, se busca tinta corrida o halos.
  3. **El blocking:**
     - Cupones de 40 × 40 mm, la imagen contra el dorso de otro, con 2,4 kg encima (15 kPa).
     - Una tanda 24 h a 50 °C y otra 7 días a 35 °C, con muestras curadas 24 h, 72 h y 7 días.
     - Se califica de 0 a 10 y se proyecta.
  4. **El roce:** un lazo de 1 m con el rodillo de Ø40 rebajado, una guía de Ø60 y la placa real, a 1,5 N y 1 m/s, invirtiendo el sentido. Se revisa a las 0, 1 000, 5 000 y 20 000 pasadas.
  5. **El velo:** con la lente real a 19×, en cuarto oscuro, se toma una foto RAW con exposición fija. Se miden transmisión, contraste negro/blanco, nitidez del borde y motas por fotograma.
  6. **Criterio:** transmisión de al menos 95 % del control, blocking de 8 o más y ninguna marca nueva.
