# Ampliación de auditoría — coordinación, calidad y Batuta

Snapshot fijo: `514758e783620c8953079be4d71fceccacb3de8b`, `/tmp/delendai-audit-20261019-L2whP7`. Auditor: Codex / `gpt-6.1-sol`, subagente coordinación. Fecha local: 19-10-2026, Europe/Madrid. Complementa, no sustituye, `/tmp/delendai-audit-evidence-concurrencia/report.md`.

## Cobertura real y método

`coverage.json` es el registro por archivo: contenido leído completo, SHA-256, bytes, momento y clasificación producción/spec/metadata. Buscar un nombre no cuenta como lectura. El helper `read_batch.py` imprime íntegramente cada fichero y registra sólo los del lote. No hubo outputs truncados en los lotes registrados hasta este checkpoint. Se leyeron también `plugin.manifest.ts`, AGENT.md, configuración de tests y tsconfig de los componentes concluidos. No se atribuyen al SHA los estados del servidor vivo.

Lectura completa de producción, metadata y specs terminada para seis componentes: audit-orchestrator, completion, context-for-change, impact-analysis, project-health y quality. Los otros diez permanecen pendientes en este lote; la revisión parcial anterior de propuestas/runner/selector continúa siendo parcial. La suite global la ejecuta el coordinador raíz; aquí no se repitieron suites que ya cubre. Estado verificado significa análisis estático completo del componente y reproducciones indicadas, no acceso a proveedores reales ni a cuentas.

## Matriz individual

| ID | Ruta | Función | Dependencias | Estado declarado | Estado verificado | Tests | Riesgos | Evidencias | Auditor |
|---|---|---|---|---|---|---|---|---|---|
| audit-orchestrator | plugins/audit-orchestrator | Derivar tareas de plan y delegarlas | core, agent-orchestrator, zod | experimental, público | Producción+specs leídos completos; parser ejercitado con fixtures | 4 specs leídos; ejecución global pendiente | N1: trabajo omitido por parser; dispatch real requiere host | coverage.json; new-repros.json | Codex |
| completion | plugins/completion | Persistir y notificar declaraciones de fin | core, MCP SDK, zod | stable, público | Producción+specs leídos completos; escape de borrado reproducido | 3 specs leídos; global pendiente | N2: guardia física ausente en list/remove tras cambio de directorio | coverage.json; new-repros.json | Codex |
| context-for-change | plugins/context-for-change | Contexto compacto de fuentes/pruebas/docs | core, git, search, memory, docs, conventions, refactor, test-policy | experimental, público | Producción+specs leídos completos; fixture standalone y presupuesto | 2 specs leídos; global pendiente | N3: raíces monorepo; N4: tamaño declarado incorrecto | new-repros*.json | Codex |
| impact-analysis | plugins/impact-analysis | Dependientes, riesgo y selección de tests | core, git, search, refactor, test-policy | experimental, público | Producción+specs leídos completos; fixture standalone y presupuesto | 2 specs leídos; global pendiente | N3 y N4; riesgo low injustificado cuando no se cubre layout | new-repros-2.json | Codex |
| project-health | plugins/project-health | Señales baratas de salud y remisión a scanners | core, quality, security, deps, tech-debt | experimental, público | Producción+specs leídos completos; sin ejecutar scanner externo | 2 specs leídos; global pendiente | Presupuesto reconstruido también susceptible; sampling de raíces fijas; no confundir heurística con scanner | coverage.json, lectura de servicios | Codex |
| quality | plugins/quality | Ejecutar scopes y resumir cobertura/complejidad | core, MCP SDK, zod | stable, público | Producción+specs leídos completos; resúmenes de cobertura y validate ejercitados | 11 specs leídos; global pendiente | N5: cobertura falsa; N6: validate corrupto produce éxito | new-repros-2.json | Codex |

Componentes asignados aún pendientes de lectura completa en este checkpoint: agent-orchestrator, commit-policy, project-kpis, prompt-eval, quality-policy, self-learning, adaptive-optimizer, auto-agent-selector, orchestrator-runner, proposals. No tienen nota nueva de cierre. Sus inventarios y archivos pendientes están explicitados en coverage.json.

## Fichas de seis dimensiones — notas provisionales /10

Todas las notas son provisionales hasta integrar la suite global y contrastes. Evalúan únicamente el componente leído, no una media sobre áreas desconocidas.

| Componente | Funcionalidad | Contratos MCP | Seguridad y aislamiento | Calidad | Economía de tokens | Producto | Media provisional |
|---|---:|---:|---:|---:|---:|---:|---:|
| audit-orchestrator | 4 | 7 | 8 | 5 | 7 | 4 | 5,8 |
| completion | 7 | 8 | 4 | 7 | 7 | 7 | 6,7 |
| context-for-change | 5 | 8 | 7 | 6 | 3 | 5 | 5,7 |
| impact-analysis | 5 | 8 | 8 | 6 | 3 | 5 | 5,8 |
| project-health | 7 | 8 | 8 | 6 | 5 | 6 | 6,7 |
| quality | 5 | 7 | 7 | 6 | 7 | 6 | 6,3 |

audit-orchestrator: el plan y dry-run son claros, el host se declara ausente cuando no puede despachar y existe contención física de lectura. El parser propio admite sólo un subconjunto de YAML/Markdown y puede derivar cero trabajo sin error. Las schemas de resultados existen; no se hizo host MCP real de dispatch. El timeout cero inyectado a sus planes y su selección de dispatcher lineal requieren revisión conjunta con agent-orchestrator pendiente.

completion: el flujo normal tiene persistencia atómica por taskId, hash para evitar colisiones de sanitizado y redacción de summary/evidence. La guardia de upsert y la de registro están cubiertas por specs. Faltan garantías equivalentes en lectura y borrado después de variar el filesystem. Los outputs tienen schema y los fallos de logging son best effort explícitos. El almacén no prueba revisión externa: conserva la declaración del agente, como documenta el producto.

context-for-change: reutiliza superficies públicas, limita fuentes y previews y rechaza escapes de entradas mediante SafeWorkspaceReader. Degrada memoria no configurada con explicación. Las búsquedas no abarcan src/tests de un proyecto normal y el cálculo de bytes no mide el objeto reconstruido. Los tests comprueban el número devuelto, no la serialización del resultado; de ahí la nota de economía.

impact-analysis: APIs y validación de rutas claras, tests de escape reales, resultados lexicales descritos como heurísticos. Las raíces y los package scopes están codificados al layout del monorepo; ausencia de búsqueda no equivale a bajo riesgo. El fallback de presupuesto devuelve el objeto demasiado grande conservando una cifra de otro objeto. El ejemplo multiarchivo y las pruebas actuales se limitan al layout propio.

project-health: explica bien que no corre scanners pesados, y los tests comprueban que siguen lazy. Las heurísticas de presencia de lock/config se presentan como señales, no auditoría de vulnerabilidades. El muestreo usa raíces fijas y una lista amplia de extensiones; lee contenido completo antes de cortar a 20.000 caracteres, por lo que límite de preview no es límite de I/O. El finalizador reconstruye payloads después de calcular bytes; riesgo estático, sin reproducción específica añadida. Permanece read-only.

quality: runner con procesos en grupo, timeout, cancelación y guardia de comandos antes de ejecutar; scopes con precedencia clara e inyección para tests. MCP compacto reduce peso pero da tipos poco específicos para cuatro herramientas. Existe duplicación entre wrapper de run_quality en index y builder público, con diferencia de mode/logging; no se elevó sin probar la ruta completa. Los resúmenes de cobertura/validate pueden informar éxito cuando los datos lo contradicen (N5/N6). Los specs reales del runner prueban timeout/cancelación, aquí se leyeron y su ejecución global corresponde al root.

## Hallazgos nuevos reproducidos

Ubicaciones y snippets siguientes pertenecen al SHA de cabecera. Cada archivo tiene SHA-256 íntegro en coverage.json. Todos quedan abiertos, sin cambio de producto. Ninguna prueba leyó secretos, perfiles reales ni proveedor; todo fue fixture en `/tmp`.

### N1 — P2: el lector de planes omite children, slices y archivos por su formato

Ubicación: `plugins/audit-orchestrator/src/lib/plan-reader.ts:14`, `:50`, `:86`.

```typescript
if (!line.startsWith('        - id:')) continue;
const SLICE_HEADING_RE = /^###\s+(\S+)\s+[—-]\s+(?:Fix|Implement|Task):(.*)$/u;
const match = FILE_RE.exec(line);
```

Esperado: derivar todo el trabajo de un plan válido o rechazarlo con diagnóstico de formato. Actual (`new-repros.json`): YAML válido con dos espacios en contains/proposals devuelve children=[] y tasks=[]; heading normal `### S1 — Repair boundary` devuelve slices=[] y tasks=[]; con prefijo Fix reconocido y Files con dos backticks en la misma línea, sólo conserva src/a.ts. Se ejercitó el parser propio, no dispatch real. No se afirma que el generador siempre emita esos formatos: la incompatibilidad es frente a planes válidos/estilo general que su README anuncia leer. Impacto: no-op de ejecución y scope incompleto. Causa: parser por indentación exacta y regex parcial; la derivación no comprueba que haya tareas. Remedio: reutilizar parser canónico y parse YAML real; rechazar plan vacío no intencional; recoger todos los archivos sólo dentro del bloque Files. Regresión: variantes válidas de indentación, heading canónico y dos archivos por línea. Confianza alta para los casos medidos.

### N2 — P2: list/remove pueden operar fuera del workspace si cambia el directorio después de registrarlo

Ubicación: `plugins/completion/src/lib/completion-store.service.ts:124` (reader enraizado en recordsDir), `:160` (remove). Upsert sí comprueba containmentRoot.

```typescript
const reader = new SafeWorkspaceReader(recordsDir);
// remove:
const path = recordPath(recordsDir, taskId);
await rm(path);
```

Reproducción `completion-post-register-directory-swap` en `new-repros.json`: crear almacén con root de workspace explícito, cambiar records por symlink a un directorio externo también temporal; list devuelve el registro sintético externo, remove devuelve true y el archivo externo deja de existir. Esperado: rechazar cualquier operación cuya ruta física se haya movido fuera del root autorizado. Condición necesaria: otro actor puede sustituir el directorio después del control de registro; no se afirma escape mediante taskId normal ni que toda llamada sea vulnerable. Impacto: confidencialidad de registros externos con el formato esperado y borrado de un archivo externo con el nombre derivado del taskId. Causa: la raíz de confianza de lectura pasa a ser el directorio mutable; borrado sin control de punto de uso. Remedio: usar containmentRoot estable en list/remove y resolver físicamente inmediatamente antes de leer/borrar. Regresión: swap post-registro y symlink de directorio para las tres operaciones; upsert permanece negativo. Confianza alta.

### N3 — P2: contexto e impacto no descubren dependientes/tests en layout src/tests

Ubicaciones: `plugins/context-for-change/src/lib/services/context-for-change.service.ts:119` y `:156`; `plugins/impact-analysis/src/lib/contracts/constants/impact-analysis.constant.ts:28` y consumidores de búsqueda en `impact-analysis.service.ts`.

```typescript
roots: ['packages', 'plugins', 'apps', 'tools', 'extensions']
```

Reproducción standalone en `new-repros-2.json`: workspace sólo con src/foo.ts, src/bar.ts que importa foo y tests/foo.spec.ts que importa/prueba foo. Se llama a ambas herramientas por su handler público con files:['src/foo.ts']. Actual: impacto extrae foo pero dependents=[], affectedPackages=[], recommendedTests=[], risk='low'; contexto dice que no hay referencias ni tests. Esperado: incluir src/bar.ts y tests/foo.spec.ts o informar explícitamente que no se pudo cubrir el layout. Impacto: selección de validación incompleta para proyectos adoptantes. Causa: lista de carpetas propia del monorepo y clasificación de paquetes rígida; se descarta el diagnóstico de raíces ausentes de búsqueda. Remedio: raíces de workspace configuradas/descubiertas y resultado unknown/partial cuando ninguna existe; no inventar low. Regresión: fixture src/tests y monorepo. Confianza alta.

### N4 — P2: el resultado reconstruido después de truncar excede el presupuesto declarado

Ubicaciones: `plugins/context-for-change/src/lib/services/context-for-change-format.service.ts:59`; `plugins/impact-analysis/src/lib/services/impact-analysis-format.service.ts:40`.

```typescript
const fallback = truncateIfTooLarge(minimal, maxBytes);
return decorate(minimal, fallback.finalBytes, true);
```

En impacto se devuelve minimal, no fallback.value. En contexto se arma otro objeto con files completos y preview y se copia truncation.finalBytes de antes de esa reconstrucción. Medido: contexto reporta 180 bytes pero serializa 1.169 bytes; impacto con presupuesto 200 reporta 130 pero serializa 4.161 bytes (`new-repros*.json`). Estos casos prueban los finalizadores directamente con entradas válidas de su contrato; el segundo corresponde a símbolos/paths largos que el input MCP no limita. No se cuentan dos veces text+structuredContent: las cifras ya fallan midiendo un único JSON de salida. Impacto: presupuesto incumplido y telemetría que oculta el exceso. Remedio: decorar antes de medir, acotar también longitud de strings/lista de files y validar el objeto final; error explícito cuando el schema mínimo no cabe. Regresión: Buffer.byteLength(JSON.stringify(resultado)) <= presupuesto, no comparar sólo resultado.bytes. Confianza alta. project-health presenta un patrón equivalente leído, pero no se cuantificó aquí y no se suma como reproducción.

### N5 — P2: cobertura mezcla los mismos números de línea de archivos distintos

Ubicación: `plugins/quality/src/lib/tools/coverage.ts:50` y `:56`.

```typescript
for (const entry of Object.values(coverageMap)) {
    const key = String(line);
    totalLines.add(key);
    if ((entry.s?.[statementId] ?? 0) > 0) coveredLines.add(key);
}
```

Fixture: dos archivos, ambos con statement en línea 1; sólo uno ejecutado. Esperado 1/2=50%. Actual 1/1=100% (`coverage-file-identity-collision`, new-repros-2.json). El spec actual sólo tiene un archivo y no detecta la colisión. Impacto: métrica pública sobreestima cobertura y subcuenta líneas; no se afirma que este resumen sea la fuente del gate global sin trazarlo. Causa: Set global por line sin identidad del archivo. Remedio: iterar entries y clave file+line, validación Istanbul de entrada. Regresión: dos archivos con mismo número y distintas visitas. Confianza alta.

### N6 — P2: datos corruptos de validate/cobertura se convierten en resultado limpio

Ubicaciones: `plugins/quality/src/index.ts:121` y `:138`; `plugins/quality/src/lib/tools/coverage.ts:39` y `:24`.

```typescript
catch { return {}; } // parseValidateOutputSnapshot
const findings = (snapshot.findings ?? []).filter(...);
return { ok: findings.length === 0, ... };
```

Reproducción (`new-repros-2.json`): validateOutputReader devuelve '{broken'; runQualityFromValidateOutput devuelve ok:true, worst:'none', severidades cero y findings vacío. El parser de cobertura ante '{broken' devuelve total 0 y pct 100 para las métricas. Esperado: resultado unknown/error, nunca datos de una validación aprobada. La ruta de validate requiere lector inyectado; esta prueba usa esa costura, no afirma que todo host la exponga. Impacto: silencio operativo frente a evidencia ilegible. Remedio: schema y unión de resultado con unavailable/corrupt; conservar causa. Regresión: malformado/array/schema incorrecto produce error diagnóstico y no ok:true. Confianza alta en la costura medida; configuración de inyección del host aún debe trazarse.

## Comandos y evidencia de ejecución añadida

```text
timeout 30s bun --tsconfig-override /tmp/delendai-audit-20261019-L2whP7/tsconfig.json /tmp/delendai-audit-completion-coordination/new-repros.ts
timeout 30s bun --tsconfig-override /tmp/delendai-audit-20261019-L2whP7/tsconfig.json /tmp/delendai-audit-completion-coordination/new-repros-2.ts
```

Ambos finalizaron exit 0. Se conservan fuentes, JSON y logs; fixtures preservados y con rutas externas también dentro de /tmp. Repetir necesita directorios nuevos para el caso de rename/symlink. Bun repite el diagnóstico interno de tsconfig de la primera tanda; los resultados y exit code se conservaron, no se atribuye al producto.

## Checkpoint para continuar

Siguiente lote recomendado: prompt-eval, self-learning, adaptive-optimizer y quality-policy; luego agent-orchestrator/project-kpis; commit-policy, selector, runner y proposals requieren varias ventanas por su volumen. Usar coverage.json para elegir sólo los pendientes; `read_batch.py <componente> <bytes>` imprime un lote completo. Conservar primera tanda y no repetirla. El inventario es grande: proposals tiene 377 archivos de producción y 293 specs; commit-policy, 94+78; el conjunto asignado suma varios MB. Esta ampliación no está completa y no debe incorporarse al informe global como lectura exhaustiva de esos diez pendientes.

## Lote 2 cerrado: evaluación, aprendizaje, optimización y política

Se completó la lectura íntegra de producción, manifiesto, entry, contratos y todos los specs de prompt-eval, self-learning, adaptive-optimizer y quality-policy. En prompt-eval y adaptive-optimizer hay specs colocados dentro de src: coverage.json conserva identidad única por ruta y no cuenta dos veces esos archivos. A partir de la indicación posterior del coordinador, este lote se fundamenta sólo en lectura estática y specs existentes; no añade experimentos de seguridad ni suites. El siguiente paso continúa automáticamente con los seis componentes restantes.

| ID | Ruta | Función | Dependencias | Estado declarado | Estado verificado | Tests | Riesgos | Evidencias | Auditor |
|---|---|---|---|---|---|---|---|---|---|
| prompt-eval | plugins/prompt-eval | Harness por proveedor, score y calibración | core, selector, runner, MCP SDK, zod | stable, público | Lectura completa; scorer puro; entry de ejecución rehúsa siempre por falta de runtime | 6 specs completos; global root | Feature incompleta expresamente documentada; semántica winner difiere entre harness y report al agregar múltiples intentos | coverage.json, index.ts, score.ts y specs | Codex |
| self-learning | plugins/self-learning | Acumular observaciones y derivar lecciones | core, MCP SDK, zod | experimental, opt-in, sin presets | Lectura completa; store, collector y ambas herramientas trazadas | 5 specs completos; global root | N7 persistencia sin mutex en ruta real; N8 lecciones antiguas mantienen confianza alta | coverage.json, observation-store.service.ts, observations.tool.ts, confidence.helper.ts | Codex |
| adaptive-optimizer | plugins/adaptive-optimizer | Ranking heurístico de candidatos y rutas de propuestas | core, selector de agentes/plugins, perf, prompt-eval, proposals, usage-tracking | experimental, público | Lectura completa; no ejecuta harness/profiler; descubre disponibilidad sólo | 5 specs completos, incluido1en src; global root | N9 maxBytes configurado ignorado en fachada; presupuesto sólo validado/eco; datos inferidos no son experimentos | coverage.json, services y tools | Codex |
| quality-policy | plugins/quality-policy | Resumen de política, evidencias y settlement | core, quality, rules, test-policy, test-convention, conventions | experimental, público | Lectura completa; summary puro y runner settlement separados; entry registra ambos | 5 specs completos; global root | N10 resolución tsconfig dependiente del cwd; settlement no vincula el árbol validado a SHA antes/después; dedupe en vuelo sólo por instancia | coverage.json y servicios/entry | Codex |

| Componente | Funcionalidad | Contratos MCP | Seguridad y aislamiento | Calidad | Economía de tokens | Producto | Media provisional |
|---|---:|---:|---:|---:|---:|---:|---:|
| prompt-eval | 4 | 8 | 8 | 7 | 6 | 4 | 6,2 |
| self-learning | 6 | 7 | 7 | 6 | 6 | 6 | 6,3 |
| adaptive-optimizer | 6 | 8 | 7 | 7 | 4 | 5 | 6,2 |
| quality-policy | 6 | 7 | 7 | 7 | 5 | 6 | 6,3 |

prompt-eval: el runtime de proveedores no está conectado y su entry entrega unwired:true; el error explícito y el README evitan resultados falsos de spend-denied. El manifiesto stable por tanto no significa que su función central de ejecución esté disponible. Las costuras puras sí validan costes negativos/no finitos, guardia por proveedor y mínimo de muestras para calibración. La descripción de report promete cheapest passing pero el scorer elige máximo compositeScore=winRate*100-coste acumulado, distinto a la ordenación coste/tier del harness cuando se agregan múltiples intentos. Esa diferencia está confirmada por lectura y no se atribuye gasto real. Las respuestas de report duplican tabla y rows y no hay límite de tamaño de lista de intentos; la nota de tokens no presume ahorro medido.

self-learning: opt-in y ningún preset, observaciones limitadas en cantidad, evidencia de lecciones sólo contada en salida y deduplicación de hechos por identidad. El colector descarta mensajes/diffs/stacks y valida timestamps. La lectura puede degradar errores como vacío; no se hizo nueva prueba de permisos. El write es atómico pero falta la sección crítica de RMW; la cadena del tool real está trazada, sin confundir un helper con un mutex exterior. Las lecciones de tests sólo reciben fallos desde el colector actual y no éxitos por test, de modo que no deben interpretarse como tasas comparables de flakiness normalizadas.

adaptive-optimizer: scorer puro y determinista, componentes de score separados, señales override validadas, métricas con hasSamples explícito y sin transformar ausencia en cero. Los tests sí comparan score y penalizaciones; el test de fachada preserva deliberadamente toda la superficie aunque el maxBytes por configuración sea2000. Budget sólo debe leerse como dato declarado de planificación: no existe experimento ni reserva económica que pueda consumirlo; la implementación usa un dial constante7 y no el presupuesto para ranking. Presencia de funciones opcionales aumenta la confianza heurística aunque no se ejecuten, y languages siempre es typescript incluso con pack generic. Estas limitaciones son de calidad/producto, no prueba de gasto no autorizado.

quality-policy: evidencia por hashes con longitud prefijada y pass-only reuse; errores JSON se convierten en no-evidencia y obligan reejecución, una distinción correcta frente a N6. Coordenador registra el trabajo antes de await y comparte promesa por key en una misma instancia; esos tests son de concurrencia intraproceso, no dos servidores independientes. Scope fuerza full para fronteras duras y grafos truncados. La política de tipos pierde herencia al no resolver relativo al workspace estable. Settlement sí declara spawn y dryRun, pero se registra incondicionalmente al cargar el plugin, aunque comentarios/README lo llamen opcional/policy-only. La captura green obtiene HEAD después de validar, sin comparar SHA/dirty tree previo; sólo puede considerarse un resultado del comando, no demostración de que ese HEAD completo fuese lo probado. No se ejecutó este runner de nuevo.

### N7 — P2, estático: actualización de observaciones sin mutex en la ruta pública

Archivos: `plugins/self-learning/src/lib/store/observation-store.service.ts` (appendObservations) y `plugins/self-learning/src/lib/tools/observations.tool.ts` (handler collect). SHA individuales en coverage.json.

```typescript
const existing = await readObservations(options);
// deduplica/combina/compacta
await writeFileAtomic(options.filePath, kept.length > 0 ? `${kept.map(serialise).join('\n')}\n` : '');
```

La herramienta llama directamente appendObservations después de recoger el journal. La entry sólo construye sus options; el store no importa withFileMutex. No se localizó consumidor de producción adicional que envuelva ese camino: la búsqueda específica está registrada en el transcript. Dos colectores con snapshots distintos pueden leer el mismo prefijo y el último rename perder la actualización del otro, aunque cada JSONL individual sea íntegro. Esperado: sección crítica sobre lectura, dedupe, compactación y escritura. Remedio: mutex por store dentro del boundary de persistencia; regresión de dos procesos con incoming disjuntos y journal en movimiento. Confianza alta en la ruta leída, sin reproducción añadida por la indicación del coordinador.

### N8 — P2, estático: seis observaciones antiguas aún producen confianza alta sin soporte reciente

Ubicación: `plugins/self-learning/src/lib/lessons/confidence.helper.ts`, scoreConfidence y bandOf; derive-lessons.helper.ts no elimina lecciones antiguas.

```typescript
const score = round2(agreement * (0.4 + 0.3 * volume + 0.3 * recency));
// high si score >= 0.7
```

Con support=6, counterExamples=0 y recentSupport=0, la fórmula da0,7/high; no cambia a medida que envejece más el dato. Contradice el comentario que afirma que una historia sin soporte reciente scores low y que las lecciones caducan con la ventana14d. El spec stale de6muestras sólo exige que baje frente a fresh, mientras que el de band usa4y no toca el umbral. Esperado: ninguna lección sin soporte reciente se siga presentando como alta confianza actual, o documentar explícitamente que se conserva evidencia histórica alta. Remedio: decaimiento que pueda bajar del umbral y tests de borde6/60muestras antiguas. Confianza alta, deducción aritmética del código, sin nueva ejecución.

### N9 — P2, estático: la fachada adaptativa ignora maxBytes configurado

Ubicación: `plugins/adaptive-optimizer/src/lib/tools/adaptive-facade.tool.ts`, runAdaptiveFacade; buildAdaptiveOptimizerToolRegistrations sí le pasa options.maxBytes.

```typescript
export const runAdaptiveFacade = async (args, _options) => {
  // ...
  return toolJson(buildAdaptiveFacadePayload(parsed.data, { maxBytes: parsed.data.maxBytes }));
};
```

Sin maxBytes en la llamada, el finalizador devuelve la superficie detallada completa y truncated:false aunque la configuración del plugin imponga2000. El spec lo afirma expresamente: only when caller provides explicit byte budget; es una conducta probada por suite existente, no un resultado medido ahora. Además el fallback con presupuesto explícito conserva cuatro entradas sin usar truncate.value, patrón de N4. Esperado: límite configurado efectivo salvo override explícito permitido; metadatos de bytes del objeto real. Remedio: combinar arg y option y aplicar el budget al envelope final. Regresión: tool a través de la entry con maxBytes configurado, argumento omitido; medir JSON real. Confianza alta.

### N10 — P2, estático: la herencia de tsconfig se resuelve contra cwd implícito

Ubicación: `plugins/quality-policy/src/lib/services/quality-policy-types.service.ts`, resolveTsConfigFlags.

```typescript
relative(dirname(normalizedRel), resolve(dirname(absolutePath), parentRef))
```

El primer argumento de relative es relativo y Node lo resuelve contra process.cwd(), mientras el segundo proviene del workspace inyectado. Con host cwd distinto del workspace, el parent resulta una ruta con escapes y SafeWorkspaceReader no lo lee; la política puede devolver unknown strictness o exactOptionalPropertyTypes=false en el resumen pese a que el base lo activa. Con extends anidado la base también puede quedar mal relativa al root. Se leyó el spec de tool que crea un base strict:true pero sólo verifica que summary no está vacío, sin afirmar los flags heredados. Remedio: relative(workspaceRootAbs, resolve(dirname(absolutePath), parentRef)), parser de tsconfig compatible con JSONC y rechazo/diagnóstico explícito de padres no leídos. Regresión: cwd ajeno, extends anidado y los cuatro flags heredados. Confianza alta sobre semántica de path, sin nueva ejecución añadida.

Pendientes reales después del lote2: agent-orchestrator, project-kpis, commit-policy, auto-agent-selector, orchestrator-runner y proposals. Se continúa sin requerir otra orden.

## Lote3: project-kpis

Lectura completa de producción, entry, contratos, metadatos y siete specs. El fichero tool de45463bytes excedió el primer presupuesto de salida; el tramo central590–1100se releyó íntegro por segmentos, recuperando el contenido omitido. No se han ejecutado suites ni nuevas pruebas de seguridad. Resultado estático provisional, pendiente del resultado global del coordinador.

| ID | Ruta | Función | Dependencias | Estado declarado | Estado verificado | Tests | Riesgos | Evidencias | Auditor |
|---|---|---|---|---|---|---|---|---|---|
| project-kpis | plugins/project-kpis | Vistas agregadas, histórico, tendencias y economía | core, project-health, usage-tracking, MCP SDK, zod | experimental, lectura/escritura, dogfood | Producción y specs leídos completos; persistencia con mutex exterior trazada |7specs leídos, incluido e2e y schema wire; ejecución global root |N11doble conteo de tokens; N12ventanas/filtros incoherentes; N4presupuesto no efectivo en fallback |coverage.json, tool.ts, servicios y specs |Codex |

| Componente | Funcionalidad | Contratos MCP | Seguridad y aislamiento | Calidad | Economía de tokens | Producto | Media provisional |
|---|---:|---:|---:|---:|---:|---:|---:|
| project-kpis |6|8|7|6|5|6|6,3|

Fortalezas: contratos versionados y estados measured/estimated/unavailable/not-configured; histórico distingue subscription/provider-reported/configured-estimate; persistKpiSnapshotHistory envuelve lectura, retención y escritura atómica en el mismo mutex exterior. No se atribuye a ese helper una carrera sin considerar el caller. Hay tests de retención real, carga por entry, dos esquemas y tools/list: el spec del envelope mide un techo3200bytes frente al anterior8518, cifras declaradas por el test y pendientes de ejecución global, no medición nueva. El envelope ligero mantiene contrato completo separado y tests de compatibilidad con summary/audit/models. La función principal no invoca proveedores.

Límites adicionales: fitToBudget retorna raw íntegro si ninguno de sus tres candidatos cabe, aunque bytes refleje el resultado de truncateIfTooLarge; mismo patrón estático N4. Hay lectura duplicada de invocaciones al construir estado y snapshot. Los servicios internos audit-report y efficiency-analysis están probados unitariamente pero no llamados por la herramienta ni exportados por public: no se confunde su capacidad con función disponible al usuario. En efficiency-analysis, un baseline configurado con costes desconocidos se resta de una suma que sustituye null por0, pudiendo presentar todo el baseline como ahorro inferred; alcance de servicio interno, no resultado actual de la fachada MCP. Los errores de lectura del histórico y la validación parcial de entries merecen regresiones de corrupción; no se realizaron nuevas pruebas por indicación del coordinador. No se leen archivos secretos: el test existente que escribe una cadena ficticia sólo acredita que no busca ese archivo, no la sanitización exhaustiva de cada mensaje de telemetría.

### N11 — P2, estático: los breakdowns suman outputTokens sobre totalTokens

Ubicación: plugins/project-kpis/src/lib/tools/project-kpis.tool.ts, aggregateRecords, suma totalTokens (SHA9f83d94904dd67006a4cdf965da3b818aa017edccf66be146af622039c19d1b3; líneas en coverage/transcript).

La fórmula es `(tokenCount ?? usage.totalTokens ?? usage.inputTokens ??0)+(usage.outputTokens??0)`. Un registro perfectamente válido con input50/output25/total75 aporta100al breakdown, mientras el snapshot usa el agregador de usage-tracking y aporta75. El fixture del spec tool ya contiene esos valores, pero sus aserciones sólo miran calls y key. Esperado: usar totalTokens o tokenCount íntegros; sumar input+output sólo si no hay total. Impacto: atribución inflada por modelo/plugin/agent y contradicción con highlights; afecta decisiones de coste. Remedio: un helper compartido de normalización; regresión que contraste totalTokens de breakdowns y snapshot sobre datos completos, parciales y tokenCount. Confianza alta por aritmética estática; no se añadió ejecución.

### N12 — P2, estático: una ventana pedida puede devolver datos ajenos como medidos

Ubicación: mismo tool, normalizeQuery/loadState/buildBreakdowns/findingsOf. SHA en N11.

filterRecords aplica from/to y filtros a breakdowns e issues, pero loadState pasa al snapshot sólo windowDays y now: una consulta histórica from/to muestra highlights del periodo relativo a hoy. Además, si la ventana o filtro no encuentra ninguna invocación, buildBreakdowns cae al resumen persistido completo; sin filter marca measured sin aviso aunque el from/to sea ajeno. Con filter avisa partial pero devuelve igualmente cifras de otros registros. findingsOf busca incongruencias sobre state.records completo y afirma que ocurrieron entre query.from y query.to. Esperado: todas las secciones compartan registros/ventana; ausencia de coincidencias no debe convertirse en cifras de otra ventana sin estado/aviso explícitos. Remedio: filtrar una vez, construir snapshot de la misma consulta y restringir fallback a summary compatible con ventana y dimensiones. Regresión: consulta histórica distinta de now, filtro sin coincidencias y error únicamente fuera de ventana. Confianza alta en rutas trazadas; prueba pendiente.

Quedan cinco componentes: agent-orchestrator, commit-policy, auto-agent-selector, orchestrator-runner y proposals. La lectura continúa automáticamente.

## Lote4: agent-orchestrator

Leídos íntegros los75archivos inventariados:34producción,35specs y6metadatos. No hay ejecución nueva; la revisión integra los contratos de puerto, engine, adapters, delegación, rotación, telemetría, recibos y todas las pruebas. Las notas son provisionales y no certifican hosts reales.

| ID | Ruta | Función | Dependencias | Estado declarado | Estado verificado | Tests | Riesgos | Evidencias | Auditor |
|---|---|---|---|---|---|---|---|---|---|
| agent-orchestrator | plugins/agent-orchestrator | Política de ejecución, planes, delegación y recibos |core, context-compiler, contracts, state; context-for-change opcional; SDK,zod |experimental; S1/S2done,S3swarm pendiente |lectura completa; planner y dispatcher secuencial; no proveedor ni host real |35specs leídos; resultado suite global pendiente |N13compatibilidad rebaja reglas duras; N14triple ejecución y límites; N15plan no respeta override/datos; N16handoff sin resultados previos; single sin ejecutar acción |coverage.json conSHA, archivos y líneas abajo |Codex |

| Componente | Funcionalidad | Contratos MCP | Seguridad y aislamiento | Calidad | Economía de tokens | Producto | Media provisional |
|---|---:|---:|---:|---:|---:|---:|---:|
| agent-orchestrator |4|6|6|5|3|4|4,7|

Fortalezas: ausencia de puerto se convierte en rechazo estructurado, sin fallback falso salvo opt-in explícito; configuración incorrecta no obtiene herramientas; override por modo se resuelve en engine puro. Los tests de output capturan el esquema registrado y verifican serialización Map→record, y hay integración de eventos start/end incluso en throws. Estado de tokens del orquestador explícitamente unknown evita inventar medidas. El perfil scout se delega sin edit, pero allowedTools en manifest/prompt sólo es restricción efectiva si host la impone; no se verificó enforcement de un host real. El store de contexto se inicializa perezosamente, refs por hash y extracto de salida280caracteres reducen lectura del orquestador. El catálogo de herramientas y los comentarios README/S1están atrasados: también registra classify/events/plan_ref; execution-policy tiene implementación y spec pero no lo importa/registra la entry ni lo exporta public.

Límites funcionales/producto: swarm se ejecuta con LinearDispatcher y su join se trata como spawn implementer, coherente con S3pendiente pero incapaz de cumplir una promesa de paralelismo real. single retorna ok:true sin invocar ninguna acción del host; sólo incrementa contador y devuelve result:null, mientras verify se marca executed:false. Esa salida significa planificación/contabilidad, no evidencia de que el trabajo descrito sucedió. El presupuesto del orquestador no se conecta a contador en la entry y es unknown; el maxTokens anunciado no se puede asegurar de ahí. Las nuevas funciones progress-evidence/recovery-ladder no están conectadas al dispatcher: sus35tests no prueban que un run real siga la escalera. El recibo sólo se cierra después de dispatcher y keepOutput; si esos pasos arrojan no se usa abandonReceipt ni se persiste receipt, por tanto no existe corpus completo de crashes pese al contrato aspiracional. El cache de outcomes no tiene expulsión ni persistencia en esta entry y crece por taskId. Los recibos de delegación guardados en_meta son sólo el último resultado por step: el budget suma todas las iteraciones, de modo que esas dos superficies no tienen la misma población. No se alegan pérdidas de dinero observadas.

### N13 — P2, estático: el routing de compatibilidad anula reglas declaradas duras

Ubicación: plugins/agent-orchestrator/src/lib/classifier/task-classifier.ts:120,143,208; SHA45057bb74138643605f37d2a6b47b19f133dbbc8bba862a7af04339911746379. classifyObservedTask puede devolver proposal por persistentFormatMigration/publicContractDiagram/securityBoundary, pero withLegacyRouting aplicado después sustituye ceremony por direct para hint small/trivial, o light-plan para medium/refactor/descripción larga. Conserva overrides y reasons que dicen que la regla dura forzó proposal, aunque el resultado diga direct/light-plan; su confidence incluso sube. Esperado: compatibilidad no debilita una hard override ya decidida. Impacto: consumidor recibe contexto/validación y quorum menores de lo requerido por su política. Los specs duros prueban classifyCeremony aislado y los de compatibilidad sólo casos sin conflicto. Remedio: resolver precedencias en una sola función y preservar hard overrides; regresión combinatoria hint/tag con persistentFormatMigration:true. Confianza alta por lectura, sin prueba nueva de seguridad.

### N14 — P2, estático y tests existentes: una ejecución limpia exige tres spawns y no respeta el límite antes de seguir

Ubicación: plugins/agent-orchestrator/src/lib/dispatch/linear-dispatcher.ts:197–279; SHA29c600c27476963c11612c8a1f8685430ad71ff24566389f5fc0745ba11eacb9. Tras cada resultado limpio hace continue hasta ingestionCount3. Un plan scout+implementer llama seis veces al host incluso si las primeras respuestas ya son limpias; el spec clean3-step lo afirma y telemetry espera6start/end. Con maxIterations1o2válidos por schema, nunca se fija ok:true y la misma tarea limpia siempre falla. Cada llamada recibe el cap completo y no se comprueba agotamiento antes del siguiente intento; tras gastar el cap en la primera llamada se hacen otras dos antes de evaluar detector. Timeout es Promise.race por intento sin cancelación del puerto; un timeout permite iniciar otra instancia mientras la primera sigue viva, y no constituye el hard wall-clock de tarea documentado. Esperado: terminar al primer éxito terminal, observar progreso durante la ejecución; comprobar saldo antes de cada spawn, pasar remanente y cancelar/join antes de reintentar. Regresión: counters exactos con clean1, maxIterations1/2, primer consumo=cap y puerto lento cancelable. Confianza alta; las6llamadas son expectativa del spec, no medida nueva de proveedor.

### N15 — P2, estático y spec: plan acepta datos que descarta y el override sólo cambia etiqueta

Ubicación: plugins/agent-orchestrator/src/lib/tools/plan.tool.ts:75–95; SHAc1f51a99b48a78a5758b759ec9bc40fddeb9117a4dab75b52c879ecced367835. Schema admite files/facts, pero la llamada engine.plan sólo copia id/description/tags/hint. Luego override cambia mode/rationale, conservando steps,budget,rotation del modo anterior. Así un plan naturalsingle con override linear sigue teniendo orchestrate/verify y presupuesto single, aunque dispatch sí llama engine.plan(task,override)y genera scout/implementer. El spec se titula y exige re-labels en vez de comprobar comportamiento. classify tool también descarta files/facts y construye política sintética sin delegationMode, por lo que no explica la decisión del dispatch configurado. Esperado: mismo objeto/task/política en plan,classify,dispatch y replanificación real del override. Remedio: compartir normalización y engine efectivo; regresión de paridad pasos/budgets con perMode distintos y facts que fuerzan un modo. Confianza alta.

### N16 — P2, estático: la dependencia scout→implementer no transporta el resultado del scout ni el objetivo original

Ubicación: plugins/agent-orchestrator/src/lib/policy/modes/linear-mode.ts:53; dispatch/linear-dispatcher.ts:206–220; dispatch/delegation-manifest.service.ts:165. SHA en ledger. El implementer recibe sólo instruction='Apply the change guided by the scout.' y task.objective igual a esa frase; ni el puerto ni la delegación incluyen outcomes previos, sus refs o task.description. dependsOn sólo decide saltos. Con tarea sin files/acceptance, la segunda fase no recibe qué cambio aplicar ni qué descubrió el scout. Con files sí recibe su texto, pero tampoco el objetivo ni la conclusión anterior. Esperado: cada subtask posee objetivo concreto y artefactos de dependencias, sin arrastrar conversación entera. Remedio: compilar refs del resultado aceptado y objetivo original en el manifest por step. Regresión: puerto fake capture el segundo request y resuelva el ref del hallazgo del scout con el objetivo solicitado. Confianza alta sobre interfaz y producer completos; un host que añada contexto externo podría suplirlo, pero no forma parte del contrato leído.

Limitación adicional de configuración de tokens: index.ts:228fija inputBudget desde defaults, antes de resolver perMode;0documentado unlimited se trata en delegation-manifest:161como presupuesto estricto cero. Con override por modo menor también se delega contexto bajo el default superior. Es una discrepancia estática del límite de entrada y merece regresión de0y override, sin invocar proveedores.

Quedan cuatro componentes pendientes de lectura completa: auto-agent-selector, orchestrator-runner, commit-policy y proposals. Las conclusiones de primera fase sobre ellos no equivalen a cubrir sus archivos no leídos.

## Lote5: auto-agent-selector

Leídos íntegros57archivos:33producción,18specs y6metadatos. Este lote no ejecuta discovery real, instaladores, APIs, cuentas ni suites. El roster y secretos ficticios de los specs sólo se leen como fuente.

| ID | Ruta | Función | Dependencias | Estado declarado | Estado verificado | Tests | Riesgos | Evidencias | Auditor |
|---|---|---|---|---|---|---|---|---|---|
| auto-agent-selector |plugins/auto-agent-selector |discovery, ranking asesor, escalera, calibración, módulos de economía |core,SDK,zod |stable,zero-config,advisory |lectura completa; entry no ejecuta proveedores; instalador opt-in; ejecución real sólo seam inyectado |18specs leídos, global root |N17calibración omitida en run; N18handoff perdido y falsos failures; gates económicos no conectados al routing MCP |coverage.json,SHA individuales, rutas abajo |Codex |

| Componente | Funcionalidad | Contratos MCP | Seguridad y aislamiento | Calidad | Economía de tokens | Producto | Media provisional |
|---|---:|---:|---:|---:|---:|---:|---:|
| auto-agent-selector |6|7|7|7|6|6|6,5|

Fortalezas: ranking puro, pin explícito precede al configurado y dial se limita; calibración exige5muestras y bonus acotado. Discovery usa argv con shell sin perfiles y timeout3s, la env sale sólo como nombres, sin persistir claves; snapshot y calibración usan mutex exterior+atomic write. Se comprueba el RMW completo de calibración, no se le atribuye N7por similitud de nombres. Instalación sólo para ID conocido y argv inmutable tras install:true+ID; no interpola texto usuario. La escalera respeta ceiling de tier y profundidad, se detiene al primer acceptance pass y sus specs cubren throw/gate failure. Estos ceilings son ordinales, no dinero ni calidad medida. Estado encontrado en PATH/env es disponibilidad potencial, no prueba de login/permisos/alcance del modelo; denominación reachable exagera esa garantía.

Producto/calidad: los módulos route-identity/eligibility-gates/economic-preference modelan cuentas, billing y reservas separadas de calidad y tienen buenos tests puros, pero no los usa ninguna herramienta de este plugin. Su entry y discoverRankedProviders sólo conocen vendor/source/reach/costTier; no hay capacidad, salud, política por cuenta ni cuotas en IProviderCandidate. Esa implementación nueva NO puede contarse como garantía efectiva de routing público; sí como biblioteca estática aislada. No se reclama bypass de gasto: las herramientas registradas son asesoras y la ejecución real no está conectada por defecto. explainSelection cuenta alreadyPaid/billed con marginalCost==0/>0 en vez de spendsMoney: unknown/metered con marginal0se etiqueta paid-for en métricas aunque el módulo de gating lo trate billed; alcance helper. El ranking describe monotonicidad que el bonus puede invertir en dial6/7entre tiers vecinos, así que el texto necesita acotar sin calibración o reconocer compensación. La calibración usa todo el historial sin caducidad/modelVersion; una API puede cambiar modelo por defecto manteniendo tasa antigua, riesgo de producto, sin afirmar regresión del proveedor.

Economía de tokens: máximo13candidatos del catálogo hace razonable el output usual, pero se duplican recommended/ranked y no hay maxBytes; calibración acepta providerId arbitrario y auto_evaluate puede devolver lista histórica sin límite. El store llamado append-only relee y reescribe todo JSONL en cada append (crecimiento O(n)por operación y O(n²)acumulado)sin retención; protege consistencia pero merece compactación/segmentación. Cada consulta de roster persiste snapshot pese a descripciones Read-only; un error de escritura impide recomendar aunque el discovery haya funcionado. Las options malformadas silenciosamente usan defaults en vez de mostrar diagnóstico. El status con store omitido afirma persisted:true, como su test sin store exige; producción sí inyecta store, por lo que es una inexactitud de costura programática, no pérdida probada en entry.

### N17 — P2, estático: auto_run ignora la calibración que determina auto_recommend

Ubicación: plugins/auto-agent-selector/src/index.ts:72–96; lib/tools/auto-recommend.tool.ts:98–114; lib/tools/auto-run.tool.ts:279–288; SHAs en coverage.json. Recommend lee winRateMap y pasa calibration al servicio compartido; run no acepta calibrationDir/store ni la entry se los pasa. En dial5con5éxitos del candidato tier superior y5fallos del barato, recommend escoge al de mejor winrate (su spec de scorer afirma ese resultado), mientras run construye primera etapa barata sin esa evidencia. Esperado: el plan de ejecución use la misma decisión recomendada para misma tarea/prefs, salvo restricción adicional explícita. Remedio: normalizar discovery+calibración una vez en servicio compartido y propagar taskType. Regresión: ambos handlers conectados al mismo storefake, comparar primera etapa y recomendado. Confianza alta por rutas completas; sin experimento nuevo.

### N18 — P2, estático: ejecución por defecto transforma ausencia de runtime en intentos fallidos

Ubicación: lib/tools/auto-run.tool.ts:136–155,295–305 y lib/escalate/run-with-escalation.ts:41–45. SHA8b038c0f7ba32f82da96dff1fc6dc1f30a46669e4a2a49ee4105324a03f38615. La entry no inyecta runProvider/checkAcceptance. El defaultRunProvider crea un objeto handoff, pero la escalera descarta output y defaultCheckAcceptance retorna false. execute:true+consent:true entrega execution:{ok:false,chosen:null,attempts:[todos passed:false]}, sin incluir los handoffs que dice devolver. Nunca se invocó ni comprobó aceptación de esos proveedores. Esperado: estado capability-unavailable o handoff con executed:false sin ensayar ni marcar fallos. Impacto: UX y telemetría inducen a interpretar que todos los proveedores fallaron en la tarea y no proporcionan el payload para continuar. Remedio: resolver capacidades antes de recorrer escalera y devolver handoff tipado; separar not-executed de failed. Regresión: handler construido por entry sin seams, asserts de0intentos reales y handoff accesible. Confianza alta; los tests actuales siempre inyectan ambas costuras cuando piden ejecutar.

Pendientes completos: orchestrator-runner, commit-policy y proposals. Continúa lectura por ledger automáticamente, sin repetir primera fase ni suites.

## Checkpoint lote6 runner (aún abierto)

Lectura continua por coverage.json. Ya se leyeron metadatos, entry, contratos, bootstrap, health, build-manager, manager, fallback, handoff, spend/caps/limits/token, options, quota y router/session. Faltan servicios, subprocess, tools y38specs: no hay ficha ni nota final de runner todavía. Hallazgos candidatos estáticos a contrastar con specs:

- handoff.ts API coloca Authorization con `$ENV` dentro de shellQuote/simple comilla; curl enviará el nombre literal en vez de expandir la variable, contradiciendo ready-to-run. CLI args también se unen sin shellQuote (efecto de espacios, no se prueba seguridad). SHAde64d5adb3f196668ec528e6ce1a61942d666b918d429c541f960196edbd7006.
- normalizeLimitsView de limits-store.ts trata cualquier objeto como observed:known, usando0para spend ausente/malformado ynullpara breached no reconocido. Un limitsStatus:{}no es detectado como unverifiable bajo un cap aunque el código promete lo contrario. spend-guard consulta caps sólo si observed:unknown; conocido confía en breached. SHA30ebb90714b95e22529838fda27bc17ac2454be2b8af5e2a91041426fdef3228; no ejecución nueva.
- options acepta subprocessPoolSize/concurrencyLimit; build-manager los recibe pero no los pasa al manager, que no tiene estos campos ni semáforo. Verificar demás tools/subprocess antes de afirmar límite global ineficaz.
- runOne reserva cuota y escribe running antes de invoker.start, fuera de try/finally; un throw síncrono de start deja hold hastaTTL y journal running. Espera tracing de invokers antes de clasificación.
- usageSummaryPath en entry usa cacheDir/usage-tracking mientras otros consumidores leídos emplean cacheDir/results/usage-tracking; verificar writer real por root, no asumir único layout por nombre.

Los candidatos no equivalen a nuevas reproducciones y no deben importarse como confirmados dinámicamente. La lectura sigue sin orden adicional.

## Lote6 cerrado: orchestrator-runner

Leídos íntegros110archivos:66producción,38specs y6metadatos. La suite de primera fase (38archivos,209tests) ya pasó sobre este SHA; fuente/log en /tmp/delendai-audit-evidence-concurrencia. En esta ampliación no se repite ni se añaden pruebas de seguridad. Hallazgos siguientes estáticos; la prueba real stdio existente usa servidor stub que deliberadamente no exige initialize, no acredita compatibilidad con un servidor MCP estándar ni proveedor vivo.

| ID | Ruta | Función | Dependencias | Estado declarado | Estado verificado | Tests | Riesgos | Evidencias | Auditor |
|---|---|---|---|---|---|---|---|---|---|
| orchestrator-runner |plugins/orchestrator-runner |routing,invocación CLI/API/MCP,pools,cuotas,cuentas,consentimiento,entorno |core,SDK,zod;usage-trackingharddependency;execution-envopcional |stable;READMEaseguraS4sinspend pero entryofreceS6/S7 |lectura completa;209tests previos pass; cuenta/API real no invocadas |38specs completos;209passprimera fase;globalroot |C2–C4previos;N19cancelMCPcuelga;N20límitesmalformados;N21concurrencianoenlazada;N22handoff;N23until;N24protocol/results |coverage.json+reportprimera fase+líneas abajo |Codex |

| Componente | Funcionalidad | Contratos MCP | Seguridad y aislamiento | Calidad | Economía de tokens | Producto | Media provisional |
|---|---:|---:|---:|---:|---:|---:|---:|
| orchestrator-runner |5|6|5|6|5|4|5,2|

Fortalezas: executeApi:falsepor defecto y gate deny si no hay elicitation; la entry usa el mismo signer en gate y manager, HMAC vinculado a invocation/provider/tier y comparación constante. Tests cubren identidad distinta y ejecución MCP bloqueada antes de spawn, no sólo API/CLI. El hard dependsOn de usage-tracking previene cargar sin observabilidad. Reserva de requests sí usa mutex en toda operación RMW y test intraproceso más dos procesos previos prueban exclusión con ledger compartido. La cuarentena de corrupción se informa antes de primer intento; su reintento fail-open ya está documentado C4sin duplicar. Journal protege append RMW, redacta y recupera muertos sin marcar procesos vivos interrumpidos. Consentimientos manual/off/decline/unavailable no inician discovery; respuesta negativa no se toma como sí. La política de cuentas CLI excluye variables ajenas y rechaza automatización no permitida; API/MCP no pasan por accountEnvironment, limitación C2trazada y caveat del fixture previo conservado. Las observaciones del ledger/freshness son snapshots, no saldo reservado global independiente de workspace(C3).

Límites funcionales y de producto: README/describe afirman que nunca invoca ni gasta mientras la entry registra12herramientas, incluida invoke: documentación de uso desfasada, aunque default sí impide ejecutar. API invoker envía `{prompt}`yBearer a una URL genérica y devuelve texto crudo sin normalizar usage/cost: requiere endpoint de ese contrato, no prueba compatibilidad directa con APIs de vendors. La factory no conecta quotaSink, de modo que parsear rateheaders en helper no significa refrescar cuotas de producción; writer buildQuotaSnapshot sólo emite providers, mientras quotaHoldFornecesita groups. Si nadie externo escribe groups, cuentas con cuotas se niegan por never-observed; no se verificó productor externo. Los camposmodelId/contextWindowno configuran peticiones ni limitan contexto; son metadatos del ranking. spawnCLIomitecwd y no escucha childerror en nodeCliSpawner; comando ausente puede producir error de proceso no manejado, pendiente reproducción funcional. El resultado CLI se resuelve en exit en vez de close, pudiendo perder stdout final; code:null se toma como éxito si no fue cancelado. start síncrono puede lanzar fuera deltry/finallyde runOne: reserva queda hastaTTL y journalrunning. No se ejecutaron esos escenarios nuevos.

Lifecycle: SessionStoretiene timerunref ystop, pero entry no expone teardown; SpendLimitsStorestartRefreshTimer no conserva handle ni stop. Preparación/teardown de executionEnvironment se ejecutan, pero ILifecycleEnvironment sólo ofrece esas dos funciones: no conduce spawn/fetch dentro deDocker/SSH; la invocación sigue usando factoryhost. No prometer aislamiento de ejecución por esa opción. Si teardown falla después de result, manager devuelve result ignorando outcome.failure; fallo sólo visible en environmentLog. El schema detallado InvokeOutputSchema no incluye environment-unavailable ni environmentLog aunque el manager sí; wire usa envelope opaco por lo que no se dice queSDKrechace actualmente, pero callers que validen contra schema exportado no pueden representar ese error. La suite prueba managerenvironment-unavailable sin comprobar el schema detallado. Tokens unknown no deben transformarse en gasto cero; readSpendState hace justamente cero/vacío ante corrupción y luego aconseja no caps configurados. Consultar root sobre ruta real del summary antes de calificar su posible desajuste.

Economía de tokens: proyecciones compactas omiten alternates/tracespor defecto; specs de wire establecen techo200bytes de outputSchema paraadvise/invoke/spend, sin lectura nueva de tools/list. maxBytes en invoke sólo aplica al objetoresult, no al envelope conprompt/invoke/trace; es lo que dice descripción, no se le atribuye límite total. La entry no conecta resultHandleStore: resultado demasiado grande puede convertirse ennullsin referencia recuperable en producción; spec de chaining pasa store explícitamente. Manejo de providerrawoutputs y journal sin retención durante proceso largo merece límites reales. La suite de pool prueba bien su semáforo/dispose, pero N21distingue helper de integración exterior.

### N19 — P2, estático: cancelar/timeout de MCP no liquida la promesa del invocador

Ubicación: plugins/orchestrator-runner/src/lib/subprocess/mcp-client.ts:118–129;SHA6fd36632a73734a4d86913def02022b2c7e146491e3602558d82ee303e779ae6. manager.ts:275–283espera active.promise;SHA bb98e26e464d66561d0b5592b4a86e406a2bc172c9e2e26077a17a56f1d0b243. cancelmarca settled,envía notificación y transport.close, pero no tiene acceso a reject. Stdio closeponeclosed:trueyborrapending; el onExithace returnsi closed,por tanto nunca sintetiza respuesta deerror tras cierre. Un servidor que no responde queda con promise pendiente para siempre aun después de matar child;manager no llega alfinallypara liberar hold/borraractive. Esperado: cancel debe rechazar promesa una vez,independientemente de colaboración del servidor. Remedio: guardar settle/rejectyutilizarlo en cancel; regression fake transportsinrespuesta, avanzar timeout y exigir resultado timeout-exceeded+activecleanup+holdrelease. Specsstdiosólo comprueban muerte de proceso; no combinan promesa MCP+managercancel. Confianza alta estática; no experimento añadido.

### N20 — P2, estático/spec: bloque de límites incompleto se toma por gasto conocido

Ubicación: lib/invoke/limits-store.ts:35–48yspend-guard.ts:166–182;SHA30ebb90714b95e22529838fda27bc17ac2454be2b8af5e2a91041426fdef3228y81aa7b9b1efef68b5d565372a52335114c9a789fc10fa5fd5de0ea7a882056b9. normalizeLimitsView({})devuelve observed:known,spend0,breached:null. Incluso breached:weeklypasa como known sin breach: el spec exige esa conducta. decideSpendGuard consulta configuracióncaps sólo enunknown yknown/nullpermite gastar. Esperado: JSON válido sin datos obligatorios no acredita saldo ni status; camposmalformados deben diagnosticarseunknown. Remedio: schema completo finito/no negativo, cotejar capsconfigconobservaciónyventanaactual; regresión limitsStatus:{}concap0y5yshapeantiguo. El chequeo se renueva cada60s,sin reserva de coste futuro; saldo válido tampoco constituye garantía estricta bajo concurrencia. No se ha ejecutado gasto, ni se alega que el circuito vigente haya pagado una llamada concreta. Confianza alta.

### N21 — P2, estático: concurrencia/pool configurados no llegan a la ejecución

Ubicación: lib/invoke/build-manager.ts:140–141yretornoInvocationManager;opcionesenlib/options.ts;SHA b49266abc86cdf2fa9003e44e18904264cc7d33f516ab0bf5539ef85e70245de. buildDefaultInvocationManager acepta subprocessPoolSize/concurrencyLimit,pero no los usa al construir invokers/manager. No hay consumidores de SubprocessPoolen producción leída: sólo implementación y comentario. Manager mantieneactiveMap, sin contarlo para admisión, semáforo ni cola. Resultado: configurar concurrencyLimit:1no serializa solicitudes; tamaño pool2no limita spawnsMCPporllamada. Esperado: límite efectivo en boundaryinvocación+cleanupcuando falla/cancela, o eliminar opción inoperante. Regresión: fábrica real con spawnerfakebloqueado y doscalls; segunda no starts hasta liberarprimera. Specs pool sólo acreditan clase aislada, no garantía de entry. Confianza alta.

### N22 — P2, estático: el handoff curl no expande la variable de credencial

Ubicación: lib/invoke/handoff.ts:49;SHAde64d5adb3f196668ec528e6ce1a61942d666b918d429c541f960196edbd7006. shellQuotedelheader produce `-H 'Authorization: Bearer $TEST_KEY'`; en shell POSIXlascomillassimples preservan literal$,por lo que el comando ready-to-run no envía la clave del entorno. CLI comando/baseargsse unen sinquote,por lo que una ruta con espacio tampoco conservaargv. Esperado: representaciónqueexpandaexclusivamenteelnombrevalidadoyquoteeotrosargumentos. Remedio: formatterdevuelveargv/envreferenciaestructurados,orendererespecíficoconescapeadecuado. Regresión: bashenfixtureconvariablefalsa ybinariofakecaptureargv, sinred; noejecutada aquí. Confianza alta porsemánticashell.

### N23 — P2, estático: until no rehabilita disponibilidad en el store real

Ubicación: lib/healthcheck/store.ts:get,líneas35–37;SHAdc2ba07e70c26ae6a536e12f57e2910122410120e0b2aca1f1c3f16f84d839bf. Set-provider-statepromete boundedbyISOuntil;get retorna estado guardado sinmirar tiempo yscoredescarta todo state!=available. E2efallback-resetno usaHealthStore: fakeavailabilitycompara reloj ydevuelveavailablepasadoresetAt, supliendoexactamentelafunciónausente. Esperado: expiraciónseguraen store real,conreprobe/unknown/availablesegúnpolíticadeclarada. Remedio: relojinyectadoytratamientoúnicodeuntil;regresiónusando HealthStore+toolsoverride+managercompleto,conavancetiempo. Confianza alta.

### N24 — P2, estático: errores de herramienta MCP se registran como completados

Ubicación: lib/subprocess/mcp-client.ts:49–68,90–102. readToolResultno lee isError. Respuestarpcresult:{isError:true,content:[textoerror]}resuelvesuccess,runOneregistra completed,invoke nofallback. Esperado: distinguir error de transporte yerror delCallToolResultypermitirfallbacksegúnpolicy. Ademásclienteomiteinitialize/initializedynegociación:serviciorealpuederechazarantesdeltools/call; lostestsusanNDJSONstubqueexpresamenteignoraelhandshake,porloquenoacreditancompatibilidadMCPcompleta. Remedio: clienteSDKoflujodelifecyclespecificado,validar result.isErroryerroresmalformados. Regresión: servidorfakequerequiereinit+resultisError ycomprobarfailed/fallback.Sinredeproveedores. Confianzaaltaenerrortool,noejecucióndecompatibilidadreal.

Quedan dos componentes enormes: commit-policy175archivos y proposals676archivos. No están cubiertos completos por las pruebas previas ni por el contador de este lote.

## Checkpoint lote7 commit-policy (abierto)

Leídos metadatos6, entry completo32010bytes, audit/trailer, branch-policy con spec colocado en src, capabilities/manifest-grants y primeros contratos/constantes. Ledger conserva el orden y SHA. Aún no se valora ni se marca completo este componente. Su vitest.config sólo incluye tests/**/*.spec.ts mientras existen specs colocados en src; se avisó a root para comprobar cobertura real de suite global.

Candidato funcional claro por lectura: audit/trailer.ts stripTrailers(kind co-authored-by) elimina todas las líneas finales que matchean /^[A-Za-z][\w-]*:\s/, no sólo trailers de agente. Un mensaje convencional de una sola línea `feat: add parser` se elimina íntegro y queda sólo Co-authored-by; trailers legítimos Signed-off-by/Refs también desaparecen. Confirmar tests y cadena driver al terminar; default none reduce exposición a configuraciones con trailer opt-in. SHAa9aed735df48ebb8c2ccf3ed8671ae0ed228e3322a9a1271a7b09c74fd4000f3. No prueba nueva.

También branch/constants ofrece política v2 con main/release frente a README listas vacías; no concluir divergencia sin leer consumidores. La entry sí pasa development policy a todos drivers e incorpora protección derivada al engine; respeta diagnóstico de no confundir helpers aislados con protección exterior.

### Checkpoint de lectura adicional commit-policy (104/175 archivos)

Producción completa leída; restan 71 specs al inicio de esta tanda (68 tras primera lectura). Se recuperaron explícitamente tramos que la salida truncó: engine.ts líneas620–870 y commit-driver.ts580–625. No se cuentan búsquedas como lectura.

Hallazgos candidatos trazados, pendientes síntesis con los specs restantes:
- Entry src/index.ts:303 sharedDriver NO incluye workspaceRoot. Este mismo objeto llega a buildCommitToolRegistration(439) y createCommitPolicyEngine(574); el run-tool sí lo añade(462). withGitWriteLock(undefined) ejecuta sin mutex; commitWithGuard sin workspaceRoot usa índice compartido. Por tanto los tests reales que inyectan workspaceRoot al engine no prueban la cadena de entry. No confundir este defecto de cableado con la inexistencia del mutex exterior: el mutex sí existe y es correcto cuando recibe raíz. Revisar también el runner core antes de afirmar alcance interproceso.
- Engine retorna desde onCommitSucceeded exitoso o fallido antes de processedEvents.add del final; posible pérdida de idempotencia precisamente con push automático. UNKNOWN_REFUSAL se registra terminal incluso para bloqueos transitorios; falta contrastar specs.
- commit-tool calcula parseResult antes de onCommitSucceeded y retorna ese pushed:false aun si push fue exitoso, mientras run-tool actualiza result.pushed:true. Confianza estática alta; sin ejecución nueva.
- slice-listener difiere diffSlices mientras baselineQueue siga no vacía, pero actualiza prev=curr cada poll; una transición nueva durante drenaje puede perderse. Necesita escenario de regresión, no ejecutado.
- Trailer sigue candidato tras confirmarse que driver valida header ANTES de appendAuditTrailer; los dogfood existentes añaden scope y no ejercen subject no scoped.
- push-scheduler serializa su propia cola y usa mutex exterior con raíz desde entry; default reconciliador5min, interval unref y stop disponibles. Circuit breaker evita tormenta de fallos idénticos.
- StormLog sí protege cada read/merge/write con mutex, valida shape, cuarentena y recuperación. StormDetector limita claves256 pero no timestamps por bucket pese a comentario: ventana temporal, sin tope de tasa. Repair proposer usa ids únicos distintos después de scan no serializado; wx impide sobrescribir mismo archivo pero no duplicar storm con ids diferentes. Observaciones estáticas de calidad, sin experimentos de concurrencia nuevos.

Resultados de suite aportados por root: /tmp/delendai-audit-completion-root/full-tests-result.json y full-tests.log:2105files,2089pass,15fail,1skip;16899tests pass,5fail,8skip. Retest tras corregir Git/deps: failed-suites-retest-result.json/.log162tests15filesPASS. sqlite-tests.log477pass2fail por CI=true sin GITHUB_SHA, focal pendiente. Son datos del root, no nuevas ejecuciones de este subagente; no atribuir cobertura de entry a tests de helpers.
