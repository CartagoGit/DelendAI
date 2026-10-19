# Ficha de continuación — agent-orchestrator

Snapshot auditado: `514758e783620c8953079be4d71fceccacb3de8b` (fuente aislada en `/tmp/delendai-audit-514758e`). Fecha: 2026-10-19, Europe/Madrid. Alcance de esta ficha: entrypoint completo de 295 líneas, resolución del port, contratos de dispatch/runtime, compilación del manifest, prompt delegado, lectura segura de archivos, ejecución secuencial y pruebas relacionadas. **No es lectura exhaustiva de los 34 archivos fuente ni los 35 specs listados para el plugin, ni certificación del host MCP real.**

## Cadena inspeccionada

- `plugins/agent-orchestrator/src/index.ts`: valida opciones/política, registra plan/dispatch/events, resuelve runtime de forma lazy y almacena artefactos de contexto bajo el cache del plugin. Un runtime ausente se anuncia como `needs-host-adapter`; la acción dispatch falla cerrada en vez de fabricar éxito. Un `portFactory` válido tiene precedencia sobre fake explícito; el fake requiere opt-in.
- `plugins/agent-orchestrator/src/lib/dispatch/port-resolution.helper.ts`: adapta `IHostSubagentRuntime`; adjunta manifest y presupuesto; en hosts sin enforcement reemplaza la instrucción por prompt derivado del manifest. El booleano `enforcesManifest` es una afirmación del adaptador: el plugin no puede probar que el host respete esa frontera.
- `delegation-manifest.service.ts`: lee únicamente las rutas nombradas por la tarea mediante `SafeWorkspaceReader`; denegaciones/fallos se representan como `missingContext`, no se omiten silenciosamente. Compila referencias de artefactos y rechaza si `ceil(bytes/4)` excede el input budget. El valor bytes/4 es una estimación, no medición de tokens.
- Contrato `IDelegatedTask`/`IHostSubagentRuntime`: el host recibe rol, instrucción, budget, slot y task opcional; el contrato no tiene `AbortSignal`, método cancel ni garantía tipada de enforcement de deadline. `metadata` es extensible y contiene el override, pero no obliga al host a terminar un subagente.
- `LinearDispatcher`: aplica timeout local con `Promise.race`, clasifica su rechazo como `error-storm` y puede rotar si la política lo permite. `Promise.race` deja pendiente el promise del port; el `finally` solo limpia el timer.

## Hallazgo

### ORCH-07 — P2: timeout de dispatch abandona la espera, pero una rotación puede solapar subagentes aún activos

**Ubicaciones:** `plugins/agent-orchestrator/src/lib/dispatch/linear-dispatcher.ts:203-250,319-343`; contrato `packages/contracts/src/host-subagent-runtime.interface.ts:52-63`; traducción del runtime `plugins/agent-orchestrator/src/lib/dispatch/port-resolution.helper.ts:63-93`.

```typescript
result = await withTimeout(
    this.#port.spawnSubagent({ /* ... */ }),
    this.#plan.budget.timeoutMs,
);
// timeout cae en catch; con error-storm permitido continúa el bucle
// y llama spawnSubagent de nuevo.

return await Promise.race([
    promise,
    new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`dispatch timed out ...`)), timeoutMs);
    }),
]);
```

**Reproducción:** `evidence/agent-orchestrator/timeout-orphan.repro.ts`, ejecutada contra el dispatcher real del snapshot. Con `timeoutMs=5`, `maxIterationsPerSubagent=2`, `error-storm` permitido y un port que completa cada solicitud a los 30 ms, `_dispatch` devolvió `ok:false` cuando había dos invocaciones vivas; se midió `peakConcurrent=2` aunque el runner es lineal. Ambas terminaron después de devolver el resultado. Salida íntegra en `evidence/agent-orchestrator/timeout-orphan.log`.

**Impacto:** un subagente que escribe archivos puede seguir aplicando cambios después de que el orquestador dé el timeout por fallido y lance otro intento para el mismo slot; esto rompe la serialización que promete el dispatcher y deja efectos posteriores al resultado fallido. El riesgo se limita a adapters que no cancelan por su cuenta al vencer `override.timeoutMs`; el contrato actual no los obliga a hacerlo. La prueba usa un port sintético y no representa una integración de host concreta.

**Corrección recomendada:** añadir cancelación cooperativa por invocación (p. ej. `AbortSignal` en el request), propagarla desde el timeout y no rotar hasta que el adapter confirme terminación/cancelación; si el host no puede cancelar, reportar `timed-out-still-running` y evitar repetir el mismo trabajo automáticamente. Regresión: port bloqueado con efecto diferido; al timeout debe quedar cero invocaciones activas antes de cualquier rotación. Confianza: alta sobre el comportamiento del dispatcher y del contrato; el comportamiento de adapters reales no se certificó. No se cambió producto.

## Cobertura positiva y límites

- `SafeWorkspaceReader.readText` realiza validación física de realpath y bloquea `.git`, `.env*` reservados y `node_modules`; su uso en la fuente de archivos evita atribuir al plugin un bypass lexical no observado.
- Las pruebas inspeccionadas cubren port ausente/incorrecto, opt-in del fake, modo prompt vs manifest declarado, exclusión de tools de escritura para `scout`, contexto faltante y rechazo al superar el input budget. `linear-dispatcher.spec.ts` cubre que vence el timeout y el dispatch devuelve error, pero no afirma que el subagente haya sido cancelado ni prueba ausencia de solape.
- No se ejecutó la suite del plugin durante esta continuación; la evidencia de ORCH-07 es la reproducción sintética independiente indicada arriba. No se conectó runtime de host, ni proveedor, ni filesystem de usuario.
- Pendiente para una auditoría de plugin completa: el resto de las 34 fuentes/35 specs inventariadas, con change-context, integración de registro de herramientas, adapters/lifecycle reales, cancelación de host y cobertura de errores/concurrencia. No se asigna nota global al plugin.

## Hallazgos nuevos de la lectura ampliada

### ORCH-08 — P2: las herramientas de plan y classify descartan evidencia admitida por el schema

**Estado:** defecto confirmado por trazado estático; no requiere host real. **Snapshot:** el mismo de la auditoría.

`TaskSchema` admite `files` y `facts`. Ambos campos participan en la clasificación: `task-classifier.ts:68-85` deriva candidato de delegación, número de áreas, disjointness y `requestedDelegation`; `ceremony-classifier.ts` también puntúa cantidad de subsistemas y hechos como `architecturalImpact`. Sin embargo, `plan.tool.ts:75-82` reconstruye el task con solo `id`, `description`, `tags` y `hint`; `telemetry.tool.ts:72-82` hace lo mismo en `_classify`. Así, callers que envían archivos/indicadores válidos reciben una decisión como si no los hubieran dado. `execution-policy.tool.ts` sí conserva `files` y `facts`, por lo que las superficies públicas pueden discrepar con la misma entrada.

**Impacto:** un plan puede omitir la ruta de ceremonia/delegación solicitada o cambiar el modo por no ver los subsistemas afectados. Las specs de tools prueban resultados de ejemplos sin `files` ni `facts`; no hay aserción de passthrough para los campos que el schema ofrece.

**Corrección recomendada:** construir una única `ITask` fiel a todos los campos de `TaskSchema` y compartir ese adaptador entre plan/classify/execution-policy; regresión con `files` en tres subsistemas y `facts.requestedDelegation`/`disjointness` comprobando que la decisión corresponde a la entrada. Confianza alta en la omisión del wrapper; el plan concreto resultante depende del input.

### ORCH-09 — P2: `plan.override` etiqueta el modo sin volver a planificar

**Estado:** discrepancia contrato/resultado confirmada por lectura y por el test existente. El schema y la documentación de la herramienta presentan `override` como override de modo; el handler primero calcula `engine().plan(...)` sin pasar `args.override` y luego solo sustituye `mode` y `rationale` (`plan.tool.ts:75-95`). Los pasos, presupuesto y rotación permanecen los del modo inicial. Para una tarea trivial con default `single` y `override: linear`, el propio `plan.tool.spec.ts:70-76` espera `mode: linear`, pero no verifica que se reemplace la lista de pasos `orchestrate/verify` de `single` por pasos `spawn/verify` de `linear`; el comentario del spec reconoce que solo re-etiqueta.

**Impacto:** quien ejecute el resultado puede creer que recibió un plan `linear` mientras los pasos describen trabajo `single`; el modo deja de ser una descripción fiable del plan. No se ha demostrado que un host concreto ejecute mal esa mezcla.

**Corrección recomendada:** aplicar `engine().plan(task, args.override)` y devolver el plan efectivo, o renombrar/documentar la opción como etiqueta no ejecutable y no publicar una modalidad incoherente. Regresión: exigir que modo, pasos, budget y rotation provengan todos del mismo modo, incluyendo overrides válidos e indisponibles en un registry host.

## Lectura complementaria no exhaustiva

En esta continuación se inspeccionaron además `budget-tracker`, los cuatro mode adapters, policy/registry y resolución de overrides por modo, `TaskClassifier`/`decision-to-plan`, las herramientas plan/dispatch/execution-policy/classify/events, receipts de decisión y subagente, telemetry en memoria y sus specs focales de budget, plan, decision y overrides. No se ejecutaron esas specs en esta tanda. El plugin conserva 34 fuentes y 35 specs en el snapshot; la lectura no cubre todas. Quedan pendientes los clasificadores completos, change-context, lifecycle/adapters reales, specs restantes y una valoración global.

## Fuentes fijadas (SHA-256)

| Archivo | SHA-256 |
|---|---|
| `plugins/agent-orchestrator/src/index.ts` | `d80c8aaaf37490f4407657a8c02aa971e2a35f2732b029207ebad2e8043b19bf` |
| `plugins/agent-orchestrator/src/lib/dispatch/port-resolution.helper.ts` | `31f6c0c99fc5650e716b261b2fab05ac23e2a3388426c9e87a66388ac980add8` |
| `plugins/agent-orchestrator/src/lib/dispatch/delegation-manifest.service.ts` | `b6938fb801fb7473f35370f3d8be9cbe235b59b6f9d96f0b2760e549034f7444` |
| `plugins/agent-orchestrator/src/lib/dispatch/contracts.ts` | `b50ef57bb493fc1abde64377a72b25b77ef531552b89727f08fd735b3f8f4443` |
| `packages/contracts/src/host-subagent-runtime.interface.ts` | `390d19b78a9a070e21debf641b4763f84f4b1513b9f7160885332079c4cf1773` |
| `packages/core/src/lib/subagents/delegation-prompt.helper.ts` | `5dccb2f71ceee44b504d0067296e068116e2685901351e7eece576ddd65fd05d` |
| `packages/core/src/lib/filesystem/safe-workspace-reader.ts` | `215bdfbeabcd23f6c3e15737b27ee7d82197235d6e6bc5a5d1aa219a486e202b` |
