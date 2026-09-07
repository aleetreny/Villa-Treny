# Habitat corridors — exact ZIP sources

The Climb, Long Walk and Throat are assembled only from original 32×32 sprites
and tiles under `tools/roomlab/library/sheets/`. The renderer uses `drawImage`
copies and does not paint any visible colour, line, shape or replacement object.
The Climb remains unchanged. Following the user's request for entrances without
doors, Long Walk and Throat now use gaps in the wall at their usable exits.

## The Climb

- Grey ladder: `Shelter_Furniture_32x32.png`, tile `(4,12)`, size `1×2`.
- Shaft plate: `Shelter_Walls_32x32.png`, clean/rusted panels from rows `10–11`.
- Top and bottom landings: `PostApoc_Workshop_RoomTiles.png`, tile `(8,8)`.

Movement grid: `5×9`. The centre column is one uninterrupted chain from the
Bridge entrance to the Dock entrance.

## The Long Walk

- Deck and entrance thresholds: `PostApoc_Workshop_RoomTiles.png`, exact crop
  `(256,256,32,32)`. Each usable exit copies this floor at `(x×32,y×32)`,
  replacing the wall in exactly its movement-grid cell.
- Worn deck: the same file, crops `(224,224,32,32)` and `(224,256,32,32)`.
- Hull sides: `Shelter_Walls_32x32.png`, crops `(column×32,320,32,64)` for
  columns `1,2,3,4,5,6,8,10,11`. The last copy is cropped to 32 px in height
  at the bottom of the canvas.
- Top and bottom wall caps: the same file, crops `(32,320,32,32)` and
  `(96,320,32,32)`, copied at `(32,0)`, `(96,0)`, `(32,832)` and `(96,832)`.
  These close columns 1 and 3 at both ends, leaving only the central exit open.
- Lamps: `PostApoc_Workshop.png`, exact crop `(131,352,10,14)`.

Movement grid: the production `longwalk` grid, `5×27`, with 82 connected
walkable cells. All seven live exits connect. There are no door or hatch sprites,
including at Dock and Hold.
The Breach cell `(0,25)` remains logically sealed (`X`) and retains the original
hull wall. The former jammed hatch on the right at row 2 had no usable exit;
its cell `(4,2)` is corrected from `+` to `#` and retains the underlying original
wall. This correction is shared by the production room grid, RoomLab and the
generated habitat plan. The rest of the grid and connections are retained.

## The Throat

- Shared floor and both entrance thresholds: `PostApoc_Workshop_RoomTiles.png`,
  exact crop `(256,256,32,32)`.
- Infirmary half: `Shelter_Walls_32x32.png`, top corrugated panels
  `(256,320,32,64)`, `(320,320,32,64)` and `(352,320,32,64)`; bottom panels
  `(256,352,32,32)`, `(320,352,32,32)` and `(352,352,32,32)`.
- Workshop half: `PostApoc_Workshop_RoomTiles.png`, top block-wall pair
  `(128,224,32,64)` and bottom wall `(128,256,32,32)`.
- Side walls use the same original wall artwork: Shelter crops
  `(256,320,32,32)` and `(256,352,32,32)` at x=0; Workshop crops
  `(128,224,32,32)` and `(128,256,32,32)` at x=288. Rows 2–4 use the lower crop
  on odd grid rows and the upper crop on even rows, only for blocked lateral
  cells; the existing top and bottom walls stay in place. This leaves the 32 px
  opening at y=64…95 on both sides. The floor
  threshold is copied at `(0,64)` and `(288,64)`. No hatch or doorway sprite
  is drawn.
- Wayfinding objects: `Shelter_Furniture_32x32.png`, first-aid crop
  `(256,256,32,32)`, and `PostApoc_Workshop.png`, notice `(465,388,14,21)`.

Movement grid: `10×6`. A three-tile-wide central lane joins Infirmary and
Workshops without an obstacle.


## Segundo lote — Landing, Cut y Green Run

Rama de trabajo: `night-shift-habitat`, a partir de `ebbca44`.
The Climb se conserva sin cambios. Por petición posterior del usuario,
Long Walk y Throat muestran sus accesos mediante huecos, sin puertas ni marcos.
Throat conserva su cuadrícula. Long Walk cierra únicamente la celda espuria
`(4,2)`, que no correspondía a ningún camarote; conserva sus siete conexiones
utilizables y Breach sellado.
Los nuevos son pasos entre RoomId existentes, no salas nuevas.

### Archivos originales

Todos los archivos siguientes existen en `tools/roomlab/library/` y se
contrastaron byte a byte con `Archive_referencias_por_libreria.zip`:
los sheets corresponden a `Objetos/<ruta bajo sheets/>`, y las composiciones a
`Ejemplos de sala/<nombre del PNG>`.

- `shelterFurniture`: `tools/roomlab/library/sheets/Post Apoc Shelter - Asset Pack/Post Apoc - Shelter 32x32 Grid/Shelter_Furniture_32x32.png`
- `shelterWalls`: `tools/roomlab/library/sheets/Post Apoc Shelter - Asset Pack/Post Apoc - Shelter 32x32 Grid/Shelter_Walls_32x32.png`
- `workshop`: `tools/roomlab/library/sheets/PostApoc_Workshop/PostApoc_Workshop.png`
- `workshopRoom`: `tools/roomlab/library/sheets/PostApoc_Workshop/PostApoc_Workshop_RoomTiles.png`
- `common`: `tools/roomlab/library/rooms/Xmas_3.png`
- `officeWalls`: `tools/roomlab/library/sheets/Post Apoc Office - Asset Pack/Post Apoc - Office 32x32 Grid/Office_Walls_32x32.png`
- `garden`: `tools/roomlab/library/rooms/Garden_Planters_1.png`
- `gardenBarrels`: `tools/roomlab/library/sheets/Garden_Planters/Garden_Planters_OilBarrel.png`
- `gardenTires`: `tools/roomlab/library/sheets/Garden_Planters/Garden_Planters_RubberTire.png`
- `shelterTerrain`: `tools/roomlab/library/sheets/Post Apoc Shelter - Asset Pack/Post Apoc - Shelter 32x32 Grid/Shelter_Terrain_Tiles_32x32.png`

### Coordenadas exactas de los recortes

Origen superior izquierdo, coordenadas desde cero; formato `(sx, sy, ancho, alto)`
en píxeles del archivo original. Son las mismas entradas de `CORRIDOR_CROPS`.
Los sheets se copian 1:1. `Xmas_3.png` y `Garden_Planters_1.png` contienen arte
exportado a 4×: se recupera su tamaño nativo dividiendo por cuatro con
`imageSmoothingEnabled = false`. La presentación de los nuevos pasillos es 2×
entera, también en móvil (con desplazamiento, sin encogerlos a escala fraccionaria).
No se recolorea, pinta, deforma ni inventa ningún objeto.

| Recorte | Archivo (clave anterior) | Rectángulo original | Tamaño nativo |
| --- | --- | --- | --- |
| `workshopFloor` | `workshopRoom` | `(256, 256, 32, 32)` | 32×32 |
| `workshopWornA` | `workshopRoom` | `(224, 224, 32, 32)` | 32×32 |
| `workshopWornB` | `workshopRoom` | `(224, 256, 32, 32)` | 32×32 |
| `workshopWall` | `workshopRoom` | `(128, 224, 32, 64)` | 32×64 |
| `workshopLowWall` | `workshopRoom` | `(128, 256, 32, 32)` | 32×32 |
| `workshopEdge` | `workshopRoom` | `(26, 64, 6, 32)` | 6×32 |
| `workshopCap` | `workshopRoom` | `(32, 58, 32, 6)` | 32×6 |
| `workshopGrate` | `workshop` | `(227, 417, 59, 31)` | 59×31 |
| `workshopLamp` | `workshop` | `(131, 352, 10, 14)` | 10×14 |
| `workshopNotice` | `workshop` | `(465, 388, 14, 21)` | 14×21 |
| `workshopPipe` | `workshop` | `(140, 422, 16, 5)` | 16×5 |
| `workshopValve` | `workshop` | `(0, 436, 16, 8)` | 16×8 |
| `commonFloor` | `common` | `(232, 510, 128, 32)` | 32×8 |
| `crateClosed` | `shelterFurniture` | `(327, 391, 18, 24)` | 18×24 |
| `crateOpen` | `shelterFurniture` | `(356, 387, 26, 28)` | 26×28 |
| `crateWide` | `shelterFurniture` | `(483, 385, 24, 30)` | 24×30 |
| `officeWall` | `officeWalls` | `(192, 224, 32, 64)` | 32×64 |
| `officeTornTop` | `officeWalls` | `(224, 224, 32, 64)` | 32×64 |
| `officeTornBase` | `officeWalls` | `(256, 224, 32, 64)` | 32×64 |
| `officeMasonry` | `officeWalls` | `(288, 224, 64, 64)` | 64×64 |
| `officeLowWall` | `officeWalls` | `(192, 256, 32, 32)` | 32×32 |
| `officeEdge` | `officeWalls` | `(26, 130, 6, 32)` | 6×32 |
| `officeCap` | `officeWalls` | `(32, 122, 32, 6)` | 32×6 |
| `officeSkirting` | `officeWalls` | `(192, 280, 32, 8)` | 32×8 |
| `gardenSoil` | `garden` | `(331, 379, 128, 96)` | 32×24 |
| `barrelSeedling` | `gardenBarrels` | `(70, 113, 20, 46)` | 20×46 |
| `barrelLeaves` | `gardenBarrels` | `(102, 112, 20, 47)` | 20×47 |
| `tireFlowers` | `gardenTires` | `(100, 183, 24, 40)` | 24×40 |
| `tireFruit` | `gardenTires` | `(132, 183, 24, 40)` | 24×40 |

El suelo de Common es el de la sala aprobada, no una tabla dibujada ni un suelo
parecido de otro pack. Se eligió una zona libre de muebles de `Xmas_3.png`.
La tierra de Garden también procede de una zona libre de objetos de su composición.
Los cuatro recortes de plantas incluyen exactamente su rectángulo de tinta y
excluyen solo el margen transparente; no se corta ninguna hoja ni jardinera.

### The Landing — Workshops ↔ Common

Lienzo 384×224, cuadrícula 12×7. Todas las paredes, bandas y bordes utilizan
piezas de Workshop para mantener la misma arquitectura de extremo a extremo.
El suelo de Workshop ocupa x=0…319; el suelo de Common aparece solo en el tramo
final x=320…383, como llegada a la sala compartida. La rejilla metálica del
Workshop está en (292,104), atravesable y cruzando la unión entre ambos suelos.
Las dos variantes originales de suelo gastado están en (64,96) y (128,128).
El muro norte tiene 64 px de alto; la banda inferior empieza en y=192.

Las entradas son huecos en los bordes laterales de 6 px, sin puertas ni marcos
añadidos. Los bordes se interrumpen exactamente en y=96…127: una celda de 32 px
alineada con las salidas de la cuadrícula. El suelo llega a ambos extremos.
La tubería repite su recorte de 16×5 entre x=64 y x=144, en y=24; la válvula está
en (94,22), la lámpara en (36,12) y el aviso en (156,18). Las cajas quedan en los
márgenes reservados, siempre fuera de las celdas transitables.

### The Cut — Common ↔ Administration

Lienzo 320×192, cuadrícula 10×6. Usa el mismo suelo de Common de extremo a extremo.
La pared Office ocupa y=0…63: daño superior en (64,0), daño inferior en (128,0)
y mampostería expuesta en (192,0). La banda inferior usa `officeLowWall` desde
y=160, con zócalo junto al suelo. Bordes de 6 px copiados de Office cierran el
contorno y se interrumpen exactamente en y=96…127, a ambos lados. Estos huecos
de una celda dejan el suelo continuo hasta los extremos y muestran los accesos
sin añadir puertas ni marcos.

### The Green Run — Hydroponics Yard ↔ Shelter Entrance

Lienzo 384×192, cuadrícula 12×6. Se conservan los barriles, los neumáticos con
flores amarillas y fruto rojo y el suelo de Garden Planters. La familia marrón
original de Shelter tiene el mismo color base que Garden: RGB (168,131,75).
Así se consigue continuidad con el exterior aprobado sin copiar su operación
de recoloreado ni introducir un píxel de otro color.

El borde exterior se monta exclusivamente con los nueve recortes de
`shelterTerrain` indicados aquí. Los tiles tienen 32×32; sus siluetas irregulares
se sitúan 16 px dentro de los tiles periféricos, como en el atlas original.

| Pieza de terreno Shelter | Recorte exacto |
| --- | --- |
| Esquina superior izquierda | (0,384,32,32) |
| Borde superior, repetido | (32,384,32,32) |
| Esquina superior derecha | (64,384,32,32) |
| Borde izquierdo, repetido | (0,416,32,32) |
| Centro opaco, repetido | (32,416,32,32) |
| Borde derecho, repetido | (64,416,32,32) |
| Esquina inferior izquierda | (0,448,32,32) |
| Borde inferior, repetido | (32,448,32,32) |
| Esquina inferior derecha | (64,448,32,32) |

La tierra Garden se repite en la zona (32,32)…(352,160); el último fragmento de
cada repetición se recorta al límite, sin estirarlo. El centro opaco Shelter
se copia además en (0,96) y (352,96), para que ambas salidas tengan tierra hasta
el borde del lienzo. Las jardineras inferiores terminan en y=175, sobre terreno.

### Colocación de todos los objetos sólidos nuevos

Las coordenadas de destino se refieren al rectángulo completo del recorte.
`CORRIDOR_OBSTACLES` alimenta la prueba que cruza estos rectángulos con las
cuadrículas: ningún objeto sólido toca una celda transitable.

| Pasillo | Recorte | Destino x,y |
| --- | --- | --- |
| landing | `crateWide` | (88, 62) |
| landing | `crateOpen` | (274, 66) |
| landing | `crateClosed` | (308, 70) |
| landing | `crateOpen` | (104, 163) |
| landing | `crateClosed` | (142, 168) |
| greenrun | `barrelLeaves` | (38, 16) |
| greenrun | `tireFruit` | (84, 23) |
| greenrun | `tireFlowers` | (244, 23) |
| greenrun | `barrelSeedling` | (310, 17) |
| greenrun | `barrelSeedling` | (110, 129) |
| greenrun | `tireFlowers` | (268, 135) |

### Entradas, salidas y movimiento del motor

Coordenadas locales (columna,fila), desde cero. `roomAt` es un acceso lógico `+`
ya existente en la cuadrícula de la sala; se distingue de la salida del pasillo
y no obliga a dibujar una puerta en este.

| Paso | Entrada local ↔ salida local | Accesos existentes de las salas | Celdas libres conectadas |
| --- | --- | --- | --- |
| Landing | Workshops (0,3) ↔ Common (11,3) | workshops (0,5) ↔ common (0,7) | 29 |
| Cut | Common (0,3) ↔ Administration (9,3) | common (11,1) ↔ administration (3,8) | 26 |
| Green Run | Garden (0,3) ↔ Shelter Entrance (11,3) | garden (2,0) ↔ sheltergate (3,0) | 28 |

`planPassageMovement` busca una ruta ortogonal desde la posición interior del
agente hasta el acceso de salida y otra a través del pasillo. `go` y
`seek out` rechazan cruces sin ruta, llegan al acceso existente del destino y
exponen los pasos en `Outcome.movement` (`approach`, `cells`, `arrival`).
El cruce completo se resuelve dentro de la acción del motor, cuyos turnos son
de seis horas. La página RoomLab reproduce las celdas del pasillo en ambos
sentidos mediante un marcador CSS opcional; no es un sprite ni altera el canvas.
No se ha añadido una animación por fotogramas al mapa global del portfolio.

### Problemas encontrados y comprobación

- Los datos previos de pasillos no eran consumidos por el movimiento del motor.
  Los tres nuevos ahora validan su recorrido físico antes de mover al agente.
- Dos puertas derechas de Workshops estaban aisladas. Se usa su puerta accesible
  (0,5), sin modificar el grid ni el arte de la sala.
- La posición inicial (2,2) podía caer sobre una jardinera de Garden. El inicio
  valida la celda y usa una puerta existente cuando está ocupada. Los enlaces
  ordinarios también llegan a una puerta válida, evitando arrastrar coordenadas
  de otra sala antes de intentar un pasillo nuevo.
- Common no tiene sheet de suelo independiente en la biblioteca: el recorte
  directo del PNG aprobado mantiene su material y color exactos.
- La revisión mostró puertas y marcos que parecían sueltos o solapados. Landing
  y Cut ahora marcan sus accesos con huecos de una celda en la pared lateral,
  alineados con la cuadrícula y con suelo continuo. Se conservan sus rutas.
- Una revisión posterior detectó las puertas restantes en Long Walk. Se retiraron
  también las de Throat para aplicar el mismo criterio a los seis pasillos:
  los accesos utilizables son huecos con suelo, sin sprites de puertas o marcos.
  Breach sigue cerrado mediante pared y conserva su celda `X`.
- Long Walk tenía una celda `+` adicional en `(4,2)` sin salida declarada.
  Se cierra con pared y se marca `#` en RoomLab y en los datos del motor;
  el plano generado recoge la misma corrección. Sus 82 celdas transitables
  quedan conectadas. Los extremos norte y sur se rematan con paneles Shelter
  originales para dejar solo el hueco central de Dock y Hold.
- El cambio de paredes a mitad de Landing dividía visualmente el pasillo en dos.
  Ahora mantiene paredes y bordes de Workshop en toda su longitud; el suelo de
  Common queda en el último tramo y la rejilla cruza la unión de materiales.
- Se ajustó el apoyo de las jardineras inferiores de Green Run. La tierra llega
  a ambas salidas sin transparencia.
- En la primera revisión los tres canvas aprobados eran idénticos a los del
  inicio. Tras la petición de retirar las puertas, Long Walk y Throat cambian
  solo en sus accesos y paredes laterales; The Climb permanece intacto.
  Los tests comprueban además conectividad de los seis, rutas de ida
  y vuelta, puertas accesibles desde el interior, rechazo de bloqueos, datos
  RoomLab/motor sincronizados, decoraciones fuera del recorrido, límites de
  recortes PNG, coordenadas enteras y dibujo sin primitivas de Canvas.

Validación completa después de retirar las puertas de todos los pasillos
(7 septiembre 2026):
`pnpm check` completo pasa — validación del
repositorio, ESLint, TypeScript y **809 tests en 34 archivos**. Navegador sin
errores, seis canvas conectados, capas opcionales sin modificar el arte, y
recorridos de los tres nuevos comprobados en ambos sentidos.


## Red completa y exploración por escenas — 7 septiembre 2026

La nueva propuesta se revisa en `explore.html` y en la primera sección de
`corridors.html`. Los seis estudios iniciales se conservan debajo; no son el
plano de navegación completo. No se han añadido RoomIds ni habitaciones.

### Estructura

Una espina une nueve alas. Cada sala se abre a su hall, de modo que una
habitación privada no sea el camino obligado a otra. Long Walk y Row conservan
sus RoomIds existentes y se representan como pasillos, sin duplicarlos como
salas. Breach conserva su cierre y no participa en el recorrido.

| Tramo | Espacios a los que da acceso |
| --- | --- |
| The Spine | Las nueve alas; The Climb y The Throat nombran sus tramos entre cubierta, casco y talleres |
| The Green Run | Camp, Garden, Shelter Entrance, Inner Yard, Graveyard |
| The Long Walk | Bridge, Dock, cinco camarotes, Hold, Infirmary; Breach sellado |
| The Landing | Workshops, Common, Games, Maintenance |
| The Cut | Administration, Duty Office, Archive, Records |
| The Quiet Walk | Study, Spare Bedroom, Parlour, Projection, Winter Parlour |
| The Gallery | Old Library, Grand Bedroom, Formal Salon, Hearth |
| The Service Walk | Kitchen, Service Counter, Main Diner, Soda Bar |
| The Utility Run | Well, Stalls, dos accesos independientes a Washroom |
| The Row | Las seis Diggings y The Face |

`src/lib/habitat/navigation.ts` define las dimensiones, límites compartidos,
entradas y llegadas recíprocas. El exportador `measure/explorer-data.mjs` consume
las máscaras de las imágenes reales. El plano es independiente de los enlaces
narrativos de la simulación; no modifica su cronología ni fuerza el paso de los
residentes por habitaciones privadas.

### Recortes exactos del vocabulario común

Coordenadas `(x,y,ancho,alto)` desde la esquina superior izquierda del archivo.
Los archivos se encuentran en `tools/roomlab/library/`. No hay recoloreado,
filtros, gradientes, puertas dibujadas ni sprites generados.

| Archivo relativo a library/ | Recorte | Uso |
| --- | --- | --- |
| `sheets/PostApoc_Workshop/PostApoc_Workshop_RoomTiles.png` | `(256,256,32,32)` | Suelo gris continuo |
| mismo archivo | `(224,224,32,32)` y `(224,256,32,32)` | Desgaste esporádico del mismo suelo |
| mismo archivo | `(128,224,32,64)` | Pared común; fila superior `(128,224,32,32)` |
| mismo archivo | `(128,256,32,32)` | Segunda fila de pared y pared baja |
| `sheets/PostApoc_Workshop/PostApoc_Workshop.png` | `(131,352,10,14)` | Lámpara pequeña, sobre pared sólida |
| mismo archivo | `(465,388,14,21)` | Aviso de pared |
| `rooms/Xmas_3.png` | `(232,510,128,32)` → `32×8` | Solo los últimos 8px del acceso al material de Common y salas amuebladas |
| `sheets/Post Apoc Office - Asset Pack/Post Apoc - Office 32x32 Grid/Office_Walls_32x32.png` | `(224,224,32,64)` | Un panel deteriorado junto a los huecos administrativos, copiado en sus dos mitades originales |
| `sheets/Post Apoc Shelter - Asset Pack/Post Apoc - Shelter 32x32 Grid/Shelter_Furniture_32x32.png` | `(327,391,18,24)` | Caja; posición exacta derivada de `scene.props`: `(columna×32+7,fila×32+4)` |
| `rooms/Garden_Planters_1.png` | `(331,379,128,96)` → `32×24` | Tierra del paso exterior |
| `sheets/Post Apoc Shelter - Asset Pack/Post Apoc - Shelter 32x32 Grid/Shelter_Terrain_Tiles_32x32.png` | Nueve tiles `(columna×32,fila×32,32,32)`, columnas `0,1,2`, filas `12,13,14` | Borde original del terreno exterior |
| mismo archivo | `(32,416,32,32)` | Tierra que continúa por los accesos exteriores |
| `sheets/Garden_Planters/Garden_Planters_OilBarrel.png` | `(102,112,20,47)` | Jardinera con hojas |
| `sheets/Garden_Planters/Garden_Planters_RubberTire.png` | `(100,183,24,40)` | Neumático con flores |
| `sheets/Post Apoc Shelter - Asset Pack/Post Apoc - Shelter 32x32 Grid/Shelter_Icons_32x32.png` | `(8,168,16,16)` | Llave original como ficha provisional de exploración, con etiqueta DOM «Tú» |

Las imágenes de habitaciones exportadas a 4× se reducen exactamente a sus
píxeles originales. Todas las copias mantienen coordenadas enteras y
`imageSmoothingEnabled = false`. El escalado en pantalla es 1×, 2× o 3×, con
cámara cuando la escena es mayor que la ventana.

### Movimiento y carga

- Las paredes reservan celdas estructurales de 32px; la exploración utiliza
  subceldas de 4px. Las cajas bloquean su rectángulo real, dejando libre el
  espacio que queda junto a ellas. Las lámparas y avisos están sobre la pared.
- Un hueco de pasillo tiene 32px de ancho: se puede cruzar por todo su ancho,
  no únicamente por su centro. Los huecos de las salas conservan su anchura
  real (16–64px), incluyendo los pozos de escalera de los camarotes. Se accede
  de nuevo por el mismo lugar al volver.
- Las flechas, WASD, clic en suelo y controles táctiles recorren celdas
  ortogonales libres. Elegir un destino en el mapa calcula y camina la ruta.
- El fundido cubre el cambio de escena; se elimina el canvas anterior antes
  de crear el siguiente. El mapa permanece a la izquierda. Las hojas de
  sprites pueden compartirse, pero no se guardan todas las salas renderizadas.
- El suelo transitable es una capa DOM opcional, separada del arte.
- Las salas aprobadas se reutilizan mediante sus renderers. Sus huellas,
  fuentes, umbrales y limitaciones se detallan en `explorer-room-art-sources.md`.
- El ZIP disponible no incluye un humanoide. La ficha es una llave del propio
  pack; no se ha inventado un muñeco ni se ha presentado la llave como tal.

La revisión visual detectó que un parche alto de madera dentro de una abertura
parecía una puerta cerrada. Por eso todo el hueco conserva el suelo gris, y la
madera se limita a una franja final de 8px.


### Ajustes finales de geometría y acceso

Las dimensiones del minimapa siguen el ancho y alto nativos de cada imagen,
con márgenes entre alas; no son iconos de tamaño arbitrario. Los camarotes se
sitúan debajo de Long Walk porque su hueco está arriba. Las líneas del mapa
pasan por el punto compartido de cada abertura.

Washroom tiene dos huecos originales separados 40px. En su hall se separan
64px para conservar una pieza de pared entre ambos; el segundo cruce registra
un desplazamiento local de perspectiva de **24px** (`mapAdjustmentPx`). El
fundido lleva al lado correcto, nunca a través de la división interior.

Bridge utiliza en el explorador el recorte de su zona superior: el dibujo
completo incluía la fachada y no permitía llegar a esa zona por suelo. Hold
conserva la composición y abre únicamente 16px de su verja con suelo original.
Las páginas de comparación aprobadas no cambian. Los recortes exactos y los
pequeños huecos de suelo encerrados que no tienen acceso físico se enumeran
en `explorer-room-art-sources.md`.


### Comprobación final

`pnpm check` pasa completo: validación del repositorio, ESLint, TypeScript y
**827 tests en 36 archivos**. `pnpm build` también pasa (con el aviso de tamaño
de algunos bundles del portfolio). Se comprobaron 110 cruces dirigidos con
llegadas, retornos y anchura completa del hueco; todas las salas utilizables
son alcanzables y los volúmenes del plano no se solapan.

En Chromium se cargaron los 46 adaptadores de salas sin errores. Se revisaron
los diez pasillos nuevos y los seis estudios iniciales, recorrido completo
Common → Landing → Spine → Cut → Administration, ida y vuelta de Workshops,
ambos accesos de Washroom, y controles táctiles a 390×844. El explorador retiene
un único canvas de escena y ningún iframe tras cargar una sala.

Entrega local de revisión en RoomLab. No se ha publicado, mezclado ramas ni
creado un commit; el explorador no sustituye aún la vista del portfolio de
producción.
