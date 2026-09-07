# Navegación nativa: correcciones y evidencia

Implementación realizada solamente en Villa-Treny. El estado económico y las intenciones siguen separados de la ubicación escénica: estas rutas y reservas gobiernan los pies visibles, no los intercambios del motor.

## Correcciones verificadas

- El grafo usa píxeles nativos (`cellSize = 1`). Una huella mide 12 × 8 píxeles; seis quedan detrás del ancla y dos por delante. Se comprueban sus 96 píxeles, no el centro de una celda de 4 px. La persona conserva su tamaño de 24 × 44.
- Los umbrales permiten la parte de huella que atraviesa el borde exclusivamente dentro de la abertura real. Se verificaron los cinco accesos norte de los camarotes.
- Las posiciones iniciales pertenecen exclusivamente a componentes conectados con un acceso. El suelo físicamente libre de una isla sigue siendo suelo en la máscara; su falta de acceso se diagnostica separadamente. Washroom conserva sus dos componentes y sus dos entradas.
- La interpolación reserva toda la huella barrida y comprueba cada píxel intermedio. Agrupa hasta cuatro pasos rectos sin cortar esquinas. Acepta recorridos de un solo píxel y busca un desvío si otra persona ocupa el paso.
- La cola mantiene los identificadores de quienes no caben. Libera y admite en orden de espera sin solapar personas ni borrar habitantes de los datos.

## Ocho pruebas independientes del arte

Las coordenadas son el ancla del pie sobre el PNG final, no índices inventados a partir de las máscaras. Los ocho puntos fueron aceptados por el planificador anterior y ahora se rechazan.

| Sala | Objeto visto en el PNG | Pie nativo | Resultado |
|---|---|---|---|
| Common | Reposapiés | 94, 114 | Bloqueado |
| Games | Caja azul | 114, 146 | Bloqueado |
| Dock | Barril | 62, 162 | Bloqueado |
| Hold | Barril amarillo | 66, 106 | Bloqueado |
| Maintenance | Banco de trabajo | 178, 122 | Bloqueado |
| Archive | Silla inferior izquierda | 14, 214 | Bloqueado |
| Winter | Butaca izquierda | 18, 130 | Bloqueado |
| Service Counter | Tablero de mesa | 78, 106 | Bloqueado |

El punto Yard (62, 126) se descartó como supuesto defecto porque el PNG muestra suelo libre: no se añadió una barrera. Un ensayo separado abre un paso de 12 px y rechaza uno de 11 px; no declara transitable un hueco físicamente demasiado estrecho.

## Profundidad y procedencia

`RoomArt.objects` contiene el recorte nativo `[x,y,w,h]`, su `baseY`, una máscara alfa binaria de exactamente `h` filas por `w` columnas y el archivo/recorte de la imagen fuente. El renderer debe copiar exclusivamente esos píxeles del PNG de la sala delante de una persona cuyo pie quede por encima de `baseY`; no se añade un rectángulo opaco de suelo. `outlineMask` usa el alfa del PNG completo, incluidas paredes.

La primera entrega contiene 136 objetos de los sprites originales de Shelter y Makeshift en Cabin 1–5, Dig 1–2 y Games. `tools/roomlab/measure/object-masks.py` regenera sus coordenadas y máscaras; no genera RGB. Los alfombrines planos se excluyen y los huecos entre patas se rellenan solo en la huella física, nunca en la máscara visual. Las otras composiciones se investigan por coincidencia con sus spritesheets RGBA; las máscaras manuales existentes no constituyen por sí solas una prueba universal de exactitud.

## Barrido adversarial de las 45 salas

Se colocaron los 25 residentes en cada sala por separado y se simularon 12 segundos, leyendo los 96 píxeles de los pies interpolados cada 95 ms y comparando cada pareja de personas. Resultado: cero pies sobre obstáculos, cero solapamientos, cero pérdida de habitantes y movimiento en las 45 salas. Esto demuestra consistencia contra la máscara actual; las ocho pruebas visuales anteriores aportan evidencia independiente de la misma.

`Aisladas` cuenta posiciones válidas para la huella completa que carecen de acceso: no son celdas de pared y no se usan para colocar habitantes. `Cola` es el máximo estrés de 25 visitantes en una sola sala, no la población normal. La población inicial real de 25 se coloca sin cola.

| Sala | Posiciones accesibles | Aisladas | Cola inicial → final | Residentes que avanzaron | Objetos alfa |
|---|---:|---:|---:|---:|---:|
| bridge | 6350 | 473 | 0 → 0 | 21 | 3 |
| dock | 32719 | 0 | 0 → 0 | 24 | 10 |
| hold | 19083 | 235 | 0 → 0 | 13 | 9 |
| common | 762 | 128 | 12 → 12 | 13 | 7 |
| administration | 5186 | 743 | 0 → 0 | 20 | 7 |
| dispatch | 4722 | 128 | 0 → 0 | 21 | 3 |
| archive | 7621 | 0 | 0 → 0 | 22 | 10 |
| records | 3829 | 18 | 0 → 0 | 10 | 1 |
| camp | 7061 | 0 | 0 → 0 | 14 | 0 |
| garden | 5010 | 0 | 0 → 0 | 21 | 12 |
| sheltergate | 1454 | 10 | 10 → 3 | 17 | 1 |
| yard | 3774 | 0 | 0 → 0 | 14 | 6 |
| study | 2938 | 171 | 0 → 0 | 19 | 6 |
| sparebedroom | 2739 | 384 | 0 → 0 | 14 | 4 |
| parlour | 4682 | 184 | 0 → 0 | 19 | 10 |
| projection | 2968 | 36 | 0 → 0 | 24 | 8 |
| winter | 1056 | 809 | 12 → 10 | 8 | 5 |
| library | 4646 | 0 | 0 → 0 | 14 | 5 |
| grandbedroom | 2660 | 532 | 0 → 0 | 16 | 5 |
| salon | 10594 | 0 | 0 → 0 | 23 | 8 |
| hearth | 3472 | 1767 | 0 → 0 | 13 | 9 |
| maindiner | 7518 | 1260 | 0 → 0 | 13 | 12 |
| sodabar | 5500 | 914 | 0 → 0 | 19 | 7 |
| servicecounter | 1910 | 0 | 0 → 0 | 22 | 5 |
| graveyard | 8297 | 0 | 0 → 0 | 21 | 14 |
| maintenance | 3227 | 819 | 0 → 0 | 21 | 1 |
| kitchen | 2138 | 0 | 0 → 0 | 25 | 6 |
| stalls | 1550 | 0 | 6 → 4 | 11 | 4 |
| washroom | 3433 | 0 | 0 → 0 | 13 | 4 |
| face | 29029 | 0 | 0 → 0 | 23 | 11 |
| dig3 | 4459 | 0 | 0 → 0 | 17 | 0 |
| dig4 | 2846 | 1204 | 0 → 0 | 15 | 2 |
| dig5 | 23464 | 0 | 0 → 0 | 16 | 8 |
| dig6 | 20205 | 0 | 0 → 0 | 13 | 8 |
| workshops | 10332 | 140 | 0 → 0 | 15 | 6 |
| infirmary | 5364 | 0 | 0 → 0 | 19 | 11 |
| well | 2406 | 0 | 0 → 0 | 16 | 4 |
| cabin1 | 6620 | 148 | 0 → 0 | 20 | 13 |
| cabin2 | 6971 | 148 | 0 → 0 | 20 | 12 |
| cabin3 | 7751 | 148 | 0 → 0 | 20 | 12 |
| cabin4 | 7095 | 148 | 0 → 0 | 18 | 12 |
| cabin5 | 6543 | 148 | 0 → 0 | 18 | 13 |
| dig1 | 4419 | 0 | 0 → 0 | 20 | 35 |
| dig2 | 4335 | 527 | 0 → 0 | 17 | 22 |
| games | 4056 | 0 | 0 → 0 | 20 | 17 |

## Comprobaciones

- 65 pruebas de `room-motion.test.ts`: accesos de las 45 salas, ocho muebles, separación WC, isla conservada, umbral norte, ancho de paso, profundidad del cofre, velocidad nativa, reservas, desvíos, colas y población real.
- ESLint de `room-art.ts`, `room-motion.ts` y `room-motion.test.ts`: pasa.
- Exportación y comparación de PNG/manifiesto: las ejecuta el script general `pnpm rooms:export` / `--verify`.

## Límites que siguen requiriendo inspección del arte

La cuantización de 4 px desapareció, pero una máscara manual puede seguir describiendo un mueble con exceso de margen o dejar un objeto sin medir. No se considera resuelto ese riesgo por pasar un test que consulte la misma máscara. Se amplía la procedencia por componentes alfa y se conserva la lista de huecos sin acceso para distinguir una separación física real de un error de autoría.

## Segunda pasada: composiciones aplanadas

Se buscaron componentes de los spritesheets RGBA originales a escala nativa, también reflejados, en las 38 composiciones restantes. Se calcularon correlación normalizada y proporción de píxeles de color coincidentes; se inspeccionaron las 478 coincidencias obtenidas en cinco contactos. La selección descarta elementos planos y exige que el objeto corresponda a mobiliario ya medido. Las capas nuevas solo añaden profundidad visual; las colisiones no se ensanchan por aceptar una coincidencia.

- `measure/match-room-objects.py` produce candidatos, sin modificar arte. Requiere Pillow, NumPy y SciPy.
- `measure/room-object-matches.json` conserva todas las fuentes, coordenadas, reflejos, métricas y decisiones de profundidad revisadas.
- `measure/room-object-placements.json` conserva las capas 1:1 de Dig5/6 declaradas en el renderer original.
- `measure/object-masks.py` genera `room-objects.js`; cada píxel de máscara procede del alfa de un sprite existente.

La butaca blanca de Winter, tapada por un cojín y una planta, requirió revisión individual: Midcentury `[327,425,25,53]`, reflejado horizontalmente, en `[10,95]`. La correlación de la figura entera baja a 0,765 por esa oclusión, pero el 76,1 % de los píxeles conserva el color del sprite y su contorno coincide visualmente. El reposapiés de Common procede de Fancy Mansion `[7,47,20,16]` colocado en `[83,105]`, con coincidencia 1,0.

Camp no dispone de sprites del pack de acampada en la biblioteca descomprimida; Dig3 usa una referencia JPEG reducida cuyos muebles no produjeron coincidencias fiables. Se intentaron ambas y se conservó el arte sin inventar alfa. Los muebles que la composición tapa o modifica tampoco se aceptaron automáticamente por compartir un rectángulo: esto limita especialmente los grandes bancos de Maintenance y la mesa modular de Service Counter. Su colisión está corregida; no se declara demostrada su oclusión completa.

### Evidencia visual

- [Ocho pies que antes atravesaban mobiliario](evidence/navigation-eight-probes.png). El marco rosa es un diagnóstico de 12 × 8 px; no forma parte del arte del hábitat.
- Contactos de posiciones encontradas en las fuentes: [1](evidence/depth-source-matches-1.png), [2](evidence/depth-source-matches-2.png), [3](evidence/depth-source-matches-3.png), [4](evidence/depth-source-matches-4.png), [5](evidence/depth-source-matches-5.png). Los marcos son diagnóstico; algunas coincidencias planas visibles en estos contactos se rechazaron después como capas de profundidad.

### Verificación final contra ambos ZIP originales

Se localizaron únicamente los dos archivos originales esperados en Downloads: `Archive_referencias_por_libreria.zip` y `Archive.zip`, con 149 entradas no auxiliares cada uno. Se leyeron sus índices y se compararon SHA-256; no se extrajeron recursos ajenos a la tarea.

- **Camp:** el único recurso del pack de acampada en el archivo organizado es `Ejemplos de sala/Camping_Set_1.jpg`. No hay directorio de objetos Camping ni imagen RGBA de su tienda/silla/fogata. El segundo ZIP contiene el mismo JPEG con nombre hash.
- **Dig3:** su archivo local coincide byte a byte con `Ejemplos de sala/Post Apoc Shelter - Asset Pack_4.jpg`. Los spritesheets Shelter de 16 y 32 px ya están disponibles; la referencia promocional usa otra escala/remuestreo y sus componentes no ofrecen coincidencias suficientes. El análisis anterior de esta fuente ya documentó escalas no enteras y máximos de correlación de 0,67 en pruebas de ×1 a ×4. No existe una versión RGBA separada de esta composición en ninguno de los dos ZIP.

En ambos casos, eliminar el suavizado o separar siluetas completas implicaría adivinar píxeles/contornos que estas fuentes no conservan. Se mantiene el JPEG aprobado y se documenta la limitación sin sustituirlo por arte nuevo. Los hashes y rutas de cada coincidencia están en [la evidencia de fuentes ZIP](evidence/unmatched-room-zip-sources.json).

La entrega final contiene **368 objetos con alfa de fuente en 43 de las 45 salas utilizables**; cinco objetos adicionales pertenecen a Breach sellado. Se verificaron los 373 contra el alfa original, incluidos sus reflejos: coincidencia exacta, sin errores. La tabla anterior refleja los conteos finales. Las pruebas conjuntas de navegación y movimiento suman **80 pruebas que pasan**; el barrido adversarial final de 45 salas volvió a pasar.
