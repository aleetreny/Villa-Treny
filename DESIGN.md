---
name: Night Shift Habitat
description: Un refugio observado como un pequeño juego de habitaciones y vidas compartidas.
colors:
  ground: "#171c22"
  iron: "#293038"
  edge: "#495052"
  brass: "#b69b69"
  paper: "#ddd3b9"
  muted: "#a5aa9d"
  moss: "#a6b88a"
  clay: "#cf9477"
typography:
  display:
    fontFamily: "Pixelify Sans, monospace"
    fontSize: "31px"
    fontWeight: 600
    lineHeight: 0.95
  room-title:
    fontFamily: "Pixelify Sans, monospace"
    fontSize: "29px"
    fontWeight: 500
    lineHeight: 1.1
  body:
    fontFamily: "IBM Plex Sans Condensed, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.45
  clock:
    fontFamily: "IBM Plex Mono, monospace"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.4
rounded:
  square: "0px"
spacing:
  tight: "7px"
  control: "12px"
  section: "19px"
  scene: "26px"
components:
  observe-button:
    backgroundColor: "#66583c"
    textColor: "#f1dfb4"
    rounded: "{rounded.square}"
    height: "40px"
  field:
    backgroundColor: "#20272d"
    textColor: "{colors.paper}"
    rounded: "{rounded.square}"
    padding: "8px 10px"
    height: "40px"
---

# Design System: Night Shift Habitat

## Overview

**Creative North Star: "Observar una habitación viva"**

Este sistema pertenece al visor independiente Night Shift de Villa-Treny. El portfolio conserva su propia identidad y su Night Shift original. La autoridad visual son las salas pixel art ya aprobadas y los 25 personajes escritos; la interfaz se retira para dejar que se vean sus vidas.

El usuario pidió una sensación de juego de mazmorras, salas conectadas sin gastar la pantalla en pasillos y tipografía propia. El resultado usa un atlas compacto, una habitación visible y un cuaderno. No adopta el lenguaje de un panel de métricas.

**Key Characteristics:**

- Arte pixel art nítido y escala entera en habitaciones y cuerpos.
- Superficies planas de hierro, texto de hueso y selección en latón apagado.
- Títulos pixelados; lectura continua en una familia estrecha y legible.
- Observación libre, sin órdenes que cambien las decisiones del mundo.

## Colors

Los colores del marco salen de las superficies oscuras, madera, metal y vegetación presentes en las salas. Las imágenes conservan su paleta propia.

- **Obsidiana azul** (`ground`): fondo del visor y espacio alrededor de cada sala.
- **Hierro** (`iron`): controles y superficies secundarias.
- **Junta** (`edge`): bordes de campos y separación entre instrumentos.
- **Latón** (`brass`): selección, enlaces de navegación, seguimiento y foco.
- **Hueso** (`paper`): texto principal.
- **Pátina** (`muted`): lectura secundaria, sin convertirla en texto casi invisible.
- **Musgo** (`moss`): conexión viva.
- **Arcilla** (`clay`): señal de conexión no disponible.

## Typography

Pixelify Sans se sirve desde `public/fonts/PixelifySans.ttf` y se usa en el título, nombres de sala, pestañas y nombres de perfil. IBM Plex Sans Condensed se sirve en regular y semibold desde el mismo directorio; lleva narración y controles. IBM Plex Mono se reserva para horas del diario.

El título mide 31 px en escritorio y 25 px en móvil. Los nombres de sala pasan de 29 a 24 px. La lectura principal usa 15 px y 1.45–1.6 de interlínea; el texto de las salas no supera 72 caracteres de medida. Las etiquetas secundarias usan 11–13 px, sin espaciado artificial de mayúsculas.

## Layout

El visor ocupa la ventana. La cabecera mide al menos 70 px. En escritorio hay tres columnas: atlas de 202 px, escena flexible y cuaderno de 318 px. Por debajo de 1180 px, las laterales bajan a 174 y 284 px.

Por debajo de 960 px, el atlas permanece a la izquierda y el cuaderno pasa debajo de la escena. Por debajo de 600 px, el atlas mide 95 px, la cabecera 62 px y la escena conserva el mayor espacio posible. Cada panel desplaza su contenido; el documento completo no desborda horizontalmente.

El atlas es un índice espacial de familias de salas, no un plano a escala que afirme distancias físicas. No representa pasillos largos. El selector agrupado permite abrir todas las salas con teclado y con controles móviles amplios.

## Elevation & Depth

El marco usa variaciones de superficie y líneas de un píxel, sin sombras ni cristal. La profundidad pertenece al propio arte de las habitaciones. Los perfiles se leen en el cuaderno junto a la escena; no abren una segunda pantalla superpuesta.

## Shapes

Los controles tienen esquinas cuadradas. Los espacios del atlas son rectángulos de tamaños distintos agrupados en una masa irregular. La sala elegida tiene un contorno de latón; la Breach sellada tiene un borde discontinuo. Estos son signos de navegación y estado, no arte sustitutivo de las habitaciones.

## Components

- **RoomAtlas:** 45 interiores visitables y la Breach sellada; puntos de ocupación, título de selección, leyenda por entorno y selector de salas. Long Walk y Row siguen existiendo en el modelo y en RoomLab, pero no consumen una escena del visor principal.
- **RoomScene:** una sola imagen de habitación y sus habitantes. El movimiento visual usa la máscara transitable; la cámara permite desplazar una sala que no cabe manteniendo píxeles enteros. El relevo de escena usa un fundido breve.
- **Cuaderno:** Journal, The 25 y Weave. Todo el visor usa inglés. La tabulación activa tiene un subrayado de latón, no un contenedor redondeado.
- **Diario:** acontecimientos persistidos, el más reciente primero; día anterior/siguiente, toda la nave/esta sala, enlaces a personas y ubicaciones. Seguir a una persona filtra sus sucesos.
- **Shared stores & obligations:** registro económico plegado dentro de Journal. Existencias, tesorería, mantenimiento y préstamos proceden del mismo estado persistido. Las 25 cuentas y la conservación monetaria tienen sus propios desplegables. Su fecha actual permanece explícita al leer diarios antiguos. Sin datos disponibles, no muestra cifras de ejemplo.
- **Perfil:** retrato existente, historia, hogar compartido, tareas, miedos, deseos, diario, sucesos reales y vínculos. Means & needs añade saldo, créditos de trabajo pendientes de liquidar, préstamos y condiciones reales. El foco pasa al nombre al abrir. Follow sigue al residente; la navegación manual lo cancela.
- **Trama:** gráfico con retratos, matriz dirigida y comparación de vínculos. Las 600 relaciones actuales proceden del mundo; el estado al embarcar sigue siendo el escrito originalmente.
- **Campos y foco:** fondo oscuro sólido, borde visible, foco de 2 px en latón, selección de texto temática y barras de desplazamiento discretas. Movimiento reducido desactiva animaciones y deambulación.

## Do's and Don'ts

- **Do** conservar el arte y la historia aprobados.
- **Do** mostrar estado real, fallos de conexión y recuperación sin inventar acontecimientos.
- **Do** mantener el atlas a la izquierda y permitir elegir cualquier interior directamente.
- **Do** separar la representación del paseo de las decisiones y del reloj persistido.
- **Don't** trasladar estas reglas a otras superficies del portfolio.
- **Don't** sustituir habitaciones por primitivas, degradados o ilustraciones nuevas.
- **Don't** introducir un panel de estadísticas, neón, brillos o tarjetas repetidas como composición principal.
- **Don't** usar tipografía pixelada para párrafos largos ni tipografía monoespaciada como decoración técnica.

La revisión de septiembre calibra adultos de44px contra las literas de62px, con rostros reducidos exactamente2:1 y pies de12×8px. El visor ofrece zoom entero1×–5×; admite un pequeño desplazamiento vertical para evitar que un margen mínimo reduzca la sala a la mitad. La cola de acceso visual aparece sólo si no queda una huella libre, conservando los habitantes en el estado.
