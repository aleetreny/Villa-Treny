# Arte del visor de Night Shift

Estas 46 imágenes son exportaciones a resolución nativa de las salas aprobadas en RoomLab. El visor permite visitar 45; Breach conserva su referencia, pero permanece sellada. Long Walk y Row siguen siendo los RoomId de sus pasillos originales y no añaden interiores a este inventario.

La aplicación carga una sola imagen de sala y los habitantes presentes. `src/lib/habitat/generated/rooms.json` contiene la cuadrícula nativa de 1 píxel, las entradas, las dimensiones y las máscaras de profundidad de esa misma exportación. Sus filas están comprimidas sin pérdida y se decodifican al cargarlas. La huella de movimiento mide 12 × 8 píxeles. El encuadre amplía por un factor entero; si la pantalla es menor que la imagen nativa, permite desplazamiento en ambos ejes.

Procedencia y recortes exactos: `tools/roomlab/explorer-room-art-sources.md`, que enlaza cada composición, su archivo del ZIP y los manifiestos originales. Los once renderizadores históricos descritos allí conservan sus trazos anteriores; esta exportación no introduce objetos ni sustituye arte por formas.

Para regenerar:

1. Instalar las dependencias con `pnpm install --frozen-lockfile` y Chromium con `pnpm exec playwright install chromium`.
2. Ejecutar `pnpm rooms:export` desde la raíz. El comando inicia su propio servidor y navegador aislados.
3. Ejecutar `pnpm rooms:export --verify` para comparar los píxeles y los metadatos con sus fuentes y verificar cada máscara de profundidad contra el alfa del sprite original.
4. Ejecutar `pnpm check`, después `pnpm dev` y abrir la dirección que indique Vite. No hace falta iniciar Portfolio ni añadir un parámetro a la URL.

Los personajes son una capa distinta: sus rostros reutilizan las 25 fichas originales de `portraits.ts`; los cuerpos de 24 × 44 píxeles y sus prendas se encuentran en `ResidentSprite.tsx`. No se presentan como sprites extraídos del ZIP.
