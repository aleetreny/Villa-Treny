# Auditoría profunda del motor y del servicio

Fecha: 7 de septiembre de 2026. Base: árbol de trabajo de `night-shift-habitat`, después de la integración y de la economía V5. Esta revisión es anterior a las correcciones y a la extracción a Villa-Treny.

## Alcance y método

Se revisaron motor, verbos, economía, memoria, cognición, contratos, proveedor, cuotas, scheduler, SQL, migraciones y proyección pública. No se modificó implementación, no se avanzó el mundo remoto, no se llamó a inferencia real y no se desplegó durante esta auditoría.

Pruebas nuevas: una semilla durante 5.000 días y otras 19 durante 365 días cada una; son 11.935 días de rutina, con 20 semillas observadas durante al menos un año. Además, 365 días de intenciones sociales controladas, 360 guardias con cognición fallida, estados límite de inventario, invariantes del codec y un contexto con 24 préstamos. Tres pruebas diagnósticas en SQLite/Workers local, con bindings remotos desactivados, confirmaron fallos del servicio. Que esas tres pruebas pasen significa que reproducen los defectos, no que el producto sea correcto.

Datos sin resumir: [habitat-audit-engine-data.json](habitat-audit-engine-data.json). Reproductores históricos: carpeta [habitat-audit-reproduction](habitat-audit-reproduction/). Importan el motor real y usan estados en memoria o SQLite local. Sus rutas absolutas identifican exactamente el árbol auditado; deben ajustarse al trasladarlos. Los ensayos de rutina no simulan millones de decisiones de modelos ni garantizan la calidad de historias futuras.

No se ha demostrado ningún P0. P1 significa bloqueo del mundo, pérdida sustancial de agencia o estado operativo engañoso; P2 es un defecto acotado o una capacidad necesaria incompleta. Las carencias de diseño se distinguen de fallos reproducidos. Esta revisión no certifica ausencia total de vulnerabilidades.

## Lista priorizada, antes de implementar

### E01 · P1 · Una unidad de agua puede bloquear toda la guardia

**Confirmado, motor y SQL.** Con todos a `fed=20` e inventario `{produce:0, meals:0, water:1, materials:16}`, `findFood` intenta cultivar porque sólo repone agua cuando queda menos de una unidad. Cultivar requiere dos. La gente se acumula en Garden; con 18 ocupantes, el siguiente movimiento lanza `No unoccupied walkable tile remains in garden`. En el servicio se revierte la guardia completa: mismo estado, misma revisión y mismo problema al reintentar.

Código: `src/lib/habitat/engine/tick.ts:108-114`, `verbs.ts:294`, `state.ts:152-174`; `workers/habitat-runtime/src/habitat-world.ts:682` y `:491`.

**Corrección:** planificar usando requisitos completos de las recetas, disponer de alternativa viable y desacoplar capacidad lógica de sala del número de casillas del dibujo. Si se conserva aforo, debe existir una espera explícita que no lance una excepción global.

**Criterio:** agua 0, 1 y 2 con comida agotada progresan; 25 personas pueden dirigirse al mismo servicio sin abortar el mundo; la prueba SQL confirma incremento de revisión y conservación de dinero/materiales.

### E02 · P1 · La rutina deshace inmediatamente un desplazamiento elegido

**Confirmado.** A está en Records. Una intención válida `go → archive` se ejecuta, pero al acabar esa misma guardia A vuelve a Records y figura escribiendo una nota. Se consume su pensamiento y no queda memoria del desplazamiento. El bucle que completa viajes de la rutina también se aplica al viaje elegido por cognición; después manda de nuevo al puesto habitual.

Código: `tick.ts:162`, `:279`, `:285`.

**Corrección:** distinguir desplazamiento deliberado de los pasos internos de una tarea; conservar intención o destino hasta completarlo con una política explícita.

**Criterio:** una intención válida de ir a otra sala deja a la persona allí al terminar la guardia. Una necesidad urgente puede cambiar el plan sólo con un resultado causal registrado, no sobrescribiéndolo silenciosamente.

### E03 · P1 · El orden de turnos invalida decisiones sociales viables

**Confirmado.** Durante 365 días se eligió el sujeto normal de cognición y se le ofreció hablar con alguien que estaba en su misma sala. De 1.170 intenciones inicialmente viables, 426 se rechazaron porque la otra persona había sido movida por su rutina antes del turno del actor: 36,4 %. Ejemplos: día 100, guardia III, S y A estaban en Common; A se fue a Records antes de que S pudiera hablar. Día 102, guardia I, I y O estaban en Cabin 5; O se marchó a Well.

Código: `tick.ts:258-279`; `verbs.ts:139`.

**Corrección:** resolver interacciones sobre un estado coherente de la guardia, reservar participación con consentimiento o replanificar explícitamente cuando cambia la situación. No desperdiciar sistemáticamente la única reflexión de seis horas por orden incidental.

**Criterio:** pruebas de ambos órdenes de residentes producen una interacción o una negativa causal de la contraparte, no un rechazo accidental por la rutina anterior. Mantener límites de acciones y evitar que un participante actúe dos veces gratis.

### E04 · P1 · Una cognición inválida monopoliza el turno y puede figurar como éxito

**Confirmado.** En 360 guardias sin intención válida, T fue seleccionado las 360 veces y las otras 24 personas ninguna. La justicia se basa en la última cognición válida, sin registrar intentos fallidos. Además, el router local aceptó como `completed` un JSON bien formado con `verb: not_a_verb`; no probó Groq. El dominio lo descartó después y ejecutó rutina. Para una intención decodificada pero rechazada por el mundo, el trabajo se marca aplicado igualmente.

Código: `workers/habitat-runtime/src/domain.ts:289-296`; `tick.ts:285`; `providers/router.ts:53-55`; `providers/workers-ai.ts:90`; `habitat-world.ts:675`, `:719-721`.

**Corrección:** diferenciar intento, respuesta válida y acción realizada; avanzar equidad por oportunidad consumida; validar el dominio antes de declarar éxito del proveedor; registrar rechazo real de la acción.

**Criterio:** las 25 personas reciben oportunidades aunque un actor o un proveedor fallen reiteradamente; verbo inválido es error de salida, no éxito; resultado de acción aceptada/rechazada visible y factual. No aumentar el límite de una cognición cada seis horas.

### E05 · P1 · `healthy` puede ocultar un mundo permanentemente detenido

**Confirmado en SQLite local.** Tras E01, `lastErrorCode=RangeError`, revisión sin avanzar y guardia vencida, pero `health=healthy`: existe una alarma futura de reintento y eso satisface la comprobación. El visor, además, marca conexión viva por HTTP 200 sin representar por separado salud y avance. `RuntimeStatus` omite el error que el backend ya devuelve.

Código: `habitat-world.ts:158`, `:209`, `:479-491`; `src/lib/habitat/useHabitatLive.ts:42-53`; `src/lib/habitat/live.ts:163`.

**Corrección:** separar conectividad HTTP, modo, progreso del reloj, retraso y salud de cognición. Un reintento programado no prueba que una guardia se haya completado.

**Criterio:** el caso SQL bloqueado devuelve un estado degradado y su causa; la UI conserva el último mundo válido y enseña que no avanza; recuperación elimina el aviso sólo después de una guardia confirmada.

### E06 · P1 para operación de años · Trampa monetaria de hambre sin recuperación

**Confirmado a largo plazo, no observado como presente en producción.** La semilla 1 funciona durante los primeros 2.000 días. Primera condición física crítica en el día transcurrido 2.232: Noor, `fed=10`. A los 2.700 días el reactor está en 0,346 y quedan 8,030407 células entre bolsillos y tesorería; las 25 personas ya tienen condiciones críticas. A los 2.800 días quedan 2 comidas, 4 productos y 15 de agua, pero las 25 personas llegan a cero en sus cinco condiciones. A los 5.000 días siguen vivas, trabajando, en cero, con comida aún almacenada y aproximadamente 7×10⁻¹² células en total.

La tarifa de comida requiere 0,5 células. La rutina hambrienta intenta trabajar para cobrarlas; el trabajo sólo crea créditos y la tesorería vacía no puede pagar. La emisión depende de excedente energético después de alumbrar salas fijas. La prioridad de hambre impide dormir o recuperarse. No existe una decisión accesible que raciona, subvenciona, cambia la carga eléctrica o resuelve el bloqueo. El declive del reactor puede formar parte del relato; el defecto es quedar en un bucle imposible y silencioso aun con comida disponible.

Código: `verbs.ts:224`; `tick.ts:108-117` y cierre del día; `economy.ts:71-84`.

**Corrección:** reglas explícitas de emergencia/insolvencia y distribución de esenciales; permitir decisiones con efectos reales sobre consumo y producción. No regalar dinero ocultamente ni eliminar toda escasez.

**Criterio:** ensayo de años y escenarios de tesorería cero establecen recuperación, racionamiento o un estado terminal explícito. Nunca trabajo infinito sin posibilidad material de comer. Conservación exacta de moneda y explicación del destino de cada transferencia.

En las otras 19 semillas de un año, la semilla 10 tuvo también un mínimo transitorio de hambre 10 en el día transcurrido 346, tras préstamo, pagos y reparación; se recuperó antes de acabar el año. No todas las muestras anuales fueron libres de necesidades críticas.

### E07 · P2 · Energía y mantenimiento apenas limitan la producción

**Confirmado; requiere decisión de diseño por receta.** Con reactor cero, mantenimiento cero y todas las salas apagadas, cultivar, cocinar, filtrar agua y excavar siguen dando exactamente su producción normal. Reparar aumenta un indicador de mantenimiento que no afecta rendimientos, salud ni potencia. La energía afecta principalmente a iluminación y emisión monetaria.

Código: `verbs.ts:278`, `:294`, `:314`, `:335`; `economy.ts:91`; asignación eléctrica de `tick.ts`.

**Corrección:** declarar qué actividades son manuales y cuáles necesitan maquinaria, energía o instalaciones mantenidas. Vincular esas dependencias a resultados, sin hacer que toda actividad manual dependa ficticiamente de electricidad.

**Criterio:** pruebas de cada receta con y sin sus requisitos; reparar recupera una capacidad concreta y observable. El visor no atribuye consecuencias que el motor no calcula.

### E08 · P2 · Un campo `target` irrelevante introduce recuerdos remotos

**Confirmado.** `grow` de V con `target:B` es aceptado; V cosecha en Garden, el suceso incluye únicamente a V, pero B, en Hold y sin participar, recibe el recuerdo de esa cosecha. El protocolo permite campos de otras acciones y la escritura de memoria usa cualquier `intent.target`.

Código: `verbs.ts:74`, `:662`.

**Corrección:** esquema discriminado por verbo y recuerdos basados en participantes/testigos reales, no campos sobrantes. Separar la información pública del observador de la que sabe cada agente.

**Criterio:** parámetros ajenos al verbo se rechazan; una cosecha sin B no añade conocimiento a B. Una interacción autorizada sí llega a ambos participantes.

### E09 · P2 · El codec admite estados semánticamente inválidos

**Confirmado.** Se aceptan por separado: A en `(99999,99999)`; identidad interna de A igual a B; dos residentes en la misma casilla; `lastThoughtWatch=999999` en el pasado del mundo; inicio de economía quinientos días en el futuro. Se validan formas y números, pero faltan relaciones entre campos. El frontend sí rechaza posiciones inválidas y puede perder toda la instantánea.

Código: `workers/habitat-runtime/src/domain.ts:63`, `:76-84`, `:127-145`; `src/lib/habitat/live.ts:70` y validación de ocupación.

**Corrección:** validador canónico de identidad, reloj, economía y localización acorde al modelo final de salas. Importación atómica que rechaza estados incompatibles sin sustituirlos por génesis.

**Criterio:** los cinco casos fallan con causa específica; todos los estados legítimos y migraciones históricas pasan. No usar la geometría del dibujo como límite de población si se adopta presencia visual independiente.

### E10 · P2 · El contexto no tiene un límite efectivo de 2.500 tokens

**Confirmado.** Un mundo válido con 24 préstamos de A, generado usando los verbos reales y aceptado por el codec, prepara un contexto de 8.492 bytes de usuario. Sistema + usuario + esquema suman **3.511 tokens**, incluido margen de 64, con el tokenizer oficial de Qwen3-30B-A3B-FP8. La lista de obligaciones no tiene límite. La medición anterior de 1.080 contextos corrientes menores de 2.500 tokens era empírica, no una garantía general.

Código: `domain.ts:392`, `:402-403`; `workers/habitat-runtime/src/contracts.ts` límites de cadenas; `providers/router.ts:23`.

**Corrección:** empaquetado con presupuesto total, prioridades estables, deduplicación de memoria/historia y resumen de obligaciones. Preservar hechos conocidos, compromisos urgentes y agencia antes que contexto repetido.

**Criterio:** casos extremos de préstamos, historia y nombres largos caben en el presupuesto; se mantiene la cuota real; ningún secreto entra al recortar o resumir contexto de otro residente.

### E11 · P2 · El endpoint de encolado admite trabajos que nunca procesa

**Confirmado en SQLite local.** Un trabajo aceptado por enqueue queda `pending` después de una guardia real. El scheduler sólo busca el jobId que prepara para esa guardia; no selecciona la cola general y reconcile tampoco consume los pendientes arbitrarios.

Código: `habitat-world.ts:348`, `:410`, `:467`, `:581`.

**Corrección:** retirar la capacidad no soportada o implementar una cola explícita, limitada y con autorización/caducidad, siempre subordinada a la cuota.

**Criterio:** todo enqueue aceptado tiene una trayectoria verificable a aplicado, rechazado, cancelado o caducado. Ningún pendiente inmortal y ningún incremento implícito de pensamientos.

### E12 · P2 · Workers AI no tiene una fecha límite propia

**Hallazgo de código; no se reprodujo un cuelgue remoto.** `ai.run` se espera sin timeout. Groq sí tiene 45 segundos. Una promesa que no finalice puede retener la guardia hasta que actúe otra protección de plataforma o recuperación de lease; eso no es una política explícita de latencia.

Código: `providers/workers-ai.ts:64`; `providers/groq.ts:75`; `habitat-world.ts:467`, `:590`.

**Corrección:** deadline acotado, tratamiento de resultado desconocido y protección ante respuesta tardía; reservar/contabilizar exactamente una vez sin reintentos ilimitados.

**Criterio:** proveedor simulado que nunca responde libera la ejecución en plazo y conserva el mundo; su respuesta tardía no aplica una acción ni cobra otra reserva. El siguiente residente puede tener oportunidad.

### E13 · P2 · La contraparte tiene poca capacidad de decidir

**Carencia de diseño con mecánica verificable.** La aceptación económica se reduce principalmente a resentimiento menor que 70. En acciones sociales, estar juntos suele bastar; dormir, estar ocupado, evitar al actor o tener compromisos no implica respuesta propia. Algunas acciones cambian a la contraparte sin una política individual de participación. Precios, importes y términos están fijados por verbo, sin negociación.

Código: `economy.ts:57`; `verbs.ts:139`, `:454`, `:520`, `:557`, `:626`.

**Corrección:** una política de respuesta de cada destinatario basada en necesidades, relación, capacidad y compromisos, con oferta/aceptación atómica cuando proceda. Mantener verbos básicos; no escribir drama aleatorio ni hacer que un modelo decida por los dos.

**Criterio:** estados contrarios de la contraparte producen respuestas causales distintas; regalos no aceptados, préstamos y trueques fallidos no mutan saldos; quien duerme o ya actuó no presta servicios ilimitados fuera de su turno.

### E14 · P2 · Faltan objetivos persistentes y transferencia de conocimiento

**Mezcla de evidencia empírica y capacidad incompleta.** Durante 5.000 días de rutina, 20 de 48 salas nunca reciben visitas: Bridge, Breach, Graveyard, Study, Spare Bedroom, Parlour, Projection, Winter, Library, Grand Bedroom, Salon, Hearth, Maintenance, Kitchen, Service Counter, Main Diner, Soda Bar, Stalls, Washroom y Games. Breach no es utilizable; quedan 19 espacios utilizables sin motivo rutinario de visita. Puesto de trabajo y regreso nocturno dominan los recorridos.

La memoria es FIFO de ocho entradas; puede borrarse antes del próximo turno personal de reflexión, aproximadamente cada 25 guardias. `teach` y `confide` cambian ejes, pero no transfieren un hecho: no hay identidad del conocimiento ni estado aprendido. Los secretos de LATENT son una lista estática por conocedor. El eje de deseo no cambia por ningún verbo. A los 2.000 días hay 245 ejes dirigidos con confianza en 100 y 163 con afecto en 100; a los 2.700, 301 y 194. Esto no prueba que los vínculos cercanos deban degradarse, pero sí limita los futuros cambios disponibles.

Código: `tick.ts:117`, `:162`; `economy.ts:49-52`; `verbs.ts:520`, `:626`; `domain.ts:395-396`.

Además, ciertas relaciones escritas combinan hecho compartido y perspectiva privada en un solo texto que se entrega a ambos participantes. La instrucción de no ser omnisciente no elimina el dato ya incluido. Deben separarse hechos compartidos y lo que sólo conoce uno; no difundir LATENT para rellenar contexto.

**Corrección:** objetivos pequeños persistentes, memoria de compromisos y hechos aprendidos con propietario y procedencia; actividades y elecciones con motivos personales; distinción entre relación autoral y relación actual. No garantizar relatos fascinantes con una métrica artificial ni inventar discusiones para aumentar variedad.

**Criterio:** una decisión puede sostenerse varias guardias; un hecho transmitido se aprende sólo con participación real; un secreto no viaja en una conversación genérica; compromisos sobreviven al FIFO. Ensayos comparan diversidad, necesidades y eventos causales sin optimizar sólo producción.

### E15 · P2 · El archivo no permite reconstruir toda la economía ni recuperar cualquier guardia

**Confirmado por cobertura de eventos.** Comer cobra y consume recursos sin un suceso económico estructurado; salarios, fugas y diversas acciones modifican estado sin un registro de transacción reutilizable. Los préstamos tienen noticias textuales, no un ledger completo por operación. `world_state` se sobrescribe en cada guardia y existen copias de migración, pero no checkpoints periódicos exportables con versión de reglas. No se puede afirmar que el archivo público permita reproducir saldos o el mundo desde cualquier día.

Código: `verbs.ts:230-238`; `economy.ts:68-104`; `habitat-world.ts:692`, `:719`, `:845`, esquema en `:1097` y backups en `:1189`.

**Corrección:** eventos tipados de dinero, recursos y resultado de intención, separados del diario legible; checkpoints coherentes con checksum y versión de reglas; exportación/importación autenticada y comprobada.

**Criterio:** saldo inicial + eventos = saldo final, sin dobles apuntes por reintentos; restaurar checkpoint + eventos produce el mismo estado. El diario público puede seguir filtrando rutina, pero no sirve de sustituto del registro de auditoría.

### E16 · P2 · Lecturas y métricas desperdician datos disponibles

**Confirmado por implementación.** El visor descarga estado completo —600 relaciones, 48 salas y 25 residentes— cada 45 segundos aunque el reloj sólo cambia cada seis horas. Hay ETag, pero no se resuelve `If-None-Match` con 304. Las relaciones autorales se vuelven a proyectar en cada lectura. La cuota pública muestra reservas máximas, aunque se guarda uso real en SQL. Cuando falla Workers AI y funciona Groq, el resultado completado conserva el intento final y pierde parte del itinerario de fallos en la proyección/persistencia del router.

Código: `src/lib/habitat/useHabitatLive.ts:42`; `workers/habitat-runtime/src/index.ts`, respuesta ETag; `domain.ts:276`; `quota.ts:218`; `habitat-world.ts:775`.

**Corrección:** lectura ligera de revisión/estado, respuesta condicional y carga del mundo sólo cuando cambia; uso real y reservado como magnitudes distintas; historial acotado de intentos por trabajo. No sustituir reservas conservadoras por estimaciones optimistas.

**Criterio:** una segunda lectura sin cambios no retransmite el mundo; cambio de revisión actualiza todos los datos de forma atómica; una caída seguida de fallback deja ambos intentos y sus consumos/reservas explicados.

## Qué sí se conserva en la evidencia

La identidad de las 25 personas, los 600 ejes y la conservación monetaria no mostraron corrupción en las muestras largas: error monetario de aproximadamente 10⁻¹⁰ o menor. Los checkpoints muestreados por el codec pasaron. Esto no invalida los casos de estado ilegal que el mismo codec admite ni la trampa de necesidades a largo plazo. Las pruebas de deudas anteriores demostraron cuatro préstamos y ocho pagos parciales; no ocho préstamos devueltos. Las cuotas existentes siguen siendo una cognición cada seis horas y rutinas para las 25 personas, no 25 modelos pensando continuamente.

## Orden de corrección y extracción

1. Preservar datos y fronteras: exportación coherente autenticada, checksum y ensayo de restauración; identidad y invariantes; configuración y secretos separados del código.
2. Eliminar bloqueo de guardias y estado engañoso: E01, E05, E09, E12.
3. Restaurar agencia y equidad: E02, E03, E04, E08 y resultado factual de cada intención.
4. Economía causal y supervivencia: E06, E07, E13, E15; validación transaccional y años de simulación.
5. Objetivos, memoria y conocimiento: E14, con presupuesto E10 y sin aumentar cuota.
6. Cola, lecturas y métricas: E11, E16.

Copiar archivos a Villa-Treny no traslada por sí solo las vidas reales. `/observer` no contiene semilla completa, presión interna, todas las memorias, reloj de cognición, trabajos, leases ni ledger de cuotas. Reconstruir desde esa proyección o llamar a génesis perdería estado. Opciones seguras: conservar temporalmente el mismo backend como única autoridad, o exportar/importar estado completo, archivo, revisiones y configuración operativa en un corte coherente. Un segundo scheduler sobre dos copias divergiría; el traspaso debe documentar cuál es la autoridad y conservar la próxima guardia, sin avanzar manualmente ni duplicar inferencia. Mantener los backups de migración y el historial original, sin reescribir sucesos previos a la economía V5.
