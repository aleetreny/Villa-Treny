# Auditoría de arte del hábitat

Auditoría visual de las **45 salas visitables** y sus fuentes existentes. Se revisaron las45 imágenes PNG mediante cinco hojas de contacto a ampliación entera2×, además del código de recortes, las dimensiones de `rooms.json`, los patrones de repetición de píxeles de las fuentes y los anclajes de mobiliario. Breach se comprobó como referencia sellada, fuera del inventario visitable.

**Este documento registra el estado anterior a la corrección de escala identificada durante la auditoría.** No se ha modificado ninguna imagen ni ningún renderizador para prepararlo. Las hojas de contacto son auxiliares en `/tmp/habitat-art-audit/`; no son arte del producto.

## Resultado principal

Hay **cuatro reducciones incorrectas confirmadas**: Bridge, Dock, Hold y Face. El resto de las salas pequeñas no demuestra una pérdida general de resolución: en su mayoría son composiciones compactas con los mismos muebles de32px. Agrandar esas PNG individualmente falsearía la escala del hábitat; el encuadre puede ampliarse por enteros y los personajes deben calibrarse respecto a los muebles.

Las46 PNG existentes coinciden exactamente con `width`/`height` de `public/habitat/rooms.json`. No se encontró una exportación truncada por discrepancia de dimensiones. Algunos problemas visibles ya están en los renders históricos o en las referencias JPEG y no se deben atribuir al PNG de producción.

## Correcciones de muestreo con prueba

Los rectángulos son `[x,y,ancho,alto]` en el archivo original del ZIP, antes de cualquier reducción.

| Sala | Fuente en `tools/roomlab/library/rooms/` | Rectángulo exacto | Reducción actual | Factor de exportación real | Tamaño que conserva el detalle |
| --- | --- | --- | --- | --- | --- |
| Bridge | `Post Apoc Office - Asset Pack_1.png` | `[181,27,384,288]` | ÷4 |2× |192×144 |
| Dock | `Post Apoc Shelter - Asset Pack_2.png` | `[34,35,864,576]` | ÷4 |3× |288×192 |
| Hold | `Post Apoc Shelter - Asset Pack_8.gif` | `[48,48,576,768]` | ÷4 |3× |192×256 |
| Face | `Post Apoc Shelter - Asset Pack_3.png` | `[34,34,864,576]` | ÷4 |3× |288×192 |
| Breach, sellado | `Post Apoc Office - Asset Pack_6.png` | `[18,18,672,768]` | ÷4 |3× |224×256 |

Prueba cuantitativa: contando cambios entre píxeles contiguos con diferencia RGB máxima>35, el100% de los bordes de Office_1 cae en una sola fase módulo2, mientras que solo≈52% horizontal y≈51% vertical cae en la fase dominante módulo4. En Shelter_2, Shelter_3, Shelter_8 y Office_6, el100% cae en una sola fase módulo3. Las imágenes son ampliaciones enteras de2× o3×, respectivamente; reducirlas4× elimina detalle nativo. La solución es volver al archivo fuente, no ampliar la PNG ya reducida.

Al reexportar estas salas hay que transformar conjuntamente dimensiones, máscara de movimiento, pies/posiciones, entradas, tramos de umbral y recortes de suelo. No basta con cambiar el ancho CSS de la imagen. El recorte físico de Bridge debe mantenerse: se recuperan sus píxeles sin añadir la fachada ni otra habitación.

## Tamaño de los habitantes

El cuerpo actual de `ResidentSprite.tsx` tiene10×17px. Una litera de cabina mide28×62px; una silla aproximadamente16×36px y una taquilla26×63px. Los17px del personaje equivalen a un27% de la longitud de la cama y a menos de la mitad de la altura de una silla. Esa proporción explica el aspecto diminuto incluso en salas cuyo PNG es correcto.

Objetivo visual medible para la familia de assets de32px: **44–48px de alto**, cuerpo de aproximadamente18–24px de ancho y ancla en los pies.48/62≈0,77 de la longitud de la cama; resulta coherente con mobiliario y bidones de32px. La cabeza puede conservar la información de los retratos existentes en vez de reducir24×22 a8×7. No estirar el mismo dibujo de forma distinta por habitación ni agrandarlo según el tamaño del lienzo. Los25 habitantes deben compartir la misma unidad del mundo; sus diferencias pueden estar en rostro/prendas, sin cambiar la escala con cada sala.

La huella de colisión corresponde a los pies, no al rectángulo vertical del cuerpo: un personaje puede ocultar visualmente suelo o pared detrás de su cabeza. Hay que reservar separación entre pies y evitar que el cuerpo se coloque delante de un mueble de forma incoherente con la profundidad. La tabla siguiente recomienda la misma familia44–48px después de corregir las cuatro reducciones erróneas. No es una medición antropométrica exacta: es una calibración visual basada en muebles reconocibles del propio arte.

## Inventario completo

`≈` indica una medición visual o el contorno del objeto usado por la máscara; los valores exactos de la litera y los colchones proceden de sus recortes. Todos los tamaños se expresan en píxeles de la exportación auditada, antes del zoom del visor. “44–48” es la altura recomendada del personaje en la escala corregida del mundo.

| Sala | PNG auditada | Procedencia y reducción | Anclaje del mobiliario | Personaje | Observación concreta |
| --- | --- | --- | --- | --- | --- |
| `administration` |172×236 |Office; ÷3, correcto |silla de escritorio ≈18×32; mesa ≈45×29 |44–48px |Nítida; exportación completa, hueco inferior limpio. No ampliar el raster para compensar un muñeco pequeño. |
| `archive` |172×236 |Office; ÷3, correcto |sillas ≈20×32; archivador ≈27×64 |44–48px |Nítida; conserva el hueco ancho de64px y la muesca superior transparente. |
| `bridge` |96×72 |Office_1; ÷4 actual; debe ÷2 |silla actual ≈9×16; tras corregir ≈18×32 |44–48px |P1: se eliminó uno de cada dos píxeles nativos por eje; mandos y sillas quedan reducidos. Reexportar desde fuente2×, no ampliar PNG96×72. |
| `cabin1` |204×205 |Render histórico / sprites; 1:1; sin reducción global |litera 28×62; silla 16×36 |44–48px |Nítida; litera y variación propia completas. El avatar17px es mucho más bajo que la silla. |
| `cabin2` |204×205 |Render histórico / sprites; 1:1; sin reducción global |litera 28×62; silla 16×36 |44–48px |Nítida; libros, litera y espacio de trabajo completos. |
| `cabin3` |204×205 |Render histórico / sprites; 1:1; sin reducción global |litera 28×62; silla 16×36 |44–48px |Nítida; cuadro propio preservado. No se detecta pérdida de detalle del export. |
| `cabin4` |204×205 |Render histórico / sprites; 1:1; sin reducción global |litera 28×62; silla 16×36 |44–48px |Nítida y reflejada coherentemente. Las cajas inferiores pertenecen al diseño existente. |
| `cabin5` |204×205 |Render histórico / sprites; 1:1; sin reducción global |litera 28×62; silla 16×36 |44–48px |Nítida; armario adicional completo. La salida norte coincide con el hueco de escalera. |
| `camp` |134×183 |Composición JPG exterior; ÷3, correcto con compresión |silla plegable ≈24×44; tienda ≈70×110 |44–48px |P2: halo blanco/píxeles JPEG claros en perímetro de tienda y vegetación. El factor3 es correcto; ampliar no elimina ese halo. |
| `common` |124×140 |Xmas_3; ÷4, correcto |butaca ≈29×42; mesa baja ≈39×36 |44–48px |Nítida pese a124px de ancho; butaca, regalos y guirnalda conservan detalle1px. No hay sobrerreducción. |
| `dig1` |245×181 |Render histórico / sprites; 1:1; sin reducción global |cama ≈62×43; silla/sillón ≈29×38 |44–48px |P2: luz semitransparente fuera del contorno y relleno visible en la muesca exterior. Export conserva iluminación histórica; no es un fallo PNG. |
| `dig2` |181×187 |Render histórico / sprites; 1:1; sin reducción global |cama ≈40×75; silla ≈25×40 |44–48px |P2: halo semitransparente histórico fuera de la sala; color de fondo varía según el visor. Objetos completos y nítidos. |
| `dig3` |137×222 |shelter-bunk-and-stores.jpg; ÷2 nominal; JPG ya remuestreado |litera y escalera ≈70×90; taquilla baja ≈31×30 |44–48px |P2: fuente JPEG ya remuestreada; calendario, litera y bordes tienen tonos intermedios. No hay prueba suficiente de un factor entero alternativo. |
| `dig4` |188×188 |xmas-container-room.jpg; ÷4, correcto con compresión |cama ≈31×58; taburete ≈15×24 |44–48px |Factor4 correcto; quedan leves artefactos JPEG de la referencia en decoración fina. Conserva íntegro el dormitorio. |
| `dig5` |226×273 |Shelter 32×32 / capas; 1:1 salvo colchón y contorno |colchón fuente24×43, colocado29×51; botella16×32 |44–48px |P2: colchón24×43 se estira a29×51 (1.208×/1.186×), deformación no entera. Sala muy vacía ya en el kit; no es pérdida de exportación. |
| `dig6` |226×273 |Shelter 32×32 / capas; 1:1 salvo colchón y contorno |colchón fuente24×43, colocado29×51; botella16×26 |44–48px |P2: mismo estiramiento de colchón24×43→29×51. Suelo/contorno agrandado desde recorte64×64; píxel no uniforme en el borde. |
| `dispatch` |203×172 |Office; ÷3, correcto |silla ≈20×38; mesa ≈62×35 |44–48px |Nítida; GIF3× y doble puerta añadida del pack están a la misma escala. La puerta dibujada pertenece a la composición anterior, no a una pérdida de export. |
| `dock` |216×144 |Shelter; ÷4 actual; debe ÷3 |bidón actual ≈12×24; corregido ≈16×32 |44–48px |P1: fuente3× dividida por4; columnas y bidones pierden píxeles y presentan anchuras irregulares. Reexportar288×192. |
| `face` |216×144 |Shelter_3; ÷4 actual; debe ÷3 |neumático actual ≈18×12; corregido ≈24×16 |44–48px |P1: fuente3× dividida por4; neumáticos, tablones y pala pierden detalle. Reexportar288×192. |
| `games` |179×217 |Render histórico / sprites; 1:1; sin reducción global |sillón ≈29×40; mesa ≈32×24 |44–48px |P2: franja de luz semitransparente fuera del marco (sobre todo márgenes laterales). Arte interior completo. |
| `garden` |130×159 |Garden / Workshop PNG; ÷4, correcto |bidones/jardineras ≈16–24 px ancho y24–32 alto |44–48px |Nítida, factor4 correcto; plantas y jardineras completas. Tamaño pequeño real de la composición, no falta de resolución. |
| `grandbedroom` |140×172 |Mansion PNG; ÷4, correcto |cama ≈62×84; mesilla ≈26×34 |44–48px |Nítida; colcha, cama y retratos conservan trama de1px. Dormitorio compacto con muebles a escala normal. |
| `graveyard` |197×240 |Graveyard_2 PNG; ÷3, correcto |lápida ≈23×42; poste ≈16×64 |44–48px |Nítida; factor3 exacto. La última fila/columna no exportada de la fuente son blancas: no falta vegetación. |
| `hearth` |172×204 |Mansion_4 PNG; ÷3, correcto; suavizado vertical fuente |butaca ≈30×43; mesa baja ≈17×17 |44–48px |P2 leve: la fuentePNG tiene suavizado vertical en algunos tonos; factor3 confirmado en bordes de alto contraste. No reducir más. |
| `hold` |144×192 |Shelter; ÷4 actual; debe ÷3 |bidón actual ≈12×24; corregido ≈16×32 |44–48px |P1: fuenteGIF3× dividida por4. Reexportar192×256; rehacer el parche de abertura de la valla desde las coordenadas de fuente. |
| `infirmary` |154×218 |Render histórico / sprites; 1:1; sin reducción global |taquilla ≈20×56; silla ≈16×31 |44–48px |Nítida; taquilla, silla, botes y lámpara completos. Avatar17px no alcanza el respaldo de la silla. |
| `kitchen` |172×204 |Kitchen / Bathroom PNG; ÷4, correcto |mesa ≈48×46; frigorífico ≈64×64 |44–48px |Nítida; factor4 exacto. Las piezas al borde inferior terminan en el recorte aprobado; no es recorte accidental de producción. |
| `library` |140×172 |Mansion PNG; ÷4, correcto |escritorio ≈61×43; silla ≈20×30 |44–48px |Nítida; libros pequeños sí mantienen líneas de1px. Debe crecer el personaje, no la habitación aislada. |
| `maindiner` |236×204 |Diner PNG; ÷4, correcto |sillas ≈15×25; módulos banco ≈22×47 |44–48px |Nítida; tablero y bancos bien alineados, factor4 exacto. El espacio cerrado del mostrador es diseño/colisión, no defecto del PNG. |
| `maintenance` |288×196 |Workshop_4 JPG; ÷4 nominal; fuente remuestreada |taquilla ≈24×48; silla oficina ≈20×32 |44–48px |P2: la fuenteJPG ya está reescalada/filtrada, sin periodo entero nítido estable; halo claro junto al borde inferior. No cambiar ÷4 sin recuperar referencia exacta. |
| `parlour` |172×204 |Midcentury / Xmas PNG; ÷4, correcto |butaca ≈23×47; mesa ≈38×46 |44–48px |Nítida; muebles, plantas y alfombra completos. La mayor superficie no exige agrandar el avatar respecto a Study. |
| `projection` |140×172 |Midcentury / Xmas PNG; ÷4, correcto |butaca ≈31×45; reposapiés ≈26×23 |44–48px |Nítida; butaca y proyector conservan detalles de1px. No hay exportación incompleta. |
| `records` |172×172 |Office_5 JPG; ÷4; compresión / fase horizontal |silla ≈18×30; mesa ≈46×35 |44–48px |P2 leve: compresión y transición horizontal de la fuenteJPG; eje vertical conserva periodo4. No se demuestra otro factor global. |
| `salon` |236×204 |Mansion_3 PNG; ÷3, correcto |sofá ≈55×60; silla ≈22×34 |44–48px |Nítida; factor3 correcto y dos zonas completas. La partición central no es arte omitido. |
| `servicecounter` |140×172 |Diner PNG; ÷4, correcto |silla ≈16×31; mostrador ≈74×29 |44–48px |Nítida aunque pequeña; factor4 correcto. Sillas a escala comparable a las del comedor grande. |
| `sheltergate` |207×204 |Composición JPG exterior; ÷3, correcto con compresión |bidones ≈16×32; puerta de fuente ≈32×64 |44–48px |P2: halo blanco visible alrededor del montículo y sacos; ruido JPEG en bordes. Factor3 correcto; requiere limpiar máscara exterior, no inventar textura. |
| `sodabar` |172×204 |Diner PNG; ÷4, correcto |taburetes ≈15×23; silla ≈15×30 |44–48px |Nítida; tablero, rótulo y taburetes completos. Fuente4× correctamente recuperada. |
| `sparebedroom` |140×172 |Midcentury / Xmas PNG; ÷4, correcto |cama ≈58×53; butaca ≈31×29 |44–48px |Nítida; cama y lámparas completas. No hay reducción incorrecta a pesar del pequeño tamaño del lienzo. |
| `stalls` |108×140 |Kitchen / Bathroom PNG; ÷4, correcto |inodoro ≈25×43; panel ≈28×64 |44–48px |Nítida; factor4 correcto.108px de ancho corresponde al diseño compacto, no a un error del export. |
| `study` |140×172 |Midcentury / Xmas PNG; ÷4, correcto |butaca ≈32×35; escritorio ≈47×41 |44–48px |Nítida; objetos mantienen sus trazos y proporciones. El alto del personaje debe basarse en la silla, no en140px del lienzo. |
| `washroom` |140×140 |Kitchen / Bathroom PNG; ÷4, correcto |inodoro ≈26×42; panel ≈30×64 |44–48px |Nítida; dos interiores y sus dos aberturas se conservan. No fusionar para hacer caber personajes mayores. |
| `well` |184×170 |Render histórico / sprites; 1:1; sin reducción global |inodoro ≈25×43; lavabo ≈24×32 |44–48px |Nítida; render histórico1:1. Grafitis y basura mantienen detalle; no añadir interpolación para ampliarlo. |
| `winter` |140×172 |Midcentury / Xmas PNG; ÷4, correcto |butacas ≈26×35; cómoda ≈41×30 |44–48px |Nítida; árbol/guirnalda y retratos conservados. No hay pérdida general de píxeles. |
| `workshops` |250×228 |Render histórico / sprites; 1:1; sin reducción global |taquilla roja ≈24×59; taburete ≈17×26 |44–48px |Nítida; render1:1 conserva rejilla y herramientas. Su escala de muebles es buen patrón para todo el hábitat. |
| `yard` |133×175 |Garden / Workshop PNG; ÷4, correcto |bidón ≈16×32; contenedor ≈30×20 |44–48px |Nítida; fuente4× correcta. El cambio de terreno procede de la paleta ya aprobada, no de compresión. |

## Prioridad después de corregir los cuatro factores

1. Mantener píxeles enteros y `imageSmoothingEnabled=false` en la exportación y el visor. Comparar a idéntico zoom de pantalla antes de juzgar una sala “menos detallada”.
2. Limpiar únicamente el fondo exterior de Camp y Shelter Entrance. El halo blanco viene de la composición JPEG sobre blanco; una ampliación no lo arregla. Preservar los objetos claros interiores y contrastar la máscara sobre fondo oscuro y claro.
3. Revisar la luz semitransparente que los renders históricos dejan fuera de Dig1, Dig2 y Games. Sus píxeles de esquina tienen alfa31,59 y45, respectivamente; no son márgenes transparentes. Recortar esa capa al contorno de la sala puede quitar el rectángulo aparente sin cambiar el mobiliario.
4. En Dig5/Dig6, evitar describir el colchón como “1:1”: el kit estira24×43 a29×51 con factores distintos. Si se corrige, restaurar el recorte nativo24×43 o usar una pieza existente con las dimensiones necesarias, conservando su posición y revisando la máscara. No inventar detalle ni llamar mejora de resolución a un estiramiento.
5. No prometer restauración sin pérdida de las referencias JPEG remuestreadas de Dig3, Maintenance o Records. Para mejorar de verdad una pieza borrosa, cotejarla con el sprite existente del pack y colocarlo en la misma posición; si no se puede demostrar correspondencia, conservar el diseño y documentar la limitación.

## Fuentes de la auditoría

- [Inventario y máscaras del producto](../public/habitat/rooms.json).
- [Adaptación de salas y recortes de Bridge](../tools/roomlab/explorer-room-art.js).
- [Manifiesto completo de fuentes y umbrales](../tools/roomlab/explorer-room-art-sources.md).
- [Recortes Canon](../tools/roomlab/canon-partials-kit.js), [Office](../tools/roomlab/office-kit.js), [Exterior](../tools/roomlab/outside-kit.js), [Bedrooms](../tools/roomlab/bedroom-kit.js).
- [Midcentury](../tools/roomlab/midcentury-kit.js), [Heritage](../tools/roomlab/heritage-kit.js), [Facilities](../tools/roomlab/facility-kit.js), [Face](../tools/roomlab/face-kit.js).
- [Personaje actual](../src/components/desk/habitat/ResidentSprite.tsx), [posición y encuadre](../src/components/desk/habitat/RoomScene.tsx).

Comprobaciones realizadas:45 PNG inspeccionadas visualmente;46 dimensiones PNG/JSON coincidentes; períodos de muestreo revisados en todas las composiciones del directorio de fuentes; recortes y factores contrastados con los kits; revisión específica de bordes JPEG, márgenes semitransparentes y anclajes de cama/silla/bidón. Esta auditoría no sustituye la prueba visual posterior de personajes en movimiento ni los tests de colisión tras cambiar escala.

## Prueba de muestreo de referencias comprimidas

Se preparó `tools/roomlab/source-sampling.js`, sin activarlo de forma global. `cropNative` toma un bloque3×3 o4×4 y elige su **medoide**: un píxel real que minimiza la distancia RGBA acumulada a los otros píxeles del bloque. No promedia colores ni genera información nueva. `nativeMedoid` devuelve además la posición de cada píxel elegido para demostrar su procedencia. Los demás factores conservan el copiado normal por vecino más cercano.

Se compararon cinco pares a3× del mismo recorte original. La tabla registra colores únicos antes/después, antes de quitar el fondo blanco o recolorear el terreno; reducir colores es una pista de menos ruido, no una prueba suficiente de mejor arte.

| Referencia | Píxeles modificados | Colores distintos, antes→después | Decisión recomendada |
| --- | ---: | ---: | --- |
| Records |49,67% |5593→4766 |Conservar vecino más cercano por defecto: los contornos parecen más definidos, pero la métrica de error de paleta es mixta. |
| Maintenance |54,66% |10094→10155 |No aplicar: cambia mucho sin demostrar una mejora clara. La referencia ya está filtrada con una rejilla poco estable. |
| Camp |35,05% |5650→5284 |Aplicación selectiva razonable, junto con limpieza del borde blanco; tienda, silla y contorno permanecen reconocibles. |
| Shelter Entrance |27,19% |7041→6598 |Aplicación selectiva recomendada: menos ruido y halo, conservando bidones, sacos, señal y montículo. |
| Hearth |0% |115→115 |No aplicar: idéntico al muestreo actual y sin beneficio. |

En Shelter Entrance, la distancia RGB media al color más próximo de las hojas originales de Shelter baja de3,525 a3,420; los píxeles con distancia>10 bajan de3814 a3627. En Records la media baja de4,616 a4,487, pero los casos>10 suben de2839 a2911: no se presenta como una mejora inequívoca. Esta métrica solo apoya la revisión visual y no sustituye una correspondencia exacta con el sprite fuente.

`clearPageFringe` elimina únicamente el blanco casi neutro conectado al borde, con mínimoRGB230 y diferencia máxima entre canales20. Un contorno oscuro detiene el recorrido. En los pares revisados, la combinación elimina218 píxeles adicionales de página en Camp y163 en Shelter Entrance respecto al muestreo previo y umbral244. Los colores de cualquier píxel que permanece son idénticos a la fuente. El resultado se revisó sobre fondo oscuro; no se aplicó a blancos interiores ni a la iluminación histórica de otras salas.

Verificación del módulo: sus187870 píxeles de salida en los cinco casos coinciden byte a byte con los pares revisados; cada píxel elegido está dentro del bloque original que le corresponde. También se comprobaron el rechazo de bloques/factores incompatibles y un borde oscuro que conserva un objeto blanco interior durante la limpieza de página. ESLint pasa. Las comparativas se encuentran en `/tmp/habitat-art-audit/records-comparison.png`, `maintenance-comparison.png`, `camp-fringe-comparison.png`, `sheltergate-fringe-comparison.png` y `hearth-comparison.png`; son pruebas, no assets finales.

## Correcciones aplicadas y verificación final

La auditoría anterior describe la línea de partida. El visor de producción ya usa Bridge192×144, Dock288×192, Hold192×256, Face288×192 y Breach224×256, exportados de nuevo desde el ZIP. Se regeneraron las máscaras en la misma unidad. Los dos colchones verticales se copian1:1; Camp y Shelter Entrance usan únicamente el muestreo selectivo probado.

En Digging One, Digging Two y Games se retiraron27.903 píxeles exteriores de luz heredada recortando a los contornos exactos de sus páginas fuente. Cada píxel interior, pared, objeto y umbral conserva su RGBA. Los otros ocho renderizadores históricos quedan idénticos. La procedencia y las ventanas exactas figuran en `tools/roomlab/explorer-room-art-sources.md`.

Los habitantes miden24×44 píxeles nativos, con cabeza12×11 obtenida por muestreo entero2:1 de sus retratos. Los25 dibujos son diferentes, comprobados en Chromium. La huella reserva12×8 píxeles y todo el segmento al caminar; una cola conserva a quienes esperan sitio en una sala saturada. La distribución inicial de25 habitantes cabe sin cola. Hay53 pruebas de movimiento y saturación de las45salas.

Se recorrieron las45salas en el visor React: todas cargaron, sólo una imagen de sala simultánea y escalaentera. El encuadre permite un pequeño desplazamiento antes de reducir el detalle a la mitad; los controles de zoom usan1×–5× enteros. Revisión de escritorio1280×720 y móvil390×844, atlasizquierdo presente y sin desbordamiento horizontal del documento. Las limitaciones de detalle de los JPEG originales permanecen donde no existe evidencia de una recuperación fiel.
