# Auditoría de navegación y arte del hábitat — 7 de septiembre de 2026

Auditoría **de lectura**, realizada sobre Portfolio antes de extraer Villa-Treny. No se modificaron arte, máscaras, motor, interfaz ni Git. Sólo se creó este documento; los programas de medición y las láminas viven en `/tmp/habitat-navigation-audit/`.

## Resultado y alcance

Se revisaron las **45 salas visitables**, comparando las 45 PNG de producción a escala entera con `ROOM_COLLISION`, `rooms.json`, el recorte fuente y la huella real de `RoomScene`. Breach se excluye por estar sellada. Long Walk y Row no son imágenes de este inventario: pertenecen a la red de corredores y requieren el mismo contrato físico al integrarla.

No se halló P0. Hay P1 reproducibles: caminar sobre muebles, aparición en componentes sin acceso y separación entre desplazamiento persistente y desplazamiento visible. **No debe darse por validada una sala porque la máscara se valide contra sí misma.** Las 53 pruebas anteriores detectan solapamientos relativos a sus rectángulos; no verifican que esos rectángulos correspondan al mobiliario dibujado ni que cada posición tenga ruta al umbral.

La medida del personaje es 24×44 píxeles nativos; su huella declarada es 12×8. Las celdas actuales miden 4 px. En este informe `celda (x,y)` se convierte en pies visibles `((x+.5)*4,(y+.5)*4)`. Un recorrido contado en nodos incluye origen y destino.

## Lista priorizada de defectos

### NAV-01 · P1 · La máscara permite pisar mobiliario real

**Evidencia:** `tools/roomlab/explorer-room-art.js:57–98` mantiene rectángulos independientes del arte. `roomNavigation`, líneas 146–149, sólo consulta sus centros. En Chromium se cargaron los módulos reales `room-art.ts`, `room-motion.ts` y `ResidentSprite.tsx`, se calculó la ruta de 12×8 desde la entrada, se llamó a `advanceWalkers` con el último segmento y se dibujó el sprite real en el destino. Los ocho casos siguientes devolvieron `standing=true`, ruta no vacía y segmento aceptado:

| Sala | Objeto visible | Celda aceptada | Pies nativos | Nodos desde llegada | Declaración a corregir |
| --- | --- | --- | --- | ---: | --- |
| Common | Reposapiés rojo | (23,28) | (94,114) | 12 | explorer-room-art.js:62 |
| Games | Caja azul al lado de la butaca | (28,36) | (114,146) | 16 | explorer-room-art.js:91 |
| Dock | Bidón del grupo inferior izquierdo | (15,40) | (62,162) | 51 | explorer-room-art.js:59 |
| Hold | Bidón amarillo del interior | (16,26) | (66,106) | 47 | explorer-room-art.js:61 |
| Maintenance | Banco de trabajo central | (44,30) | (178,122) | 25 | explorer-room-art.js:84 |
| Archive | Silla inferior izquierda | (3,53) | (14,214) | 17 | explorer-room-art.js:65 |
| Winter | Sillón izquierdo | (4,32) | (18,130) | 21 | explorer-room-art.js:75 |
| Service Counter | Tablero inferior de barra/mesa | (19,26) | (78,106) | 22 | explorer-room-art.js:82 |

**Reproducción:** `/tmp/habitat-navigation-audit/reproduce.mjs`; resultado `reproduction.json`; cada `repro-<sala>.png` contiene arte y personaje de producción. Son ejemplos positivos, no una lista exhaustiva de todos los píxeles incorrectos. También se probó una negativa: Dig2, pies (66,90), se rechaza correctamente sobre el ordenador. El punto Yard (62,126) se descartó tras revisar la imagen: era suelo, no un muro.

**Corrección propuesta:** inventario de entidades por sala con recorte/destino exactos, contorno real de ocupación y base de profundidad. Crear la máscara a partir de ese inventario; distinguir mobiliario sólido, muro, terreno y decoración plana. No añadir grandes bloques sobre suelo libre para ocultar los fallos. Para composiciones aplanadas, anotar cada ROI y su máscara sobre los píxeles originales, sin dibujar arte nuevo. Tras corregir, estas ocho rutas deben detenerse antes del objeto, y conservar ruta por el suelo lateral si existe.

### NAV-02 · P1 · Residentes que nacen atrapados en islas de suelo

**Evidencia:** la conectividad se filtra para un punto de 4 px en `explorer-room-art.js:175–185`. Después `room-motion.ts:18–29` erosiona esa máscara para la huella de 12×8, creando otros componentes. `reconcileWalkers`, líneas 59–68, permite aparecer en todos ellos sin relación con una entrada.

Se contaron **593 posiciones en islas sin entrada, repartidas por 20 salas**. Con los 25 habitantes presentes, 14 salas colocan al menos uno en una isla. El fallo ya existe con la distribución inicial real: **I en Administration, celda (4,49), y K en Dispatch, celda (3,28)** no tienen ninguna ruta de 12×8 a una llegada. `reproduction.json.initial` reproduce ambos sin llenar artificialmente la sala.

**Corrección propuesta:** calcular componentes después de aplicar la huella definitiva y asignar cada spawn a un componente que contenga una entrada válida. Conservar las posiciones de suelo inaccesibles como diagnóstico geométrico, no renombrarlas automáticamente como mueble. Si la geometría real ofrece un paso, corregir el contorno; si no cabe una huella de 12×8, conservar la limitación o recolocar una pieza existente durante la fase de implementación. Nunca teletransportar al habitante dentro del bolsillo.

### NAV-03 · P1 · La posición visible no es la posición persistente ni cruza umbrales

**Evidencia:** `RoomScene.tsx:26–39` usa sólo la pertenencia de `snapshot.people` a una sala y genera otra posición por ID; no usa `PersonState.at`. `room-motion.ts:82–100` elige destinos locales arbitrarios. No hay consumo de `art.exits` ni transición de sala en ese movimiento. En cambio `engine/state.ts:151–176` coloca a la persona directamente usando el grid narrativo de `ROOM_BY_ID`; `engine/verbs.ts:651–655` permite completar un cambio de sala aunque no haya reproducción física de un pasillo.

Por tanto, que el personaje camine en el PNG no demuestra que esté realizando el desplazamiento del motor. Cambiar a otra sala/remontar el componente reinicia la posición visible. La red de `navigation.ts` y el explorador RoomLab constituyen otro modelo de ruta. Esta separación impide garantizar una trayectoria única entre habitantes, pasillos, entradas y objetos.

**Corrección propuesta:** una posición/recorrido autoritativos por residente, con escena, ancla en píxeles o unidad explícita, portal de entrada y destino. Motor y render consumen el mismo grafo y las mismas superficies. La cámara puede mostrar una sola escena; eso no obliga a simular únicamente esa escena. Los cambios de sala deben registrarse al cruzar el umbral válido y conservar el residente en una cola si la llegada está ocupada. La actividad de seis horas puede resumirse, pero ese resumen y la reproducción deben tener un contrato explícito, no dos posiciones independientes.

### NAV-04 · P2 · Falta orden de dibujo respecto de los objetos

**Evidencia:** `RoomScene.tsx:74–78` coloca una única imagen aplanada debajo de todos los personajes; `zIndex: pose.y` sólo ordena personas. No existe base Y ni máscara de primer plano para el mobiliario.

Caso reproducido con una posición de suelo válida: Cabin1, pies **(130,158)**, celda (32,39). La caja existente se estampa en `(136,132)`, fuente `shelter_furniture.png`, celda de hoja `(17,13)`, 32×32 (`cabins.html:45`; hoja configurada en :186). El hombro/brazo del personaje ocupa el borde izquierdo de la caja y se dibuja encima aunque su ancla esté al norte de la base del objeto. Evidencia: `cabin1-occlusion-4x.png`. No hace falta bloquear ese suelo lateral para corregir el dibujo.

**Corrección propuesta:** suelo base + entidades ordenadas por su Y de apoyo + actores + fragmentos de primer plano. En el caso de un PNG aplanado, reutilizar el recorte de la propia sala con una máscara exacta y aplicarlo cuando el actor deba quedar detrás. No recortar un rectángulo opaco que también tape suelo o partes vecinas. La geometría de ocupación y la máscara visual son datos diferentes.

### NAV-05 · P2 · La comprobación por centros permite invadir bordes

**Evidencia:** `explorer-room-art.js:147–149` considera libre un bloque 4×4 si su centro queda fuera de sólidos, aunque parte de ese bloque se solape. El ensayo alternativo rasteriza los rectángulos declarados a 1 px y exige los **96 píxeles de una huella 12×8** libres. Encontró **3150 posiciones aceptadas por el grid actual que no cumplen esa huella completa**, repartidas por las 45 salas. Es una medida contra la geometría declarada, no una segmentación automática del arte.

Ejemplo simple: floor empieza en x6, pero un bloque con centro x6 se marca libre y abarca x4…7; el borde exterior de 2 px queda incluido. Los bordes de muebles no alineados a múltiplos de cuatro presentan el mismo problema.

**Comprobación de resolución:** con los mismos rectángulos, pasar a 1 px **no reconecta ninguna de las 593 posiciones aisladas** de NAV-02. No se puede prometer que cambiar a 2 px resuelva ese fallo. Por ejemplo Administration deja sólo 5 px entre el final del volumen `(6,126,28,45)` y el principio de `(29,176,16,40)`; la profundidad de 8 px no cabe. Hace falta medir el objeto real y después decidir si el hueco físico existe.

**Corrección propuesta:** máscara de ocupación nativa por píxel; para acelerar, una cuadrícula de 2 px derivada comprobando cobertura completa, con conexión demostrada de cada paso. Si un paso real admite 12 px pero la fase de la cuadrícula lo cierra, permitir anclas subcelda enteras o navegación nativa. No ensanchar el paso atravesando un sprite ni reducir la huella global para aprobar el test.

### NAV-06 · P2 · Salidas norte incompatibles con la huella del caminante

**Evidencia:** las cinco Cabin tienen salida `at.y=0` (`explorer-room-art.js:104–106`); `clearanceRoom` exige también `grid[y-1]` (`room-motion.ts:21–22`). Las cinco salidas son inválidas aunque las cinco llegadas interiores sí sean válidas. El explorador de punto puede cruzarlas; el caminante de 12×8 no. La situación se debe resolver antes de unificar NAV-03.

**Corrección propuesta:** modelar cada portal como una banda y un segmento de cruce. La fracción de huella que sale de la escena pertenece al portal/conector, no a un muro implícito. Comprobar anchura, dirección, llegada libre y recorrido de ida y vuelta con la misma huella. Mantener las dos bandas de Washroom y no buscar ruta entre sus compartimentos por dentro del tabique.

### NAV-07 · P2 · Capacidad y progreso visibles no se prueban con la máscara sola

**Evidencia:** prueba adversaria de 60 segundos, 25 residentes en cada sala, ejecutando `advanceWalkers` y reintentando la cola cada 80 ms. Common empieza con 10 en cola y acaba con 7 nunca admitidos; 6 de los visibles no cambian de celda. Sheltergate pasa de 6 en cola a 2, con 7 inmóviles; Stalls de 4 a 1, con 8 inmóviles. Otros casos inmóviles aparecen en la tabla. La cola conserva los IDs correctamente; estos datos **no demuestran pérdida de habitantes**, sino un límite de capacidad y movilidad que la interfaz debe explicar y el diseño debe contemplar.

Parlour coloca a S en una isla de una celda: ahí es imposible caminar. Projection puede ofrecer sólo un paso, pero `room-motion.ts:87` exige una ruta de más de dos nodos para empezar. En zonas llenas, el planificador calcula el camino sin reservas y abandona la ruta cuando el primer tramo está ocupado (`:86`, `:94–97`); no intenta un desvío por otra zona libre.

**Corrección propuesta:** sacar del conjunto de aparición las islas sin acceso, elegir objetivos del mismo componente y planificar con reservas temporales cuando exista un desvío. Aceptar un trayecto de un paso válido como movimiento. La capacidad debe basarse en el suelo y en la entrada real, no en conseguir que todos aparezcan aunque deban atravesarse. Validar colas y progreso con escenas pequeñas y adversarias; mantener población fuera de la vista en los datos.

## Inventario visual completo

`Posiciones` cuenta anclas válidas para la huella actual; `islas` cuenta anclas sin ninguna entrada de su propio componente. `25: inicial/final` es la cola en la prueba de 60 s. `Quietos` son residentes visibles que no cambiaron de celda durante ese ensayo, no todos los que descansaron un rato. El resultado no sustituye la revisión de cada ROI ni demuestra capacidad máxima de empaquetado.

| Sala | PNG nativa | Posiciones | Componentes | Islas | 25: cola inicial/final | Quietos | Observación de arte y geometría |
| --- | --- | ---: | --- | ---: | --- | --- | --- |
| administration | 172×236 | 468 | 408+60 | 60 | 0/0 | — | P1: I nace en (4,49), isla inferior izquierda de 60 posiciones; el hueco entre impresora y silla es de 5 px en el modelo, menor que 8 px. |
| archive | 172×236 | 614 | 614 | 0 | 0/0 | — | P1 demostrado: silla inferior izquierda bajo los pies (14,214). El contorno de la silla no está en los sólidos actuales. |
| bridge | 192×144 | 523 | 482+41 | 41 | 0/0 | — | 41 posiciones aisladas en la esquina inferior izquierda. El PNG es la sección superior/azotea de Office_1; revisar tuberías como suelo o volumen según su proyección. |
| cabin1 | 204×205 | 493 | 493 | 0 | 0/0 | — | P2 demostrado: a (130,158), hombro/brazo se dibuja sobre la caja de (136,132). Salida norte inválida para la huella. Papeles planos sí pueden pisarse. |
| cabin2 | 204×205 | 515 | 515 | 0 | 0/0 | — | Salida norte inválida; la pila de chapas derecha exige distinguir volumen de papel plano. La circulación principal permanece conectada. |
| cabin3 | 204×205 | 564 | 564 | 0 | 0/0 | — | Salida norte inválida; recorrido principal conectado. Mantener papeles transitables y colisión de literas. |
| cabin4 | 204×205 | 528 | 514+14 | 14 | 0/0 | — | 14 posiciones aisladas entre cabeceras y caja central. Salida norte inválida. La máscara reflejada no recupera una ruta de 12×8 hacia ese bolsillo. |
| cabin5 | 204×205 | 499 | 485+14 | 14 | 0/0 | — | 14 posiciones aisladas en el mismo bolsillo; salida norte inválida. Taquilla adicional preservada como sólida. |
| camp | 134×183 | 499 | 499 | 0 | 0/0 | — | Suelo principal conectado. Verificar por separado piedras del fuego y bidones pequeños: el rectángulo único no coincide con todos los bordes del círculo. |
| common | 124×140 | 96 | 96 | 0 | 10/7 | C, D, F, M, N, Q | P1 demostrado: reposapiés rojo bajo los pies (94,114). Sólo 15/25 apariciones iniciales; tras 60 s quedan 7 en cola y 6 visibles inmóviles. |
| dig1 | 245×181 | 395 | 337+58 | 58 | 0/0 | — | 58 posiciones aisladas en rincón superior derecho. La silueta corregida es nítida; el problema restante es circulación entre TV, mesa y pared. |
| dig2 | 181×187 | 288 | 280+8 | 8 | 0/0 | — | 8 posiciones aisladas junto a mesilla inferior derecha. Prueba negativa útil: (66,90), sobre el ordenador, sí se rechaza; no convertir todo el dibujo en suelo. |
| dig3 | 137×222 | 341 | 341 | 0 | 0/0 | — | Componente conectado; fuente JPEG comprimida. Verificar bote naranja y cajas/bidones inferiores individualmente; no bloquear basura plana por proximidad. |
| dig4 | 188×188 | 307 | 218+89 | 89 | 0/0 | — | 89 posiciones aisladas a la izquierda entre árbol, cama y mesa. En estrés 7 residentes aparecen en esa isla. |
| dig5 | 226×273 | 1549 | 1549 | 0 | 0/0 | — | Componente amplio conectado. Colchón restaurado a tamaño nativo. El suelo libre alto es menor que el terreno visible por el rectángulo floor que empieza en y83. |
| dig6 | 226×273 | 1388 | 1388 | 0 | 0/0 | — | Componente amplio conectado. Colchones nativos; el suelo entre chapas altas se excluye globalmente por floor y78 y necesita decisión de superficie real. |
| dispatch | 203×172 | 369 | 355+14 | 14 | 0/0 | — | P1: K nace en (3,28), isla de 14 posiciones junto al escritorio/silla izquierda. No puede alcanzar el umbral. |
| dock | 288×192 | 2301 | 2301 | 0 | 0/0 | — | P1 demostrado: bidón en (62,162) aceptado, ruta de 51 celdas desde entrada. Varias rocas bajas también quedan marcadas como suelo; clasificarlas explícitamente. |
| face | 288×192 | 2013 | 2013 | 0 | 0/0 | — | Componente conectado. Sacos y estructura principal excluidos; vegetación baja puede pisarse. Hay superficies válidas junto a neumáticos que requieren contorno exacto. |
| games | 179×217 | 420 | 420 | 0 | 0/0 | — | P1 demostrado: caja azul en (114,146) aceptada. También revisar caja roja, monitor bajo y caja amarilla frente a la pared. |
| garden | 130×159 | 383 | 383 | 0 | 0/0 | — | Componente conectado; tierra y hojas planas permitidas. Jardineras/bidones deben conservar máscara individual, no el follaje como gran rectángulo que cierre tierra visible. |
| grandbedroom | 140×172 | 234 | 186+48 | 48 | 0/0 | — | 48 posiciones aisladas al lado izquierdo de la cama. Diferenciar cuerpo de cama y zona de suelo entre mesilla y escritorio. |
| graveyard | 197×240 | 582 | 573+9 | 9 | 0/0 | — | 9 posiciones aisladas junto a borde superior/lápida. Máscara del tronco izquierdo y columnas necesita borde nativo; tierra de tumba y hierba baja son suelo. |
| hearth | 172×204 | 429 | 415+14 | 14 | 0/0 | — | 14 posiciones aisladas en borde inferior derecho junto al jarrón. Revisar mesa central y reposapiés: no equivalen al rectángulo de la alfombra. |
| hold | 192×256 | 1431 | 1425+6 | 6 | 0/0 | — | P1 demostrado: bidón amarillo en (66,106) aceptado; 6 posiciones aisladas entre bidones derechos. Mantener abertura real de la verja, no caminar a través de paneles. |
| infirmary | 154×218 | 400 | 400 | 0 | 0/0 | — | Componente conectado; estantería y mesa bloqueadas. Revisar cada botella apilada, sobre todo bordes del conjunto inferior derecho. |
| kitchen | 172×204 | 216 | 216 | 0 | 0/0 | — | Componente conectado, pasillos estrechos entre bancos. Tableros y pies tienen alturas distintas: no usar el borde superior del mueble como única base de profundidad. |
| library | 140×172 | 339 | 339 | 0 | 0/0 | — | Componente conectado; alfombra transitable. Escritorio, silla y chaise longue deben separarse para profundidad; no se demostró aquí un paso central sobre un mueble. |
| maindiner | 236×204 | 580 | 580 | 0 | 0/0 | — | 130 celdas de suelo bruto detrás de la barra se eliminan por no tener acceso. No recuperar ese interior atravesando el mostrador; se necesita hueco real o declarar zona cerrada. |
| maintenance | 288×196 | 412 | 400+12 | 12 | 0/0 | — | P1 demostrado: banco de trabajo bajo los pies (178,122). Hay 12 posiciones aisladas bajo el mueble inferior izquierdo. Fuente JPEG limita el detalle. |
| parlour | 172×204 | 365 | 338+26+1 | 27 | 0/0 | S | 26+1 posiciones aisladas. S aparece en el bolsillo de una sola celda y no camina durante 60 s. La mesa baja no puede confundirse con alfombra. |
| projection | 140×172 | 253 | 247+3+3 | 6 | 0/0 | S | Dos bolsillos de 3 posiciones. S permanece inmóvil en estrés; el planificador exige rutas con más de dos nodos. Revisar contorno de macetas. |
| records | 172×172 | 270 | 268+2 | 2 | 0/0 | L, W | 2 posiciones aisladas junto a papeles/estantería derecha. 2 residentes inmóviles en estrés. Mantener papel plano transitable y silla como volumen. |
| salon | 236×204 | 759 | 759 | 0 | 0/0 | — | Componente conectado entre los dos ambientes. Mesas, silla y reposapiés necesitan base Y separada de la alfombra para oclusión. |
| servicecounter | 140×172 | 207 | 207 | 0 | 0/0 | O, U | P1 demostrado: tablero de barra/mesa en (78,106) aceptado, ruta de 22 celdas. 2 residentes inmóviles con 25; revisar taburetes individualmente. |
| sheltergate | 207×204 | 115 | 115 | 0 | 6/2 | B, M, N, P, T, U, W | Sólo 19/25 apariciones iniciales; 2 siguen en cola tras 60 s. Sacos y bidones delimitan el paso, cuya anchura debe medirse sobre el arte nativo. |
| sodabar | 172×204 | 507 | 404+89+14 | 103 | 0/0 | — | 89+14 posiciones aisladas: detrás de la barra y bajo silla inferior. El área tras mostrador no tiene acceso de 12×8 en el modelo; no habilitar por ficción. |
| sparebedroom | 140×172 | 225 | 195+28+2 | 30 | 0/0 | I, R | 28+2 posiciones aisladas a la izquierda de cama y junto a mesita derecha; 2 residentes inmóviles en estrés. |
| stalls | 108×140 | 125 | 125 | 0 | 4/1 | J, K, N, O, T, U, W, X | Componente principal conectado; 4/25 en cola inicial y 1 tras 60 s. Cubo amarillo y base de lavabos necesitan contorno, no la tapa superior solamente. |
| study | 140×172 | 238 | 212+18+8 | 26 | 0/0 | — | 18+8 posiciones aisladas; 3 residentes del estrés nacen ahí. La lámpara alta y el taburete necesitan base y oclusión separadas. |
| washroom | 140×140 | 249 | 134+115 | 0 | 0/0 | F | Correctamente 2 compartimentos y 2 entradas. Cada uno tiene 115/134 posiciones y su propia llegada; no buscar camino directo a través del tabique. 1 inmóvil en estrés. |
| well | 184×170 | 203 | 203 | 0 | 0/0 | — | Componente conectado; conserva tránsito alrededor de señal y charcos. Hay hueco bajo la puerta/panel izquierdo: distinguir paso físico de superficie proyectada. |
| winter | 140×172 | 211 | 211 | 0 | 0/0 | — | P1 demostrado: sillón izquierdo bajo los pies (18,130), ruta de 21 celdas. El sólido actual empieza demasiado abajo/queda incompleto para el sillón. |
| workshops | 250×228 | 719 | 707+12 | 12 | 0/0 | — | 12 posiciones aisladas al lado izquierdo de la taquilla roja. El paso central sí conecta ambos lados para 12×8; revisar carro rojo y bidones bajos con píxeles nativos. |
| yard | 133×175 | 293 | 293 | 0 | 0/0 | — | Componente conectado. Se descartó como falso positivo (62,126): es suelo libre al lado del panel. No bloquearlo para que parezca más prudente. |

## Contrato de datos propuesto para las 45 salas

No se ha implementado. Un único manifiesto por sala debería contener:

- **Arte:** fuente y recorte exacto, destino nativo, dimensiones y escala entera; raster de suelo o escena base, siempre con procedencia.
- **Superficie:** polígonos/máscara de suelo real; cada píxel es suelo, volumen, muro, vacío o superficie elevada con conexión explícita. Papeles, alfombras y charcos no se convierten en obstáculos.
- **Entidad:** ID local del objeto, ROI, máscara alfa de la parte visible, huella física a nivel del suelo y `baseY`/regla de profundidad. El tamaño del dibujo no equivale automáticamente al tamaño de su huella.
- **Portal:** ID, dirección, banda de anchura real, segmento de cruce, destino y llegada, componente o compartimento. No necesita sprite de puerta.
- **Movimiento:** dimensiones de la huella, máscara derivada con fase/unidad declaradas, componentes accesibles desde portales, reservas de segmentos y cola de llegada. No se debe mantener otra copia manual independiente de la colisión.
- **Cámara:** área visible y margen que permita mostrar cabeza/hombros al acercarse a una salida; zoom entero. El recorte del cuerpo por el borde del PNG no es una solución de colisión.

Las 45 PNG conservan el tamaño exportado esperado; esta revisión no encontró otra reducción global errónea como las ya corregidas de Bridge/Dock/Hold/Face. El personaje de 44 px sigue siendo comparable a literas de 62 px. Cambiar su tamaño para esconder colisiones rompería esa escala. El informe paralelo de interfaz (`/tmp/habitat-observer-audit/body-outside.json`) cuantifica torso en vacío o fuera de imagen en 13 salas; se referencia para integrar cámara/oclusión sin duplicar esa auditoría.

## Evidencia y verificación pendiente para la implementación

Se inspeccionaron los cinco pares de láminas `art-1.png`…`art-5.png` y `mask-1.png`…`mask-5.png`: 45 imágenes nativas y las mismas 45 con overlay. Verde identifica componentes con entrada; magenta, islas; el cuadro blanco, la llegada. Estos overlays son instrumentos de auditoría y **no forman parte del arte del juego**.

Los datos por sala están en `rooms.json` (temporal), con fuentes, rectángulos, componentes, entradas y apariciones. `precision.py`/`precision.json` hacen el contraste a 1 px. `mobility.mjs`/`mobility.json` registran la prueba de 60 s. `reproduce.mjs`/`reproduction.json` documentan ocho muebles transitables, un caso de oclusión y una negativa de colisión. Todos usaron módulos/PNG actuales; no se creó ningún objeto de producción.

Para aprobar cada corrección en Villa-Treny:

1. Cada sólido debe tener una ROI vista en el PNG y una prueba que no dependa de volver a leer el mismo rectángulo manual. Las ocho coordenadas de NAV-01 son regresiones concretas.
2. Todo spawn debe poder llegar a un portal con la huella real; comprobar en particular I/Administration y K/Dispatch. Washroom admite sus dos componentes, cada uno por su entrada.
3. Toda zona de suelo libre conectada por un paso físicamente suficiente debe seguir siendo transitable. Mantener un inventario explícito de zonas sin entrada y medir los estrechamientos sobre el arte, no ocultarlos tras `#`.
4. Una reproducción de cuerpo completo debe verificar delante/detrás de muebles y paredes, incluida Cabin1 junto a la caja. Añadir control de bordes del lienzo junto a las salidas.
5. Verificar entrada y salida con la misma huella en ambas direcciones, reserva y cola. Una acción de cambio de sala no puede aprobarse únicamente porque el grafo narrativo la menciona.
6. Medir movimiento y espera, además de no solapamiento: una sala donde todos quedan quietos no queda aprobada por carecer de colisiones.

No se ejecutó `pnpm check` porque esta fase no cambia implementación. No se repitieron simulaciones económicas de 90 días: no prueban geometría, arte ni profundidad de dibujo.
