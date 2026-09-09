# Revisión de instrucciones P6 y coste del contexto — 8 de septiembre de 2026

La versión propuesta conserva el contrato de operaciones y reduce la presión por terminar cada intervención con otra pregunta. Esta revisión es offline: no envió peticiones a modelos, no creó trabajos persistentes y no cambió el estado del mundo. El objeto de la comparación es el SYSTEM posterior a la precisión sobre el cierre de ofertas.

## Resultado de la revisión

Se detectó y corrigió una ambigüedad: «Closing expires unaccepted offers» incluía aparentemente las comisiones de documentos. El cierre del motor sólo caduca las ofertas de conversación; las comisiones tienen su propio vencimiento. La versión medida ya dice «Closing expires unaccepted conversation deals; record commissions keep their own expiry». Véanse [el cierre real](../../src/lib/habitat/society/turn.ts) y [el vencimiento editorial](../../src/lib/habitat/society/records.ts).

No se encontró otra contradicción material nueva en los puntos examinados:

- El cierre sigue siendo voluntario y no acepta términos, no finaliza propósitos ni cancela trabajo aceptado. El contrato de `deal` conserva la incompatibilidad con `close:true` y exige el `offerId` real para aceptar.
- El texto permite trabajo privado «within the required schema». Esa salvedad importa: el esquema todavía exige un mensaje en una primera oportunidad con destinatario y cuando corresponde responder en una conversación activa. Quitar la pregunta obligatoria no quita esas obligaciones del esquema.
- La audiencia de una publicación y la visibilidad de una comisión siguen separadas. Un borrador privado no concede acceso a otra persona; citar o anunciar un adjunto tampoco lo concede.
- La guía de conservar un paso útil pendiente no afirma que ya se ejecutó ni impide los rechazos reales del motor. Una guardia futura sigue siendo necesaria para ejecutarlo, y la urgencia puede interrumpirlo.

Fuentes revisadas: [SYSTEM](../../src/lib/habitat/society/record-instructions.ts), [gramática y consentimiento](../../src/lib/habitat/society/choice.ts), [extensión editorial](../../src/lib/habitat/society/record-choice.ts), [último mensaje recibido al cerrar](../../src/lib/habitat/society/closing-turn.ts). La revisión no demuestra que un modelo obedecerá mejor: eso requeriría observación de respuestas, que no se realizó aquí.

## Medición de los 25 residentes

Se verificó el backup completo de la revisión **199**, exportado a las **20:21:56.648 UTC**. Para cada uno de los 25 residentes se preparó un contexto P6 desde ese mismo estado, con las fuentes actuales. Es una comparación de tamaños, no una reconstrucción de 25 trabajos históricos ni una afirmación de que todos fueran elegibles simultáneamente. El SYSTEM anterior coincide byte por byte con el del bundle del despliegue **7a103b97**.

En cada par, USER y esquema son idénticos: cambia únicamente SYSTEM. El código real de tokenización usa `tiktoken 1.0.22`, `o200k_base` y `encode_ordinary`, sin tratar los delimitadores escritos como tokens privilegiados. Se ejecutaron las implementaciones actuales del guard y del estimador, con el WASM instalado en Node. La reserva mostrada suma los tokens ordinarios de los tres componentes, **128** de margen de formato y **1.024** de salida máxima. Ese margen sigue siendo una provisión; no se ha medido aquí el formato interno de Groq.

| SYSTEM | Bytes UTF-8 | Tokens ordinarios |
|---|---:|---:|
| Anterior 7a | 6,654 | 1,259 |
| Propuesto, cierre precisado | 7,589 | 1,435 |
| Diferencia | +935 | +176 |

**Los 25 casos caben individualmente bajo 8.000 tokens con ambos textos.** La reserva aumenta de **5.203–7.324** a **5.379–7.500**. B es el caso mayor, con **500 tokens de margen**. Es un resultado sobre este corte, no una garantía para documentos o conversaciones más largos. El incremento por turno es de 176 tokens de entrada; no hay consumo de proveedor en esta medición.

| Residente | USER bytes | Esquema bytes | Total bytes propuesto | Reserva anterior | Reserva propuesta | Margen hasta 8.000 |
|---|---:|---:|---:|---:|---:|---:|
| A | 4,717 | 11,100 | 23,406 | 6,947 | 7,123 | 877 |
| B | 5,030 | 12,101 | 24,720 | 7,324 | 7,500 | 500 |
| C | 4,695 | 5,496 | 17,780 | 5,270 | 5,446 | 2,554 |
| D | 4,777 | 10,987 | 23,353 | 6,808 | 6,984 | 1,016 |
| E | 4,661 | 11,051 | 23,301 | 6,847 | 7,023 | 977 |
| F | 4,770 | 11,134 | 23,493 | 6,953 | 7,129 | 871 |
| G | 4,397 | 10,998 | 22,984 | 6,733 | 6,909 | 1,091 |
| H | 5,049 | 6,502 | 19,140 | 5,584 | 5,760 | 2,240 |
| I | 4,640 | 11,080 | 23,309 | 6,930 | 7,106 | 894 |
| J | 4,711 | 5,627 | 17,927 | 5,415 | 5,591 | 2,409 |
| K | 4,775 | 5,562 | 17,926 | 5,374 | 5,550 | 2,450 |
| L | 4,709 | 5,527 | 17,825 | 5,329 | 5,505 | 2,495 |
| M | 4,775 | 5,557 | 17,921 | 5,413 | 5,589 | 2,411 |
| N | 4,764 | 10,999 | 23,352 | 6,853 | 7,029 | 971 |
| O | 4,635 | 5,619 | 17,843 | 5,451 | 5,627 | 2,373 |
| P | 4,666 | 5,532 | 17,787 | 5,418 | 5,594 | 2,406 |
| Q | 4,636 | 5,620 | 17,845 | 5,415 | 5,591 | 2,409 |
| R | 4,176 | 10,961 | 22,726 | 6,652 | 6,828 | 1,172 |
| S | 4,577 | 5,477 | 17,643 | 5,235 | 5,411 | 2,589 |
| T | 4,624 | 5,532 | 17,745 | 5,367 | 5,543 | 2,457 |
| U | 5,077 | 6,574 | 19,240 | 5,792 | 5,968 | 2,032 |
| V | 4,547 | 11,046 | 23,182 | 6,900 | 7,076 | 924 |
| W | 3,772 | 5,960 | 17,321 | 5,203 | 5,379 | 2,621 |
| X | 4,497 | 11,104 | 23,190 | 6,896 | 7,072 | 928 |
| Y | 4,715 | 11,041 | 23,345 | 6,862 | 7,038 | 962 |

Los bytes completos propuestos van de **17.321 a 24.720**. Hay un caso real que supera el antiguo límite de ensayo de **24.576 bytes**; ese valor no es el límite actual de tokenización de producción. Los 25 casos cumplen **32.000 bytes totales y 24.000 por componente**, y todos usan el conteo ordinario: **cero fallbacks y cero truncamientos**. El guard conserva el cálculo íntegro por bytes cuando se rebasa alguno de sus límites.

El corte tiene 12 conversaciones abiertas y ninguna cerrada; `receivedClosure` no añade bytes en estos 25 casos. Por tanto, la tabla no mide el coste de un mensaje final adicional en estados futuros. Los USER preparados quedan entre 3.772 y 5.077 bytes, sin `contextOverflow` en esta muestra.

La codificación ordinaria de la variante propuesta, con el encoder ya inicializado, tardó aproximadamente **1,68–2,56 ms** por contexto en este proceso Node local. Son mediciones de una pasada, sin afirmar significancia comparativa ni un presupuesto de CPU garantizado en Cloudflare.

## Límites de interpretación

- Caber individualmente en 8.000 tokens no acredita saldo disponible en la ventana. TPM/RPM, límites diarios, reservas ambiguas, pacing y elegibilidad se calculan aparte.
- El mismo conteo ordinario se aplica a los destinos GPT-OSS 20B y 120B; esto no demuestra nueva capacidad diaria de 120B ni cambia sus cuotas.
- Los esquemas futuros y documentos accesibles pueden crecer; deben volver a pasar el guard y la admisión. No se usa una media para autorizar un caso grande.
- No se publican prompts privados, borradores, objetivos o memorias. La evidencia adjunta contiene únicamente IDs, hashes, tamaños, conteos y fuentes de la medición.

[JSON de medición y procedencia](p6-conversation-progress-token-measurement-2026-09-08.json). El script reproducible se conserva en `/tmp/villa-progress-prompt-audit.mjs`; su hash figura en el JSON. La evidencia de conversaciones previa está en [la auditoría del corte 199](conversation-progress-audit-2026-09-08.md).
