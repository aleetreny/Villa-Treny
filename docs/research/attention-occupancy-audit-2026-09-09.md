# Atención social: reproducción de los cortes 247 y 317

El bloqueo de interlocutores sigue existiendo después de **11 horas y 3 minutos naturales**. No es únicamente una decisión repetitiva del modelo: el contrato ofrecido y el núcleo impiden hablar con una tercera persona mientras la pareja siga abierta. Wen no tiene ningún destinatario legal porque las otras 24 personas están ocupadas.

La [prueba reproducible v2](attention-occupancy-proof-v2-2026-09-09.json) verifica íntegramente las 26 tablas de ambos backups y ejecuta los **302 archivos del despliegue congelado** desde una copia privada aislada. No hace peticiones de red, inferencia, cambios de mundo ni guardias de prueba. El script íntegro y los contextos privados quedan fuera de Git, en `habitat-extraction-backups/attention-audit-20260909/`.

| Evidencia | 247: 8 septiembre, 23:22:59 UTC | 317: 9 septiembre, 10:25:54 UTC |
|---|---:|---:|
| Decisiones aplicadas | 102 | 134 |
| Mensajes públicos, cruzados exactamente con sus eventos | 90 | 112 |
| Parejas abiertas | 12 | Las mismas 12 |
| Cierres elegidos / conversaciones expiradas | 0 / 0 | 0 / 0 |
| Personas que pueden enviar un mensaje ahora | 12 | 12 |
| Destinatarios legales fuera de su pareja | 0 | 0 |
| Destinatarios legales de Wen | 0 | 0 |
| Guardias físicas observadas | 1 | 3 |
| Acciones físicas / exitosas | 25 / 25 | 75 / 75 |
| Pasos de planes realmente ejecutados | 18 | 29 |
| Borradores conservados | 7 | 13 |
| Documentos compartidos / publicados | 0 / 0 | 0 / 0 |
| Intenciones de publicación pendientes | 0 | 1 |
| Consultas privadas aplicadas | 0 | 0 |
| Acuerdos económicos | Un regalo de 2 células cumplido | El mismo regalo |

Las 32 decisiones adicionales usan P7. No hubo nuevas comisiones documentales ni contratos de trabajo pagado. El número de pasos `done` conservados es menor que el historial de ejecuciones porque un residente puede sustituir un proyecto; no debe utilizarse como recuento histórico de actividad. Tampoco terminar los pasos demuestra cumplir el propósito.

## Un avance real que aún necesita su guardia

Wen eligió en su trabajo **W132** crear un borrador con `publish:true`. La intención se corresponde exactamente con ese texto y ese trabajo aplicado a las **09:27:37.747 UTC**, después de la última guardia de las **07:08:04.142 UTC**. Por eso la ausencia de una publicación en el corte 317 **no es un fallo de ejecución**: todavía no había tenido una guardia posterior. No se ejecutó una guardia artificial para obtener el resultado.

La primera versión del diagnóstico buscaba una operación inexistente `kind:publish` y contó mal esa elección. La v2 usa el contrato real (`draft.publish:true` o `schedule`), comprueba su correspondencia exacta y declara la corrección. Se conservan el primer recibo y su script original, con su hash, como evidencia del error; la v2 es la referencia vigente.

## Qué impide el contacto

En los dos cortes se prepararon los 25 contratos P7 reales y se comprobaron los 25 destinatarios posibles, tanto para mensajes normales como para `close:true`. Sólo la persona que tiene el turno puede dirigirse a su compañero. Las otras doce personas emparejadas no pueden enviar un cierre: la gramática P7 lo rechaza y la aplicación canónica independiente devuelve `unavailable_dialogue_turn`, sin modificar nada. Una operación inventada de abandonar la conversación también es rechazada. Wen no puede iniciar un mensaje hacia ninguno de los 24 residentes ocupados.

No implica que un cierre sea imposible: quien tiene el turno sí puede elegirlo. Tampoco las parejas han alcanzado todavía el vencimiento de 24 horas o los 16 mensajes. La evidencia demuestra que, mientras no elijan cerrar, el sistema les impide consultar a terceros y obliga a Wen a esperar aunque tenga un propósito propio.

## Riesgos de cambiar a varias conversaciones

Estas son dependencias reales del código congelado; quitar sólo el filtro de destinatarios dejaría el sistema inconsistente:

- **Estado y recuperación.** `schema.ts` rechaza que una persona tenga dos conversaciones abiertas (`overlapping_conversation`). Un formato que lo permita necesita distinguir la versión anterior y migrar sin modificar mensajes, ofertas, saldos o relojes.
- **Selección y aplicación.** `turn.ts` y la proyección de `schema.ts` eligen la primera conversación propia con `find`. `PreparedTurn.conversation` sólo vincula un ID, revisión y longitud. Hace falta una selección explícita y verificable del intercambio al que corresponde cada respuesta; el orden del array no puede elegir por el residente.
- **Consentimiento y ofertas.** `choice.ts`, `turn.ts` y `economy.ts` ligan propuestas y aceptación al compañero y conversación concretos. Cerrar expira sus ofertas pendientes. Aparcar, cambiar de foco o cerrar no debe aceptar términos, duplicar un pago ni trasladar una oferta a otra persona. Los acuerdos aceptados deben conservar su cumplimiento independiente.
- **Atención y justicia.** El planificador recorre los siguientes hablantes de cada conversación y alterna esos turnos con revisiones individuales. Varias conversaciones pueden repetir a una persona en esa lista. Debe mantenerse la equidad por residente, el presupuesto y el tiempo de espera, sin regalar llamadas por cada conversación nueva ni quitar capacidad de decisión a quien espera.
- **Evidencia y privacidad.** La preparación sólo muestra un transcript y toma recuerdos de su última intervención. Una selección nueva debe mostrar íntegramente los mensajes relevantes sin mezclar el destinatario de una conversación con la evidencia de otra, y conservar el límite de contexto.
- **Relaciones.** Las valoraciones afectivas usan el mensaje entrante de la conversación vinculada, sus referencias y su marca de valoración. La selección no debe permitir puntuar dos veces el mismo mensaje ni cambiar sentimientos hacia un tercero que no lo dijo.
- **Trabajos guardados.** P1–P7 tienen despacho explícito y conservan su contrato, pero invocan funciones comunes. Cambiar la semántica de esas funciones puede reinterpretar trabajos anteriores aunque su número de protocolo permanezca igual. Deben conservarse su destinatario, vínculo, caducidad, generación, revisión mental e idempotencia. Los dos cortes auditados no tienen trabajos sociales pendientes, pero eso no garantiza que el siguiente despliegue tampoco los tenga.
- **Observador.** El estado público y el status emiten `waitingForReply` a partir de todas las conversaciones. Con varias conversaciones por residente no debe inflarse el número de personas esperando ni provocar renderizados o consultas de inteligencia adicionales.

La mejora adecuada debe abrir oportunidades reales de contacto y conservar elección individual. Aumentar el número de frases, obligar a cerrar, aceptar por silencio o fabricar resultados económicos no demuestra una sociedad más autónoma.

Referencias: [preparación y núcleo](../../src/lib/habitat/society/turn.ts), [contrato e invariantes](../../src/lib/habitat/society/schema.ts), [planificador](../../workers/habitat-runtime/src/society-scheduler.ts), [despacho versionado](../../workers/habitat-runtime/src/society-protocol.ts), [valoraciones](../../src/lib/habitat/society/appraisal.ts), [publicación física](../../src/lib/habitat/society/record-watch.ts).
