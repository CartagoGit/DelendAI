# Continuación: telemetría de estado y contratos MCP

Auditor: gpt-6.1-sol, host Codex, 2026-10-19, snapshot `514758e783620c8953079be4d71fceccacb3de8b`. No se ha modificado código funcional.

## Cobertura y arquitectura

`packages/state-telemetry`: leídos íntegros sus 46 archivos de producción (3.848 líneas), manifiesto y cinco specs seleccionadas. El ledger adjunto contiene SHA-256 y rangos exactos. El paquete privado depende únicamente de state/sqlite; no de core. Separación clara entre observadores puros, journals, almacenamiento SQLite/NDJSON, proyección determinista, estadística ETA y renderizado de estado. Los observadores no consultan proveedores ni guardan cuerpos: publican hashes. ToolObserver elimina claves con aspecto de secreto antes de hash; no equivale a anonimización de cualquier dato arbitrario.

Los stores SQLite usan parámetros SQL y claves autoincrementales. El bus configura busy_timeout antes de WAL y reintenta SQLITE_BUSY al arrancar; duration-history configura WAL antes del timeout y no incorpora esa recuperación. El facade degrada a NDJSON o memoria. Una degradación de ETA no puede tomarse por persistencia de duración garantizada. NDJSON renumera IDs al leer para evitar colisiones entre escritores; el ID devuelto por append es provisional y no sirve como identidad global estable.

La proyección ordena eventos por timestamp e ID, impide retroceso de fase y separa progreso de confianza. El spec de productor comprueba equivalencia incremental/rebuild con 200 secuencias, pero mantiene items constantes y timestamps estrictamente crecientes: no verifica cambios sólo de items ni eventos tardíos. `reconcileRows` sólo reconstruye items tocados por delta. No declarar soporte de cambios de aceptación/status sin evento nuevo. `load()` de la API no vacía snapshots retenidos de una carga anterior; requiere prueba antes de elevarlo a defecto confirmado.

ETA usa medianas y percentiles de historia local, mínimo cinco muestras, fallback por task-kind/actor y null cuando faltan datos. Confianzas 0,9/0,6 son constantes de política, no probabilidades calibradas. Median guard descarta muestras que no mueven la mediana tras diez observaciones: puede limitar la adaptación; es diseño explícito y no se presenta como bug reproducido. `classifyStalledByEta` llama near-completion a un bloqueo que agotó≥80% del p80: inferencia heurística, no prueba de cercanía a terminar. No hay gasto LLM en estas funciones.

Se trazaron los consumidores `packages/cli/src/lib/work-progress.service.ts` y `tools/scripts/telemetry/drain-telemetry.script.ts`: ambos llaman al drain sin mutex exterior. La CLI usa sharedCheckoutOf para evitar almacenes independientes por worktree. El watcher usa setInterval con callback async no esperado; una ejecución que dure más de500ms puede solaparse. Los defectos siguientes no se basan sólo en ausencia de mutex: incluyen ejecución entre procesos o fixtures de fallo concretas.

## G61-STATE01 — P2, confirmado: dos drains vivos consumen el mismo claim

- Componente/ubicación: state-telemetry, `src/lib/events/work-event-journal-drain.service.ts`, función claim y drainWorkEventJournal (líneas52–104); consumidores citados arriba. Snapshot el indicado en cabecera.
- Esperado: un journal reclamado tiene un consumidor vivo; recuperación de un proceso muerto conserva los eventos sin duplicarlos.
- Observado: claim trata cualquier `.draining` existente como abandonado. Dos procesos Bun independientes usan sink NDJSON real; A persiste el evento y se pausa en su sink, B lee el claim aún vivo, persiste la misma observación y elimina el claim. Ambos salen0, appended1 cada uno; el bus contiene2 eventos y un único payload.
- Reproducción/evidencia: `bun repro-telemetry.ts.txt` tras copiarlo a `.ts` y mantener las rutas del snapshot o adaptarlas como explica REPLAY. Caso `two-independent-drainers` en log adjunto. La barrera sólo controla el orden del sink; no sustituye claim ni el filesystem. No necesita red ni proveedores.
- Impacto/causa: duplicación de contadores, fases y señales de bloqueo; un sufijo fijo no expresa exclusividad ni vida del propietario. No se ha demostrado corrupción de propuestas.
- Cambio mínimo: proteger toda la reclamación/consumo/retiro con exclusión entre procesos y recuperación identificada por propietario. Definir además idempotencia del sink para crash después de append y antes de ack.
- Regresión: repetir la barrera con dos procesos y exigir una sola observación persistida, recuperación tras SIGKILL y preservación de líneas nuevas.
- Confianza: alta para duplicación con dos consumidores vivos; recuperación exactamente una vez no fue implementada ni certificada. Relación: nuevo, separado de mutex de propuestas D1/D2.

## G61-STATE02 — P2, confirmado: fallo transitorio del sink retira el único journal

- Ubicación: mismo módulo, catch de sink.append y rm final (líneas92–102), snapshot indicado.
- Esperado: una indisponibilidad temporal del almacén conserva una línea válida para reintento o cuarentena recuperable.
- Observado: sink que rechaza una línea válida produce appended0/skipped1 y elimina tanto journal como claim. El spec existente fija precisamente este resultado, por lo que pasar ese test no demuestra durabilidad.
- Repro/evidencia: caso `transient-sink-failure` en `repro-telemetry.log`, sink de fallo sintético explícito y archivos temporales reales. No afirma un fallo espontáneo del driver SQLite.
- Impacto/causa: pérdida irreversible de telemetría válida; se usa la misma categoría skipped para basura y fallo recuperable, y rm no distingue ambos.
- Recomendación: separar inválido de no persistido, mantener un remanente recuperable o realizar ack por lote con contrato de idempotencia.
- Regresión: sink falla una vez y luego acepta; el segundo drain debe almacenar exactamente una observación sin perder otras líneas.
- Confianza alta; nuevo. Prioridad2 porque el estado afectado es observacional, no se demuestra pérdida del trabajo principal.

## G61-STATE03 — P2, confirmado: duración abandonada se ignora y después se sobrescribe

- Ubicación: `src/lib/eta/duration-journal.service.ts`, drainTransitionDurationJournal (líneas55–101); snapshot indicado.
- Esperado: el remanente `.draining` de un drain interrumpido se recupera antes de reclamar otro journal.
- Observado: con sólo un remanente válido de1234ms el drain retorna recorded0. Al llegar un journal nuevo5678ms, rename sobrescribe el remanente en POSIX y sólo se conserva5678.
- Evidencia/repro: caso `seeded-crash-layout` del mismo script. Es un layout de crash sembrado, no un proceso realmente matado; filesystem y lógica del drain reales en Linux. No se afirma idéntica semántica de overwrite en Windows.
- Impacto/causa: pérdida de muestras de duración y sesgo ETA. El drain de eventos sí intenta recuperar remanente, pero el de duración no lo consulta. Ambas rutas representan el mismo protocolo con reglas diferentes.
- Recomendación: unificar el protocolo mínimo de claim/recuperación, con exclusión y sin reemplazar un remanente pendiente; conservar políticas de validación separadas.
- Regresión: crear remanente válido y journal nuevo; recuperar ambos en orden, incluyendo reinicio tras fallo y dos procesos.
- Confianza alta para Linux y fixture descrita; nuevo.

## G61-MCP01 — P2, confirmado en composición native: salida Zod union rompe llamadas válidas

- Componente: contrato transversal SDK/core/plugin; reproducción representativa api_validate.
- Ubicación: `plugins/api/src/lib/tools/api-validate.tool.ts`, OUTPUT union y registerTool; `packages/core/src/lib/project/instrument-tool-handlers.helper.ts` conserva config.outputSchema; SDK instalado1.31.0 normaliza esquemas objeto para validación. No se modifica una dependencia para reproducir.
- Esperado: una respuesta `{x:1}` conforme a un spec inline con x integer devuelve findings vacío en todos los modos.
- Observado: createMcpProject/assembleCliConfig reales + SDK client/server por InMemoryTransport. Native lista34 herramientas, omite outputSchema de api_validate y responde isError:true con `undefined is not an object (evaluating 's._zod')`. Managed/adaptive listan7 y la misma operación por resolve_capability tiene status ok y findings vacío.
- Repro/evidencia: `repro-core-union.ts.txt` y `.log`; plugin y composición reales, transporte local; sin fetch ni proveedor. Otros plugins con unions se inventarían en sus fichas; esta prueba no demuestra automáticamente el mismo resultado en cada uno.
- Impacto/causa: capacidad válida falla en native después de ejecutar el handler; si otro handler con este patrón tiene efectos, el error puede inducir reintentos. El SDK espera esquema objeto/raw shape para salida, mientras los registros aceptan union sin adaptar. Core sólo adapta structuredContent de errores y no corrige esta configuración.
- Recomendación: contrato de salida objeto compatible con SDK (p.ej. envelope común con campos opcionales/refinamiento interno), y prueba por protocolo en vez de llamar callbacks capturados. Evitar convertir una ausencia de outputSchema en un ahorro de tokens válido.
- Regresión: listar y llamar con éxito/error cada salida union en native; confirmar igualdad semántica con managed/adaptive y que los efectos ocurren una vez.
- Confianza alta para api_validate y versiones del snapshot. Nuevo transversal; un único ID compartido con fichas de integraciones/utilidades. No afirmar managed roto: la prueba lo contradice.

## Límites y siguiente trabajo

Suite completa global todavía en ejecución al escribir esta tanda; no se atribuyen resultados parciales a una validación final. No se realizó navegador real ni proveedor de pago. Faltan otras familias del inventario; este documento completa sólo la lectura de producción de telemetría y la reproducción transversal indicada. Siguiente familia raíz: state/sqlite/proposals-sqlite y sus controles de integridad.
