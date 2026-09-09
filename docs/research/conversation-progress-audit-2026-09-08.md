# Progreso de las conversaciones: auditoría del corte 199

Esta revisión encuentra conversación relacionada con los intereses de los residentes, pero también entregas afirmadas sin operación real, aclaraciones que se encadenan y planes cuyos pasos no cumplen el propósito anunciado. No todo está detenido: existen acciones físicas, cuatro borradores privados y un regalo aceptado y transferido. La siguiente corrección debería ayudar a distinguir esos resultados al decidir cómo continuar, no obligar a contratar, pagar o cerrar una conversación.

## Evidencia y límites

Se verificó offline el backup completo de revisión **199**, SQL10, capturado el **8 de septiembre de 2026 a las 20:21:56.648 UTC**. SHA256 del bundle: `82cdd88b6e4acfbb083289cfad6e732974049d2680a5977505b0b327bef138d7`. Los 74 mensajes examinados coinciden exactamente, por ID, autor, fecha y texto, con sus eventos públicos guardados. No se ejecutó inferencia, red, una nueva guardia ni cambios en la simulación.

El [status posterior de revisión 201](release-2026-09-08/p6-refs-followup-live-status.json), a las 20:25:06.412 UTC, confirma salud física y cognitiva y otro éxito. No contiene su respuesta ni un nuevo transcript completo: **los recuentos y juicios de este informe permanecen en 199**.

Las citas siguientes son mensajes públicos originales; no son texto de borradores, metas privadas ni reflexiones. Los datos de detalle y la inspección de memorias permanecen junto al backup privado, en `conversation-audit-private-data.json`, con permisos `0600`. El script temporal de lectura fue `/tmp/villa-conversation-audit-data.mjs`; ese nombre documenta el procedimiento, no es una dependencia del producto.

“Repetición” es un juicio cualitativo explicado en cada caso. No se emplearon embeddings, un evaluador LLM ni una puntuación automática de autonomía. Tampoco se presupone que una conversación social necesite acabar en una transacción.

## Recuentos observados

| Medida | Resultado y alcance |
|---|---|
| Conversaciones | 12; todas abiertas; ninguna cerrada o expirada |
| Participantes | 24 residentes en 12 parejas; Wen (W) no tiene conversación en este corte |
| Mensajes públicos | 74; entre 5 y 8 por pareja |
| Mensajes con `?` | 47/74, un 63,5 %. Es sólo presencia literal del signo; no mide preguntas útiles ni repetición semántica |
| Antigüedad de las conversaciones | Entre 5,81 y 7,15 horas reales; ninguna alcanza aún el límite de 16 turnos |
| Proyectos actuales | 25: 19 públicos y 6 privados; 12 activos y 13 con pasos terminados |
| Pasos | 17 hechos, 12 pendientes; 6 proyectos activos no tienen pasos físicos |
| Memorias de interpretación retenidas | 39. No son por ello hechos verificados; su contenido privado no se publica aquí |
| P6 aplicado | 10 trabajos de 10 residentes: 4 incluyen mensaje, 4 borrador, 2 proyecto y 1 reflexión. Las categorías se solapan: H78 incluye proyecto y borrador |
| Documentos | 4 borradores privados, sólo legibles por sus autores; 0 compartidos, programados, publicados o encargados mediante comisión |
| Economía negociada | 1 regalo de 2 células aceptado y transferido; 0 préstamos monetarios, contratos de trabajo pagados o comisiones documentales |
| Guardia física desde el inicio de estas mentes | 1, con 25 acciones efectivas: 18 de planes y 7 de rutina; no se simulan guardias futuras en esta auditoría |

“Pasos terminados” no significa propósito conseguido. Por ejemplo, dormir puede haber terminado un plan antiguo, pero no produce un archivo, una auditoría del inventario o una asignación de materiales. Los seis planes activos sin pasos tampoco son necesariamente defectuosos: algunos propósitos son sociales o carecen de una capacidad física correspondiente.

## Las doce parejas

Los IDs y nombres siguen el [registro canónico](../../src/lib/habitat/residents.ts). “Siguiente” indica el turno guardado; no implica que deba aceptar lo propuesto.

| Conversación y pareja | Mensajes / con `?` | Siguiente | Lectura contrastada con operaciones reales |
|---|---:|---|---|
| 2 — Ama / Ulla (A/U) | 8 / 5 | A | La petición se concreta en cantidad y devolución. U80 acaba creando un borrador privado, un avance real de escritura. No hay entrega ejecutada de papel/tinta ni préstamo monetario; Ama aún no puede leer ese borrador |
| 7 — Bex / Kes (B/K) | 8 / 6 | B | Se vuelven a pedir informes que Kes ya afirmó enviar. No existe borrador de Kes, archivo compartido ni publicación. Bex tiene un borrador privado propio; no equivale a recibir los archivos anunciados |
| 17 — Cato / Noor (C/N) | 7 / 3 | N | La orden de escribir se repite y Noor añade preguntas de alcance/formato. No existe borrador de ninguno. Importante: la última respuesta de Noor es P4; todavía no ha tenido una oportunidad P6 |
| 26 — Dima / Halim (D/H) | 6 / 3 | D | La conversación pasa de seguridad del Dock a justicia del reparto de trabajo y a pedir un informe. Ambos repararon en la guardia; eso no verifica la justicia del reparto. Halim creó después un borrador privado, sin enviarlo |
| 37 — Edda / Lior (E/L) | 6 / 5 | E | Cada asentimiento da paso a otra reasignación de recursos. El motor no registra existencias por habitación ni una operación de traslado de agua/materiales entre ellas. Dormir, el paso realizado por Lior, no efectúa esa asignación |
| 47 — Ferran / Mara (F/M) | 6 / 4 | F | Se concreta una cita y ambos excavaron realmente. Es avance físico compatible con parte del diálogo. No prueba encuentro, café compartido ni construcción de una mesa nueva |
| 59 — Gita / Quim (G/Q) | 6 / 2 | G | Existe el regalo real de 2 células. Gita añadió después un paso de reparación pendiente; todavía no ha pasado otra guardia para ejecutarlo. La pregunta de Quim sobre el progreso no es un nuevo pago ni demuestra reparación |
| 71 — Iris / Osvald (I/O) | 6 / 2 | I | Iris cultivó y Osvald filtró agua realmente. Después Osvald vuelve a indicar que recoja recursos y empiece. Hay avance físico, pero el diálogo no lo incorpora claramente; tampoco existe una transferencia individual de suministros |
| 84 — Juno / Xan (J/X) | 5 / 5 | X | Los cinco mensajes preguntan por una llave o una coordinación futura. El primer mensaje llama “Quim” al destinatario, aunque el participante real es Xan. Quim no interviene; la llave no cambia de estado mediante ninguna acción registrada |
| 115 — Pilar / Vero (P/V) | 5 / 3 | V | La receta se concreta y ambas cocinaron en la guardia. Es producción real de comidas, no prueba de aprendizaje, entrega de harina ni apertura de una panadería |
| 125 — Reva / Sten (R/S) | 6 / 4 | R | La verificación depende repetidamente de Bex, ausente de esta pareja. Sten vuelve a ofrecer ayuda y después pide que Bex envíe documentos. No hay informe compartido ni verificación de cifras registrada |
| 145 — Tomás / Yara (T/Y) | 5 / 5 | Y | Se comunican cifras y luego una previsión condicional. Eso es información útil como diálogo, pero no una modificación automática del registro. Yara durmió en la guardia; no ejecutó el cultivo anticipado |

## Ejemplos que explican el estancamiento

### 1. “Enviado” se convierte en supuesto de la siguiente petición

En B/K, `turn:54` pide el informe del jardín y los registros pendientes de talleres. Bex vuelve a pedir el informe en `turn:197`. Kes responde en `turn:260`: “Sending the garden status update now; the latest workshop logs are attached as well.” Bex vuelve a pedir esos registros de talleres en `turn:301`, y Kes dice en `turn:401`: “Sure, I'm sending the pending workshop logs now”.

El juicio de repetición se apoya en el mismo objeto solicitado y en dos afirmaciones de envío sin una entrega documental. El último caso es **K79/P6**, cuando ya existe una operación de escritura; la salida elegida contiene solamente `message`. No había un documento de Kes que pudiera compartir directamente. Una respuesta honesta podía reconocer esa ausencia, crear un texto atribuido cuando fuera útil o cerrar la petición. No correspondía inventar un adjunto.

Este caso tiene prioridad sobre C/N para evaluar el nuevo protocolo: Noor prometió comenzar en `turn:183` y `turn:292`, pero ambos mensajes preceden a P6. Cato vuelve a pedir un formato concreto en `turn:347` —C72/P6—; la respuesta de Noor posterior a esa petición aún no existe en 199. No se puede afirmar que P6 haya fallado ya en producir su documento.

### 2. La cortesía prolonga una tarea que depende de otra persona

En R/S, `turn:126`, `turn:213` y `turn:298` piden confirmar cifras con Bex. Sten cambia a “Could you let me know if I can help with a task today?” (`turn:271`) y termina pidiendo que Bex envíe los registros (`turn:333`). En J/X, Juno pregunta por Quim a Xan, ambos proponen ir a consultarlo y siguen preguntándose por una cita de quince minutos.

La dependencia de un tercero no se resuelve añadiendo otra pregunta dentro de la misma pareja. Bex ya conversa con Kes y Quim con Gita. El motor limita a cada residente a una conversación abierta; cerrar o esperar son decisiones posibles, pero ninguna de las doce parejas ha cerrado. Los 24 participantes ocupados dejan además al residente sin pareja sin un interlocutor disponible mientras ese estado continúe; esto no prueba que ese residente quiera iniciar contacto. Es una oportunidad de liberar o aparcar la conversación, no motivo para simular una autorización de Bex o Quim.

### 3. La respuesta conserva la historia verbal aunque ya hubo una acción

Iris dijo “Got the items. I'll head to the garden now.” (`turn:295`). Después ejecutó `grow` en la guardia registrada de las 19:08 UTC. A las 19:41 UTC, Osvald vuelve a decir “Grab the water and material now, and get to work.” (`turn:394`, O77/P6).

La inspección privada encontró también una interpretación posterior de Iris que no integra bien su acción ya observada. No se publica esa reflexión ni sus IDs privados. La señal concreta es que el paso propio está `done` y tiene un recibo físico, mientras se sigue razonando sobre comenzar. Conviene priorizar ese recibo al preparar la siguiente decisión, sin mostrar a otros residentes memorias privadas ni convertir la afirmación previa de entrega en un movimiento de inventario.

### 4. Acabar un paso no cumple necesariamente el propósito público

Hay ejemplos públicos medibles: el plan de Kes sobre informar de pendientes terminó con `sleep`; el de Reva sobre contrastar existencias terminó con `sleep`; el de Lior sobre asignación terminó con `sleep`. El plan vigente de Noor sobre documentación contiene un paseo de inspección y descanso, que no escriben texto. Halim ha añadido una reparación en Common para un propósito sobre justicia del reparto de trabajo; reparar modifica mantenimiento y consume recursos, pero no evalúa ese reparto.

Son discrepancias de efecto, no fallos de colisión o de ejecución del paso. También hay pasos pertinentes: cultivo de Iris, excavación de Ferran y Mara, cocina de Pilar y Vero, y el nuevo paso pendiente de Gita. No conviene sustituir todos los planes ni declarar cumplidos los propósitos a partir de una bandera de finalización.

## Avances que no deben borrarse del diagnóstico

- El [regalo Quim→Gita](release-2026-09-08/quim-gita-gift-acceptance-receipt.json) tiene propuesta, aceptación independiente, acuerdo y asiento económico. Es un regalo, no un salario por reparación. La reparación pendiente no estaba vencida: fue planificada después de la única guardia disponible.
- Ulla pasó de prometer un registro a [crear un borrador privado real](release-2026-09-08/u80-natural-retry-success-receipt.json). Sus términos procedían del diálogo público previo. Ese escrito no ejecuta un préstamo de papel/tinta, y no se ha compartido con Ama.
- Los [otros borradores W/B/H](release-2026-09-08/pre-sql10-u80-record-rejection-receipt.json) y el de U no han salido de la privacidad de sus autores. No tener publicaciones todavía no demuestra incapacidad de publicar: exige observar una elección explícita y una guardia posterior.
- El [primer Groq120B real, Q81](release-2026-09-08/first-groq120-live-receipt.json), hizo una pregunta relacionada con una relación existente. Fue una respuesta aplicada, no un contrato, una entrega ni una prueba de mejora general.

## Correcciones causales pequeñas que merece la pena evaluar

1. **Dar prioridad a resultados existentes frente a promesas repetidas.** La preparación ya contiene historia y estado; comprobar que el siguiente turno vea claramente su último paso ejecutado, documentos realmente legibles, ofertas/acuerdos y qué sigue pendiente. Una afirmación de envío no debe crear un “archivo recibido”. Para K/B, la ausencia de un documento real debería permitir reconocerla o proponer escritura, sin fabricar el contenido de supuestos registros.
2. **Permitir un cierre o una espera explícitos sin otra pregunta obligada.** El SYSTEM actual pide una pregunta relevante o un siguiente paso en cada mensaje. Ese sesgo puede prolongar intercambios ya suficientemente concretados. Ofrecer responder, cerrar, esperar la guardia o reconocer que hace falta un tercero preserva la elección individual. No implica aceptar ofertas ni cerrar automáticamente por número de mensajes.
3. **Relacionar el siguiente paso con su efecto real y con su fecha.** Para una meta documental, el modelo puede optar por `record`, pedir acceso al texto o decidir no escribir; dormir e inspeccionar no son sustitutos de redacción. Para Gita, mostrar “reparación pendiente de la próxima guardia” evita tratar la espera física como un fallo que necesita más diálogo. Para reasignaciones entre habitaciones o una llave no modelada, reconocer el límite o redactar una propuesta es más fiel que afirmar “hecho”.

Tres comprobaciones offline concretas antes de gastar más inferencia:

- **Archivo ausente:** con el estado exacto B/K, una frase anterior de envío no añade ningún ID legible ni cambia permisos. Crear y compartir una revisión real sí debe cambiar lo que puede ver el destinatario.
- **Acción ya ejecutada:** con el estado exacto I tras la guardia, el contexto debe conservar `grow` completado y su recibo, junto a la historia verbal. No debe convertirlo en pendiente ni inventar una entrega individual de Osvald.
- **Tercero y espera:** con J/X y R/S, comprobar el cierre voluntario y la disponibilidad posterior real de participantes; con G/Q, conservar la reparación pendiente y el regalo ya liquidado sin otro pago, otra guardia ni consentimiento inferido.

Estas comprobaciones validan el contrato y la información ofrecida; no garantizan que un modelo elija bien. La próxima comparación debería medir reconocimiento de resultados, referencia a documentos reales y cierre razonado, además de validez JSON. No hace falta esperar un pago inexistente para detectar estos problemas, ni fabricar uno para demostrar progreso.

## Referencias de implementación

- [Instrucciones de conversación](../../src/lib/habitat/society/instructions.ts): pregunta o siguiente paso, versiones anteriores preservadas.
- [Validación y aplicación del turno](../../src/lib/habitat/society/turn.ts): destinatario real, conversación activa y consentimiento de ofertas.
- [Operaciones documentales](../../src/lib/habitat/society/records.ts) y [su contrato](../../src/lib/habitat/society/record-choice.ts): lectura, escritura, permisos y operación explícita.
- [Verbos físicos](../../src/lib/habitat/engine/verbs.ts): efectos exactos de trabajar, cultivar, cocinar, inspeccionar y reparar.
- [Primera guardia P6 reproducida](release-2026-09-08/first-protocol6-physical-watch.json): 25 acciones reales, sin una guardia adicional de auditoría.

No se publica contenido privado ni se modifica el historial. Este informe propone qué comprobar después; no declara completado el objetivo de autonomía.
