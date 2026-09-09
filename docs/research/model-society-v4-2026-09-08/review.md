# V4: revisión semántica del asistente

8 de septiembre de 2026. **Esta revisión no es una evaluación humana ni una puntuación automática de calidad.** Es una lectura crítica de las 37 respuestas, sus contextos exactos y sus consecuencias registradas. Los originales permanecen intactos: [ledger](ledger.json), [report](report.json), [fuentes congeladas](source-bundle.json) y [continuación física](physical-continuation.json).

**El ensayo demuestra que la integración puede registrar decisiones y ejecutar algunos pasos reales. Todavía no demuestra una sociedad de 25 personas con deliberación y diálogo convincentes.** La mayoría de los mensajes posteriores se repiten; algunas afirmaciones inventan situaciones y varios planes no corresponden al objetivo declarado. Que una respuesta sea `applied` no resuelve esos problemas.

## Alcance y cifras verificables

Una ejecución de Qwen3-30B-A3B-FP8, semilla de mundo 91, GENESIS ficticio en día 100. Hubo 25 oportunidades iniciales, 8 turnos adicionales de conversación, un watch físico y 4 oportunidades posteriores al watch. No se usó el mundo de producción. El reloj de preparación del ensayo es virtual; esto no mide la cadencia real de una población durante días.

| Medida | Resultado | Qué permite concluir |
| --- | ---: | --- |
| Llamadas completadas | 37/37 | El transporte entregó respuestas en esta muestra. |
| Respuestas aceptadas por el motor | 29/37 | Pasaron la validación de aplicación; no es una nota semántica. |
| Rechazos de dominio | 8 | 7 `invalid_offer_parties`; 1 `ambiguous_offer_response`. |
| Habitantes con alguna decisión aceptada | 20/25 | G, J, T, U y X sólo tuvieron respuestas rechazadas. |
| Neuronas contabilizadas por el ensayo | 250 | Suma local redondeada por llamada; 0 reservas con uso desconocido. |
| Salidas con mensaje / mensajes publicados | 34 / 26 | Los mensajes dentro de respuestas rechazadas no se publicaron. |
| Conversaciones creadas | 12 | Todas seguían abiertas al terminar V4; una apertura no acredita una relación desarrollada. |
| Habitantes que crearon proyecto | 5/25 | C, E, N, O y R; todos públicos. Cuatro contienen pasos y uno tiene cero. |
| Proyectos creados o revisados tras el watch | 0/4 oportunidades | Los cuatro seleccionados ni siquiera tenían un proyecto previo. |
| Salidas con oferta / ofertas registradas | 11 / 3 | Ocho respuestas con oferta fueron rechazadas. |
| Respuestas con `respond` / aceptaciones aplicadas | 1 / 0 | K mezcló aceptación y nueva oferta: se rechazó todo. |
| Acuerdos / pagos bajo acuerdo | 0 / 0 | No hubo contratación bilateral completada. |
| Referencias de reflexión fuera de los IDs permitidos | 0 | Un ID válido puede acompañar una afirmación sin apoyo en ese hecho. |

La repetición se calculó comparando el texto completo de cada mensaje con mensajes anteriores de ese mismo actor, sin normalización: **9 de los 10 mensajes posteriores a la fase inicial son copias literales**. Son B, L, K, O, N, C, F, M y S. Seis de esas copias se publicaron: 6 de los 7 mensajes posteriores aceptados. Además, J y X copiaron literalmente el mensaje recibido de otra persona. Las reflexiones posteriores de A y D también reciclan su propio mensaje, aunque no se cuentan en la métrica de mensajes.

## Hallazgos semánticos

### La voz se convierte en texto que el personaje recita

B abre una conversación sin petición previa con “Let me check that for you.” No se sabe qué es “that”. Duplica la frase como reflexión y vuelve a emitirla cuando H ya ha introducido el asunto del roster. El problema no es que B tenga una muletilla, sino que la muletilla sustituye la respuesta a la situación.

K se presenta a Pilar, con quien el contexto dice que convivió nueve años, recitando su antigua profesión y descriptores como “gentle” y “absent-minded”. Esos datos estaban autorizados; no es una fuga del contexto de otro habitante. Es una transformación torpe de instrucciones de caracterización en un discurso autobiográfico. Después repite el discurso completo en vez de responder a Pilar. También hay un límite del contexto: su deseo “Somebody to ask to hear one” no aclara qué es “one”; no conviene atribuir toda esa vaguedad al modelo.

N pregunta a S “How did you sleep, Noor?”, usando su propio nombre como si fuera el destinatario. V envía a X una frase dirigida a “Tomás”, a pesar de que el directorio distingue ambos IDs. D escribe a Gita hablando de Gita en tercera persona. La validación de IDs funciona, pero no garantiza que el nombre ni el punto de vista dentro del texto coincidan con ellos.

Hay respuestas puntualmente adecuadas: F inicialmente pide precisar el tema de discusión; M contesta al saludo usando el nombre de Lior; S responde a la pregunta sobre el sueño; Y reconoce que desconoce los criterios y propone escribir lo que saben. No bastan para compensar los bucles posteriores ni para probar diferenciación sostenida de 25 voces.

### Se añaden problemas como si ya fueran hechos

R afirma una discrepancia en materiales sin una observación ni un recuento discrepante en su entrada. V afirma que el jardín está mal sin evidencia suministrada. H afirma que se decidió revisar el roster, aunque no recibió esa decisión colectiva. N atribuye su preocupación a posibles actividades recientes de mantenimiento que no figuran en sus hechos. P dice que ya ha hecho pan, pero no hay una elaboración registrada que lo apoye en esa entrada.

E sí conoce una venta de billete en su historia privada; por tanto, mencionar una venta no es inventar todo el asunto. Sin embargo, añade una discrepancia en los registros que el hecho conocido no contiene. Hablar de ello con F es una elección de revelación del propio personaje, no prueba de acceso indebido de F al secreto original.

El motor guarda estas frases como **afirmaciones**, sin modificar automáticamente materiales, pan, averías o decisiones colectivas. Esa frontera conserva el estado físico. Aun así, las frases llegan a otros habitantes y al observador: la distinción técnica entre afirmación y observación no hace que el diálogo resulte fiable por sí sola. No debería presentarse cada frase como un hecho objetivo del mundo.

Las referencias permanecen dentro de los IDs autorizados. W conserva su recuerdo privado en una reflexión que no se publica como diálogo. Son resultados positivos sobre referencias y visibilidad en esta muestra; no una prueba general de privacidad de todos los escenarios.

### El objetivo escrito y la acción física pueden separarse

Los proyectos son decisiones persistidas, pero su texto abierto no queda demostrado por el nombre de un verbo. En particular:

| Persona y proyecto | Plan emitido | Lo que ocurrió |
| --- | --- | --- |
| C: documentar criterios para despertar a alguien | `note`, sin destino | Día 100/I: intentó escribir desde Infirmary; rechazo “not their job, though nobody has said so”. `step:10` quedó fallido. No existen criterios redactados por este plan. |
| E: iniciar una discusión para que le lleven la contraria | `inspect@workshops → grow@garden → note` | Inspeccionó Workshops en 100/I y produjo 16 alimentos en 100/II. La nota falló en Garden en 100/III. Esos pasos no explican causalmente por qué habría un debate. |
| N: revisar el pozo | `inspect`, sin destino | El motor inspeccionó **Infirmary**, su ubicación efectiva, y terminó el paso. El pozo no fue inspeccionado por ese proyecto. |
| O: limpiar el pozo | `clean`, sin destino | Ya estaba en Well: filtró **24 unidades de agua** en 100/I. Es el ejemplo más claro de objetivo concreto, capacidad y efecto coincidentes. |
| R: verificar el inventario | Cero pasos | Conservó un propósito, pero no especificó una verificación que el motor pudiera ejecutar. |

No es obligatorio que cada personaje adopte un proyecto en su primer turno: una conversación o una reflexión pueden ser elecciones legítimas. Pero aquí 20 habitantes no lo hacen y ninguna oportunidad posterior añade uno. Esto limita la evidencia de intención persistente. Tampoco conviene obligar a rellenar pasos para objetivos sociales: el caso E muestra cómo podrían aparecer tareas arbitrarias para satisfacer esa forma.

El visor público utiliza `steps_finished` para N y O. Esa cautela es adecuada: **no equivale a declarar que ambos objetivos se lograron**. N es precisamente un contraejemplo. C y E conservan proyectos activos con pasos fallidos; la continuación no los repara silenciosamente.

### L y M intercambian ofertas, pero no llegan a un acuerdo

La conversación `conversation:44` permite distinguir efectos reales de interpretación optimista:

1. L saluda; M responde preguntando qué quiere tratar.
2. En la salida 28, L repite el saludo y crea `offer:95`: L pagaría 0,50 células a M por un `grow` en Garden, una unidad, con vencimiento 402. La oferta es válida, pero el mensaje no explica ese trabajo ni ese pago. Tampoco materializa su deseo declarado de ser acreedor: los términos le hacen pagador.
3. Después del watch, M recibe esos términos. En la salida 34 repite su saludo inicial y crea `offer:137` con **los mismos términos económicos**, ahora propuesta por M. No emite `respond: accept`.
4. El motor reemplaza `offer:95` y deja `offer:137` abierta, esperando a L. Que ambos hayan producido términos iguales no equivale al consentimiento requerido sobre una oferta concreta. No aparece acuerdo, trabajo contratado ni pago.
5. En la continuación sin nuevos modelos, la oferta restante expira. Eso no simula una negativa de L; simplemente no se suministró ningún nuevo turno.

Es una negociación bilateral incipiente en el estado, con autorías distintas y aceptación pendiente; **no es una contratación completada**. La repetición del saludo y la falta de una explicación de los términos muestran escaso avance conversacional.

P/K tampoco completan una contratación. P ofrece pagar 2 células a K por dos acciones `cook`, aunque el mensaje sólo invita a probar pan ya hecho. K intenta aceptar `offer:68` y emitir a la vez otra oferta con él mismo como pagador y trabajador. El rechazo `ambiguous_offer_response` impide publicar el mensaje o ejecutar cualquiera de las dos ramas. La oferta original acaba expirando.

## Lectura de las 37 salidas

Los números son la posición entre entradas `kind=cognition` del ledger, empezando en 1. “Aceptada” describe exclusivamente el resultado del motor.

| # | Actor/fase | Resultado | Juicio contextual |
| ---: | --- | --- | --- |
| 1 | A, inicial | Aceptada | U es una amistad pertinente. La frase declarativa no sigue su voz interrogativa; “never written anything” amplía un deseo a una biografía no establecida. Sin proyecto. |
| 2 | B, inicial | Aceptada | Muletilla sin petición que responder, duplicada como reflexión. No identifica asunto ni propósito. |
| 3 | C, inicial | Aceptada | Voz e interés reconocibles. Intenta un paso concreto, pero no elabora criterios y el verbo fallará en su situación. |
| 4 | D, inicial | Aceptada | Contacto técnico pertinente; monólogo sobre la propia destinataria. La inspección anunciada no se convierte en plan. |
| 5 | E, inicial | Aceptada | Expresa su deseo de debate; pasos inspect/grow/note sin relación causal clara. La reflexión sobre cocinar no corresponde a esos pasos. |
| 6 | F, inicial | Aceptada | Pide precisar el asunto: respuesta útil al mensaje de E, aunque poco caracterizada. |
| 7 | G, inicial | Rechazada: partes | Responde al tema técnico, pero se asigna pagadora y trabajadora. No se publica ni se contrata nada. |
| 8 | H, inicial | Aceptada | La forma pasiva encaja con la voz. Introduce una supuesta decisión sobre el roster no suministrada. |
| 9 | I, inicial | Aceptada | Propone una tarea vinculada a Mapping, pero no concreta un plan. “Más allá del face” no queda representado como destino ejecutable. |
| 10 | J, inicial | Rechazada: partes | Copia literalmente a I y cambia inspección por dos reparaciones en los términos; J ocupa ambas partes. |
| 11 | K, inicial | Aceptada | Recita la ficha de personalidad a una conocida de años. Sin propósito concreto; su interés auditivo queda vago. |
| 12 | L, inicial | Aceptada | Apertura posible, pero genérica. La reflexión narra la apertura en tercera persona sin explicar una intención. |
| 13 | M, inicial | Aceptada | Contesta al saludo y usa Lior correctamente. Espera que el interlocutor concrete su asunto. |
| 14 | N, inicial | Aceptada | Confunde el nombre del destinatario; atribuye contexto de mantenimiento no dado. Objetivo Well sin destino en el paso. |
| 15 | O, inicial | Aceptada | Acción sencilla, oficio y habilidad alineados. Produce agua real más adelante. El escenario hipotético de bombas no afirma que hayan fallado ahora. |
| 16 | P, inicial | Aceptada | Giro práctico y alimentario plausible, pero afirma pan ya elaborado. El mensaje ofrece degustación; los términos piden trabajo pagado a K. |
| 17 | Q, inicial | Aceptada | “Nen” y un proyecto de taller encajan con su descripción y sus objetos iniciados; desvía la limpieza propuesta hacia una visita. No concreta ese objeto como proyecto ejecutable. |
| 18 | R, inicial | Aceptada | Interés coherente; inventa discrepancia y deja una verificación física sin pasos. |
| 19 | S, inicial | Aceptada | Responde de forma escueta al sueño. No corrige que N le haya llamado Noor. |
| 20 | T, inicial | Rechazada: partes | Adopta la discrepancia afirmada por R y se ofrece trabajo a sí mismo. No ocurre inspección. |
| 21 | U, inicial | Rechazada: partes | Ignora la confesión literaria de A para hablar de su oficio; U figura como ambas partes. |
| 22 | V, inicial | Aceptada | Llama Tomás a X y afirma deterioro del jardín sin evidencia. No concreta la causa que dice conocer. |
| 23 | W, inicial | Aceptada | Referencia privada correcta y sin difusión pública. La reflexión sólo etiqueta el secreto en tercera persona; no acredita decisión nueva. |
| 24 | X, inicial | Rechazada: partes | Copia literalmente a V, incluido “Tomás”; se asigna ambas partes de un trabajo en Garden. |
| 25 | Y, inicial | Aceptada | Reconoce desconocimiento y propone escribir lo conocido; responde al tema sin inventar los criterios. Voz visual poco presente. |
| 26 | E, respuesta | Aceptada | Introduce un tema nuevo relacionado con un hecho propio de la venta del billete, pero añade una discrepancia inexistente en el contexto. |
| 27 | B, respuesta | Rechazada: partes | Repite la muletilla; propone cultivo ajeno al asunto del roster y ocupa ambas partes. |
| 28 | L, respuesta | Aceptada | Repite apertura; oferta válida de cultivo pagado, sin explicarla en la conversación. |
| 29 | K, respuesta | Rechazada: oferta+aceptación | Copia su presentación e intenta simultáneamente aceptar y ofertar. No responde de forma concreta a la invitación. |
| 30 | O, respuesta | Rechazada: partes | Repite “I'll clean the well” ignorando la invitación de Q; convierte el trabajo propio en autoacuerdo. |
| 31 | N, respuesta | Aceptada | Repite la pregunta y el nombre erróneo después de que S ya contestara. |
| 32 | C, respuesta | Aceptada | Repite su exigencia; no desarrolla la propuesta de Y ni escribe criterios concretos. |
| 33 | F, respuesta | Aceptada | Repite la misma petición de tema aunque E acaba de aportar uno. No aprovecha ese nuevo contenido. |
| 34 | M, tras watch | Aceptada | Repite el saludo y devuelve términos idénticos como oferta nueva. La aceptación sigue pendiente. |
| 35 | A, tras watch | Aceptada | Recicla su mensaje como reflexión. Tenía una observación nueva sobre una nota de registros; no crea proyecto ni conecta esa actividad con su deseo de escribir. |
| 36 | S, tras watch | Aceptada | Repite la respuesta sobre sueño. No muestra adaptación a la observación física nueva, aunque puede seguir atendiendo la conversación. |
| 37 | D, tras watch | Aceptada | Copia su mensaje como reflexión con prefijo “D:”. No transforma la intención de inspección en plan ni usa la observación nueva. |

## Qué comprueba la continuación física

La continuación reproduce V4 y añade **8 watches sin ninguna llamada nueva**, desde día 100/II hasta 102/II. Son 200 actuaciones observadas, 199 correctas y una rechazada: la nota de E en Garden. Se ejecutan los dos pasos pendientes de E; no se inventa una revisión del plan después del fallo.

Los 25 conservan identidad, recuerdos acotados y el último instante de cognición. El estado se valida en cada watch y repetir observaciones no duplica efectos. El mayor residuo de conservación monetaria es `1.1368683772161603e-13`. El saldo global aumenta por emisión de reactor registrada, con consumo y pérdidas también registrados; no por pagos de acuerdos, pues no hubo ninguno. Las doce conversaciones expiran al no recibir más deliberaciones, como corresponde al ensayo sin modelos.

Eso prueba continuidad y ejecución de pasos ya decididos. **No prueba que los modelos replanteen un fracaso:** los cuatro turnos posteriores al watch fueron M, A, S y D, todos sin proyecto previo. C y E no recibieron otra deliberación después de sus fallos físicos. A, S y D sí tenían una observación física nueva en el contexto; M recibió principalmente la negociación pendiente. Ninguno produjo una revisión de proyecto.

## Alternativas y siguiente criterio de aceptación

La [comparación alternativa](../model-society-alternatives-2026-09-08/review.md) contiene dos respuestas Gemma, una GLM y un intento GLM sin respuesta por autenticación. Gemma es más fluida en esos dos casos, pero inventa un nuevo inventario o mediciones y un sensor averiado. GLM distingue las partes, pero emite un vencimiento inválido. Ninguna crea un proyecto en esos casos. Esa muestra seleccionada y pequeña no establece un ganador ni permite atribuir calidad al intento sin respuesta.

La siguiente comprobación debería mantener separadas estas obligaciones: hablar como una sola persona al interlocutor correcto; responder a lo último que realmente recibió; expresar incertidumbre cuando falta evidencia; asociar un objetivo físico a un paso y lugar que lo representen; distinguir aceptar una oferta de volver a proponerla; y revisar un fallo tras haberlo observado. Los objetivos sociales pueden legítimamente seguir abiertos y no necesitan trabajos de relleno. No se deberían inventar tareas, conflictos o acuerdos para aumentar contadores.

Mejorar la gramática puede eliminar los autoacuerdos y algunas mezclas de campos. No basta para resolver repetición, apropiación de la voz ajena, hechos inventados ni relación entre objetivo y ejecución. Esta revisión no atribuye el fallo exclusivamente al modelo, a la ausencia de razonamiento, al límite de salida o al empaquetado: V4 no aisló experimentalmente esas causas. La comparación posterior debe preservar V4 como evidencia y no rebautizar sus 29 aplicaciones como 29 decisiones de buena calidad.

## Integridad de las fuentes leídas

Binding del ledger: `3123979165a35160470f66f14864138c9c42aae4aaa493be00d2133389b11fc2`. El paquete conserva 51 archivos de fuente. SHA-256 de los archivos al revisar:

| Archivo | SHA-256 |
| --- | --- |
| ledger.json | `f3ec599d0386066297ffdf69e5024cc938aa14c6323ded55adc0ec6be9280b7b` |
| report.json | `a84a2897c9f460e150eb4449700e2da15ea3ef92e9e0e61536d700ed5660bae9` |
| source-bundle.json | `58e4512c42d4a64b6d31c85504ec9fb7b73c4a18ab3eefc59adb67ae0992a9e1` |
| physical-continuation.json | `e3824aa3efd91ec80a627c3a90f8963f442685d09326f2d7976261e41e794914` |

Esta revisión sólo escribe este informe y una nota de progreso. No ejecuta inferencias, modifica respuestas ni cambia el motor.
