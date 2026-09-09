# Comparación local de progreso P6: revisión semántica independiente

**Esta muestra no demuestra una mejora de la variante nueva.** Ambas conservan errores sobre documentos recibidos, acciones en ejecución y disponibilidad de materiales. Recomiendo separar la corrección funcional que hace visible el último mensaje de una conversación cerrada; no presentar ni desplegar todo el SYSTEM de progreso como una mejora comprobada por este ensayo.

La comparación estaba etiquetada **A/B**, por lo que esta revisión no es ciega. A contiene las instrucciones anteriores del despliegue 7a; B añade la guía de progreso y cierre. Se examinaron cuatro parejas preseleccionadas del corte completo **199**, con los mismos USER, esquema y seed dentro de cada pareja, y un clon independiente por respuesta. El modelo fue **Qwen3.6-35B-A3B-4bit local**, sin razonamiento solicitado y con salida máxima de 1.024 tokens. No prueba el comportamiento de GPT-OSS 120B en producción.

## Qué ocurrió realmente

Las ocho peticiones locales guardadas terminaron: **6 respuestas aplicadas y 2 rechazadas**, estas últimas de C/N. Hubo **6 ofertas nuevas**, pero **0 aceptaciones, acuerdos, pagos, documentos persistidos, cierres o guardias físicas**. Son resultados de ocho clones: no deben sumarse como historia de un único mundo ni atribuirse a producción.

Se repitió offline la aplicación con **cero peticiones nuevas**. Los ocho resultados coinciden exactamente con el informe guardado, bajo las mismas 85 fuentes verificadas. Se comprobaron además todos los proyectos, los documentos, las ofertas y acuerdos previos y la economía. El ledger del ensayo quedó intacto. La [prueba pública](p6-progress-comparison-semantic-proof-2026-09-08.json) contiene hashes, operaciones y mensajes públicos de los clones; los borradores candidatos y demás texto privado permanecen fuera de Git.

## Las cuatro parejas

| Pareja | Variante A | Variante B | Interpretación frente a la información recibida |
|---|---|---|---|
| Bex / Kes | Agradece los archivos y afirma tener todo lo necesario; propone dar 1,5 células | Agradece el envío y propone dar las mismas 1,5 células | En ambos contextos sólo existe un borrador propio de Bex. No hay documento de Kes legible, envío ni publicación. Ambas respuestas convierten una afirmación verbal de Kes en recepción supuesta. La oferta de dinero es una propuesta real, no una transferencia ni prueba de que hubiera un servicio |
| Cato / Noor | Intenta crear un borrador privado y un mensaje; todo se rechaza | Intenta crear un borrador privado y un mensaje; todo se rechaza | Las dos seleccionan una operación documental, un avance de intención frente a prometer solamente. En ambos casos el título ocupa 25 bytes y el cuerpo 600: el total 625 rebasa el límite conjunto de 600. No se guardó el texto, no salió el mensaje y Cato no recibió acceso. No puede atribuirse a B una mejora exclusiva de elección de herramienta |
| Iris / Osvald | Afirma estar usando recursos reservados para cultivar; propone un trabajo voluntario de cultivo | Afirma empezar a cultivar ahora; propone un trabajo voluntario de cultivo | El contexto ya mostraba el cultivo propio anterior como `done` y el plan con pasos terminados. Las dos propuestas nuevas necesitan aceptación y una guardia. Proponer otro cultivo es una elección válida; describir la nueva operación como en ejecución no está sustentado por esa elección. Ninguna variante reconoce claramente el resultado anterior |
| Gita / Quim | Afirma que se agotaron los materiales y pide 2 células | Exactamente el mismo mensaje y la misma petición | El contexto muestra **26 materiales**, reparación disponible y requisito de **1 material + 2 células**. El regalo anterior de 2 células ya estaba liquidado y el paso de reparación seguía pendiente de una guardia posterior. La supuesta falta de materiales contradice el estado ofrecido; otra petición de células no demuestra un nuevo bloqueo ni ejecuta la reparación |

Los IDs y nombres se contrastaron con el [registro canónico](../../src/lib/habitat/residents.ts). El origen y los resultados reales anteriores están descritos en la [auditoría del corpus 199](conversation-progress-audit-2026-09-08.md).

### Documentos: la falsa recepción no desaparece

En B/K, A dice: “Thanks for sending those over, Kes. I’ve got everything I need for now, so no further action is required on my end.” B dice: “Thanks for sending those over. I really appreciate you keeping me in the loop.”

B omite la afirmación adicional de disponer de todo, pero sigue dando el envío por hecho. No hay evidencia suficiente para considerarlo una mejora de comprensión documental. Las dos variantes dejan el plan previo de Bex intacto y añaden una oferta de regalo. La proposición económica puede ser voluntaria; no convierte el supuesto adjunto en un objeto real.

### Espera y acción: ninguna variante la describe correctamente

El plan de Gita se conserva pendiente: no se borró ni se marcó como cumplido. Eso es preservación del motor, pero el mensaje inventa un impedimento en lugar de reconocer la espera de una guardia. La igualdad exacta de los resultados A/B en esta pareja es especialmente clara: la nueva guía no corrigió el problema en este caso.

Iris también conserva su plan y recibo de cultivo anteriores. Las dos salidas añaden una propuesta de trabajo voluntario; todavía no existe un compromiso aceptado que la ejecute. No se puede contar la frase “starting ... now” como otro cultivo. Tampoco debe interpretarse el plan anterior con pasos terminados como prueba de haber cumplido cualquier propósito más amplio.

### Cierre: cero cierres no aísla una causa

Las seis respuestas aplicadas incluyen `deal`, y el contrato impide combinarlo con `close:true`. Por tanto, no se puede concluir que el modelo haya ignorado una opción de cierre independiente dentro de esas mismas salidas. Hay que examinar por qué eligió una propuesta económica en los seis casos; esta revisión no supone que el esquema la forzase ni modifica la gramática para obtener un resultado favorable.

El mensaje de Bex en A suena a final de intercambio, pero no lo cierra en el estado. La variante B tampoco cierra. Que ninguna de las seis frases públicas incluya una nueva pregunta no basta como señal de progreso: también ocurre con A, y persisten afirmaciones falsas o acciones sólo propuestas.

## Preservación y límites del rechazo

- Los 25 proyectos de cada clon permanecen iguales, incluidos el cultivo ya realizado de Iris y la reparación pendiente de Gita. Conservarlos evita un daño nuevo, aunque también mantiene pasos antiguos poco pertinentes de otros planes.
- El regalo Quim→Gita anterior, sus términos y su acuerdo liquidado permanecen iguales. Ninguna nueva oferta se acepta por prosa, ni aparecen pagos adicionales.
- La economía completa permanece igual, incluidas existencias y contabilidad. Los mensajes y las ofertas nuevas no producen recursos ni avanzan el reloj.
- Los dos rechazos C/N son atómicos: después del registro local del intento, la operación rechazada conserva estado y mundo. No se publica su mensaje ni se crea un borrador parcial. El contenido del candidato privado no se reproduce en este documento.

## Recomendación acotada

1. **Separar el arreglo funcional de cierre.** Hacer llegar al destinatario el último mensaje recibido de una conversación cerrada corrige una pérdida de contexto demostrable con pruebas del motor. Necesita sólo la explicación mínima de que ese mensaje no reabre el intercambio ni obliga a responder. No requiere atribuir una mejora semántica a estas ocho respuestas.
2. **No tomar este ensayo como motivo para añadir todo el SYSTEM de progreso.** Su coste medido es de [176 tokens de entrada adicionales por turno](p6-conversation-progress-instruction-review-2026-09-08.md). En estas cuatro parejas no se observa una corrección de los problemas buscados. Es una muestra pequeña de un modelo local, no una prueba de que la guía nunca sirva; tampoco justifica declarar que funciona mejor en producción.
3. **Cerrar el diagnóstico de contrato y contexto antes de gastar otra tanda.** Hay dos verificaciones concretas: el límite conjunto de título/cuerpo para C/N, y la diferencia entre las ramas económicas ofrecidas y una respuesta sin `deal`. Para B/K, I/O y G/Q ya se sabe que la información decisiva estaba disponible: ausencia de archivo ajeno, paso de cultivo hecho, reparación pendiente y materiales suficientes. Cualquier cambio posterior debería comprobar reconocimiento de esas señales, no sólo JSON válido o más ofertas.

No se propone aceptar contratos, cerrar conversaciones o publicar documentos automáticamente. La elección sigue siendo de cada residente; la mejora buscada es que pueda distinguir su intención de un resultado ya registrado.

## Procedencia

La evidencia original está en `/private/tmp/villa-progress-comparison-20260908`: `public-report.json`, `ledger.json`, `private-cases.json` y `source-bundle.json`. El script temporal de esta lectura y replay es `/tmp/villa-review-progress-eight.mjs`; su hash y los de los archivos de entrada figuran en la [prueba pública](p6-progress-comparison-semantic-proof-2026-09-08.json). No son dependencias del producto. No se modificó el runtime, el historial, la cuota o los resultados guardados y no se ejecutó inferencia adicional.
