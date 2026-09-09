# Presupuesto final: contexto de cierre y borrador de 504 caracteres

Esta medición corresponde a la **guía mínima de cierre** y a la gramática nueva de borradores marcada con `records.draftTextMaxLength:504`. Se compara con el checkpoint **7a original**, usando el mismo backup completo de revisión **199**. No se llamó a modelos, no se creó ningún trabajo persistente ni se avanzó una guardia. La medición de la [candidata más larga](p6-conversation-progress-instruction-review-2026-09-08.md) se conserva como evidencia histórica; no es el SYSTEM final.

## Resultado

**Los 25 contextos preparados caben individualmente bajo 8.000 tokens**, contando el SYSTEM, USER, esquema completo, margen provisional de formato de **128 tokens** y salida máxima de **1.024 tokens**. La reserva final va de **5.299 a 7.420**. El caso mayor es Bex (B), con **580 tokens de margen**. No hubo fallback ni truncamiento.

| Componente | Cambio frente a 7a |
|---|---:|
| SYSTEM mínimo | +133 bytes UTF-8; +27 tokens ordinarios |
| USER, marcador `draftTextMaxLength:504` | +25 bytes; +7 tokens |
| Esquema completo, límite y descripciones | +137 bytes, salvo B: +144; +62 tokens |
| Entrada completa | +295 bytes, salvo B: +302; **+96 tokens** |

El SYSTEM anterior ocupa **6.654 bytes / 1.259 tokens**; el final, **6.787 bytes / 1.286 tokens**. La entrada completa final ocupa **16.681–24.087 bytes**. La reserva anterior era de **5.203–7.324 tokens**. Los 96 tokens de diferencia incluyen el esquema nuevo; no se atribuyen sólo a las instrucciones.

## Procedencia y método

El backup 199 se exportó el **8 de septiembre de 2026 a las 20:21:56.648 UTC**. Su SHA256 es `82cdd88b6e4acfbb083289cfad6e732974049d2680a5977505b0b327bef138d7`. El lector estricto verificó el bundle completo antes de preparar los contextos.

Para cada residente se generó la preparación final. Como este corte tiene doce conversaciones abiertas y ninguna cerrada, `receivedClosure` no añade texto en ninguno de los 25 casos. Se reconstruyó la preparación anterior quitando únicamente el marcador nuevo y regenerando su esquema mediante la ruta sin marcador, con el SYSTEM `SOCIETY_RECORD_SYSTEM_BEFORE_PROGRESS`. Los **25 hashes de USER y los 25 hashes de esquema anterior coinciden exactamente** con la [medición previa](p6-conversation-progress-token-measurement-2026-09-08.json); también coinciden sus reservas. El SYSTEM anterior coincide byte por byte con el bundle del despliegue 7a. No se aplicó el límite nuevo a ese baseline histórico.

El conteo usa la implementación actual del tokenizador y estimador, ejecutada con el **WASM instalado de tiktoken 1.0.22**, rangos `o200k_base` y `encode_ordinary`. No hay especiales activados por escribir delimitadores en el texto. Los tres componentes completos pasan primero el guard de **32.000 bytes UTF-8 combinados / 24.000 por componente**. Si un caso rebasa un límite o falla el tokenizador, el código conserva la estimación íntegra por bytes; no cuenta sólo un prefijo.

Esta es una preparación de todos los residentes desde un estado común para medir tamaño. No son 25 trabajos históricos reales ni una afirmación de que todos fueran elegibles al mismo tiempo. Los USER finales ocupan **3.797–5.102 bytes**, sin `contextOverflow` en esta muestra.

## Los 25 casos

| Residente | USER final bytes | Esquema final bytes | Entrada final bytes | Reserva 7a | Reserva final | Margen hasta 8.000 |
|---|---:|---:|---:|---:|---:|---:|
| A | 4,742 | 11,237 | 22,766 | 6,947 | 7,043 | 957 |
| B | 5,055 | 12,245 | 24,087 | 7,324 | 7,420 | 580 |
| C | 4,720 | 5,633 | 17,140 | 5,270 | 5,366 | 2,634 |
| D | 4,802 | 11,124 | 22,713 | 6,808 | 6,904 | 1,096 |
| E | 4,686 | 11,188 | 22,661 | 6,847 | 6,943 | 1,057 |
| F | 4,795 | 11,271 | 22,853 | 6,953 | 7,049 | 951 |
| G | 4,422 | 11,135 | 22,344 | 6,733 | 6,829 | 1,171 |
| H | 5,074 | 6,639 | 18,500 | 5,584 | 5,680 | 2,320 |
| I | 4,665 | 11,217 | 22,669 | 6,930 | 7,026 | 974 |
| J | 4,736 | 5,764 | 17,287 | 5,415 | 5,511 | 2,489 |
| K | 4,800 | 5,699 | 17,286 | 5,374 | 5,470 | 2,530 |
| L | 4,734 | 5,664 | 17,185 | 5,329 | 5,425 | 2,575 |
| M | 4,800 | 5,694 | 17,281 | 5,413 | 5,509 | 2,491 |
| N | 4,789 | 11,136 | 22,712 | 6,853 | 6,949 | 1,051 |
| O | 4,660 | 5,756 | 17,203 | 5,451 | 5,547 | 2,453 |
| P | 4,691 | 5,669 | 17,147 | 5,418 | 5,514 | 2,486 |
| Q | 4,661 | 5,757 | 17,205 | 5,415 | 5,511 | 2,489 |
| R | 4,201 | 11,098 | 22,086 | 6,652 | 6,748 | 1,252 |
| S | 4,602 | 5,614 | 17,003 | 5,235 | 5,331 | 2,669 |
| T | 4,649 | 5,669 | 17,105 | 5,367 | 5,463 | 2,537 |
| U | 5,102 | 6,711 | 18,600 | 5,792 | 5,888 | 2,112 |
| V | 4,572 | 11,183 | 22,542 | 6,900 | 6,996 | 1,004 |
| W | 3,797 | 6,097 | 16,681 | 5,203 | 5,299 | 2,701 |
| X | 4,522 | 11,241 | 22,550 | 6,896 | 6,992 | 1,008 |
| Y | 4,740 | 11,178 | 22,705 | 6,862 | 6,958 | 1,042 |

## Unicode y límites del documento

El máximo nuevo del cuerpo es **504 caracteres** y el del título **96**. Con texto ASCII, usar ambos máximos suma exactamente **600 bytes**. Esa relación no garantiza que cualquier cadena Unicode de esas longitudes cumpla el límite de bytes. `maxLength` expresa longitud de texto; no es una comprobación de UTF-8.

La validación de dominio sigue imponiendo **96 bytes para el título**, **600 para el cuerpo** y **600 para título+cuerpo juntos**, sin recortar ni reparar el texto. Las pruebas existentes cubren, entre otros, estos casos:

| Texto sintético | Longitud UTF-8 | Resultado esperado y probado por la validación |
|---|---:|---|
| Título ASCII de 96 + cuerpo ASCII de 504 | 600 bytes juntos | Admitido, texto exacto conservado |
| Título de 49 `é` + cuerpo de un carácter ASCII | Título: 98 bytes | Rechazo `invalid_record_operation` |
| Título de un carácter ASCII + cuerpo de 301 `é` | Cuerpo: 602 bytes | Rechazo `invalid_record_operation` |
| Título ASCII de 96 + cuerpo de 253 `é` | 602 bytes juntos | Rechazo `record_content_too_large` |

Estos ejemplos se revisaron en las [pruebas del contrato](../../src/lib/habitat/society/record-choice.test.ts), ya ejecutadas por el autor del cambio; esta auditoría de presupuesto no repitió esa suite. No es válido prometer que la gramática garantizará por sí sola la aceptación de todo texto Unicode.

Las preparaciones P6 antiguas **sin marcador** mantienen su gramática anterior de cuerpo hasta 600 caracteres. Por ejemplo, un título ASCII de 25 y un cuerpo de 575 siguen siendo válidos con ese contrato guardado, mientras una nueva preparación aplica el máximo de 504. Un marcador desconocido no amplía silenciosamente el límite. Véanse [la emisión y decodificación](../../src/lib/habitat/society/record-choice.ts) y [las comprobaciones de bytes](../../src/lib/habitat/society/record-schema.ts).

## Qué no demuestra esta medición

- La capacidad por petición no equivale a cuota libre disponible. Ventanas TPM/RPM, límites diarios, reservas ambiguas, pacing y otros trabajos se comprueban aparte.
- El margen de 128 tokens de formato es **provisional**; aquí no se midió el prompt interno del servidor Groq. Son tokens ordinarios exactos más una provisión explícita, no un total remoto exacto.
- El resultado utiliza el corte 199: futuros documentos legibles, comisiones o mensajes de cierre pueden aumentar USER y esquema. El margen de 580 del caso mayor no es garantía para todos los estados posteriores.
- Los destinos GPT-OSS 20B y 120B usan el mismo conteo ordinario en el estimador actual. La medición no modifica cuotas ni demuestra capacidad diaria adicional de 120B.
- No se publica contenido privado de prompts, objetivos, recuerdos o borradores. El JSON adjunto contiene sólo IDs, hashes, tamaños, conteos y procedencia.

[JSON completo de medición](final-closure-budget-measurement-2026-09-08.json). El script temporal reproducible es `/tmp/villa-final-closure-budget-audit.mjs`, cuyo hash figura en el JSON. Las fuentes de runtime y harness se mantuvieron sin editar durante esta auditoría.
