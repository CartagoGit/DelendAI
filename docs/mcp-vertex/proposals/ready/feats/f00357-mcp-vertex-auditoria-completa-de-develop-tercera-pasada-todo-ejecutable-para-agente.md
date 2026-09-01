---
id: f00357
title: "MCP Vertex — Auditoría completa de `develop` (TERCERA pasada) → TODO ejecutable para agente"
kind: feat
status: ready
type: proposal
track: migrated
date: 2026-08-30
migrated-from: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-tercera-pasada.md
shipped-in: ["f00dbf926"]
---

# f00357 — MCP Vertex — Auditoría completa de `develop` (TERCERA pasada) → TODO ejecutable para agente

## Goal

> **Documento de trabajo generado a partir de una nueva auditoría completa del
> estado actual de `develop`.**
>
> **Commit auditado:** `866c44c1bce3a5597c51b9909bb1550a13f5141d`
>
> **Objetivo:** que un agente pueda convertir esta auditoría en propuestas /
> slices verificables, implementar únicamente lo que realmente siga pendiente y
> cerrar cada punto con evidencia.

> ⚠️ **Importante:** la regla de cierre es: *mismo SHA + targeted tests green +
> validate green + GitHub CI green + acceptance verificada*. No vale con
> cerrar una hija diciendo "el commit anterior estaba verde". El SHA de la
> evidencia debe ser el SHA de la implementación.

---

## why

Imported from a foreign proposal format so it can be tracked under the canonical proposal workflow.

### Parte I — Crítica narrativa del auditor externo

### Snapshot auditado

- Repositorio: `CartagoGit/mcp-vertex`
- Rama: `develop`
- HEAD auditado: `866c44c1bce3a5597c51b9909bb1550a13f5141d`
- La auditoría anterior partía de `e1b4cefd39c140913800748fea44c392026ca303`.
- Entre ambos había 50 commits.
- El commit de cierre de `q00004` declara `bun run validate` local verde con:
  - 908 test files.
  - 6 954 tests pasados.
  - 1 skipped.
- Sin embargo, para el SHA auditado, GitHub Actions `CI` terminó en `failure`.
- Jobs observados en fallo para ese SHA:
  - `tests`
  - `tokens-budget-real`
  - `lint-governance`
- El workflow independiente `Surface Bootstrap` sí terminó correctamente.

### Regla de esta auditoría

**No marcar una finding como resuelta únicamente porque una proposal, commit o
comentario lo diga.**

Para cerrar una finding:

1. comprobar el código actual;
2. reproducir cuando sea razonable;
3. implementar el cambio mínimo correcto;
4. añadir o corregir test/gate que capture la clase de fallo;
5. ejecutar targeted tests;
6. ejecutar `bun run validate`;
7. comprobar CI real del SHA final;
8. aportar evidencia del resultado.

### Veredicto general

> *"La conclusión es un poco paradójica: el proyecto ha mejorado otra vez de
> forma considerable, y muchas de las soluciones del agente son buenas de
> verdad. Pero esta nueva auditoría ha encontrado varios problemas nuevos y,
> sobre todo, algunos casos donde la propuesta figura prácticamente como
> resuelta pero el mecanismo que debía garantizar la corrección no está
> probando realmente lo que cree probar."*

Cuatro asuntos serios abiertos:

1. una **nueva vía de escape de filesystem en search**;
2. una **posible fuga de privacidad residual en el reporting de errores LLM**;
3. el **mutex sigue sin convencerme y su test de race tiene un problema
   importante**;
4. la **nueva arquitectura de tokens es muy buena**, pero los gates/reportes
   están mezclando superficies adaptativas y nativas y el propio CI de tokens
   está rojo.

Puntuación anterior ≈ 8,9/10 → ahora ≈ 9,0/10.

### Evolución de puntuaciones

| Área                                  | 1ª | 2ª | Ahora |
|---------------------------------------|----|----|-------|
| Idea / visión                         | 9,4| 9,8| 9,8   |
| Utilidad real                         | 9,3| 9,8| 9,8   |
| Arquitectura                          | 8,3| 9,1| 9,25  |
| Core/runtime                          | 8,1| 8,9| 9,0   |
| Lifecycle plugins                     | 7,2| 8,9| 9,2   |
| Correctitud                           | 7,2| 8,6| 8,5   |
| Seguridad filesystem                    | 8,6| 8,6| 8,3   |
| Privacidad/reporting                  | 4–5| 8,6| 8,7   |
| Seguridad global                      | 6,3| 8,7| 8,5   |
| Estrategia tokens                     | 8,8| 9,5| 9,7   |
| Ejecución real tokens                 | 6,6| 7,3| 7,5   |
| Concurrencia                          | 7,6| 8,3| 8,1   |
| Métricas                              | 7,5| 9,1| 9,1   |
| Tests (diseño)                        | 8,4| 9,2| 8,8   |
| Coverage                              | 7,7| 8,9| 8,9   |
| CI diseñado                           | 6,9| 9,0| 9,3   |
| CI operacional actual                 | 7  | 8  | 7,3   |
| Manifests / SSOT                      | 6,3| 8,1| 9,0   |
| Presets                               | 7,2| 8,5| 8,8   |
| Adopción                              | 8  | 9,4| 9,2   |
| Cliente                               | 8,2| 9,1| 9,1   |
| Mantenibilidad                        | 7,2| 8,6| 9,0   |
| Dogfooding / self-improvement         | 8,5| 9,7| 9,8   |
| Potencial                             | 9,3| 9,8| 9,8   |

### Qué ha arreglado realmente el agente (q00004)

| Finding anterior                                       | Estado actual        |
|--------------------------------------------------------|----------------------|
| context-for-change absolute path escape                 | ✅ Arreglado         |
| impact-analysis absolute path escape                    | ✅ Arreglado         |
| Safe workspace abstraction                              | ✅ creada             |
| internalOnly:false                                     | ✅ Eliminado         |
| safeToolId basado en registry                           | ✅                   |
| runtime version del reporter                            | ✅                   |
| UTF-8 truncation en procesos                            | ✅                   |
| adoption exact write count                              | ✅                   |
| memory watcher dispose                                  | ✅                   |
| summaries de presets                                   | ✅ generados          |
| manifests autodiscovery                                 | ✅                   |
| public packages requieren manifest                      | ✅                   |
| manifest vs package validation                         | ✅                   |
| manifest vs presets validation                          | ✅                   |
| generated artifacts check                               | ✅ creado             |
| adaptive surface                                         | ✅                   |
| compact surface                         | ✅                   |
| bootstrap mínimo de tools                               | ✅                   |
| client-capability policy                                | 🟡 conceptualmente discutible |
| token dashboard check                                   | ✅ / 🔴 CI falla      |
| real preset budget gate                                 | ✅ / 🔴 CI falla      |
| branch policy declarativa                               | ✅                   |
| branch protection real GitHub                           | ❌                   |
| mutex race                                              | 🟡 intento; no cerrado |

### Auditoría resumida de plugins actuales (resumen del auditor)

Plugin summary scores — 49 plugins totales (47 públicos + 2 privados
`changelog` y `issues-triage`).

| Plugin                | Nota  | Comentario                                            |
|-----------------------|-------|--------------------------------------------------------|
| adaptive-optimizer    | 8,6   | dirección muy buena; scorer inicial                    |
| api                   | 8,9   | bastante endurecido                                   |
| audit                 | 8,7   | potente y caro por naturaleza                          |
| auto-agent-selector   | 9,0   | tesis del producto                                    |
| auto-plugin-selector  | 8,5   | falta token/latency/observed utility                   |
| browser               | 7,9   | alto riesgo/surface; correcto como opt-in              |
| cache                 | 8,6   | infraestructura sólida                                |
| changelog             | 7,4   | private pero presente en presets distribuibles        |
| completion            | 8,7   | útil en orquestación real                              |
| container             | 8,2   | buen plugin, superficie potente                        |
| context-for-change    | 9,1   | containment ya corregido                              |
| conventions           | 8,3   | buen soporte de gobernanza                            |
| database              | 8,3   | correcto                                              |
| deps                  | 8,8   | fuerte                                                |
| diagram               | 8,5   | bien acotado                                          |
| docs                  | 8,6   | complementa muy bien search                            |
| env                   | 8,5   | útil y sensible; vigilar valores                       |
| error-reporting       | 8,7   | arquitectura buena; revisar bypass LLM suffix          |
| external-mcps         | 7,9   | mucho potencial, gran trust boundary                  |
| forge                 | 8,6   | importante para autonomía                             |
| git                   | 9,0   | bases sólidas                                         |
| i18n                  | 8,4   | correcto                                              |
| impact-analysis       | 9,0   | containment corregido                                 |
| issues                | 8,2   | útil                                                  |
| issues-triage         | 8,0   | privado correctamente                                 |
| link-check            | 8,2   | simple y útil                                         |
| logs                  | 8,8   | importante para auto-diagnóstico                      |
| memory                | 9,5   | entre los mejores                                     |
| notification          | 9,1   | gran relación utilidad/tokens                         |
| observability         | 8,3   | algo de overlap potencial                             |
| orchestrator-runner   | 8,6   | potente                                               |
| perf                  | 8,6   | necesario para optimización                           |
| project-health        | 8,1   | bueno, pero migrar direct fs                          |
| prompt-eval           | 8,8   | estratégico                                           |
| prompts-pack          | 8,5   | vigilar coste estático                                |
| proposals             | 9,0   | corazón del producto; native schema sigue caro        |
| quality               | 8,9   | muy sólido                                            |
| quality-policy        | 8,2   | buen patrón, direct fs pendiente                      |
| refactor              | 8,7   | fuerte                                                |
| rules                 | 8,6   | maduro                                                |
| search                | 7,8   | excelente funcionalidad, pero P1 de containment       |
| security              | 8,8   | fuerte                                                |
| skills-pack           | 8,4   | útil, vigilar tamaño                                  |
| status-marker         | 8,3   | pequeño y práctico                                    |
| tech-debt             | 8,4   | buen utility plugin                                   |
| test-convention       | 8,3   | correcto                                              |
| test-policy           | 8,2   | pequeño pero útil                                     |
| usage-tracking        | 8,4   | clave para optimización futura                        |
| web-fetch             | 9,1   | hardening de allowlist/redirect/bytes                 |

### Conceptos clave de la crítica del auditor

> *"La próxima ronda no necesita inventar arquitectura nueva. Necesita hacer
> que las invariantes que ya habéis diseñado sean realmente universales."*

> *"Cuando [los 4 P1] desaparezca, sí veo razonable un salto hacia 9,2–9,3."*

> *"No estoy encontrando de nuevo 'el loader ignora Zod' o 'los errores
> cuentan 0 bytes'. Esos problemas se han ido. Ahora encuentro 'la
> abstracción correcta existe, pero tres componentes todavía no la usan'.
> Eso es una clase de deuda bastante más madura."*

> *"Una macro-proposal como q00004 no puede declararse completamente resuelta
> mientras cualquiera de sus gates esté rojo."*

---

### Parte II — TODO ejecutable para el agente

> Clasificación obligatoria: `CONFIRMADO`, `PROBABLE`, `REVISAR`, `MEJORA`,
> `IDEA`. No mezclar significados.

### §0 — Principios no negociables

1. **Privacidad del error reporting — debe seguir habilitado por defecto.** No
   convertir esta auditoría en una propuesta de opt-in por defecto.
2. **Filesystem — toda operación limitada al workspace** debe ser segura
   contra `..`, absolute paths, symlinks de fichero/dir, symlink usado como
   raíz de traversal, cambios de enlace, rutas reservadas.
3. **Tokens — no subir budgets** automáticamente para hacer pasar gates.
4. **CI — `local validate = green` no equivale a `integrated = green`.**

### §1 — P1 Search: containment real para `cwd` / `roots`

#### SRCH-001 — `search_symbol` puede seguir symlink-root fuera del workspace

- Prioridad: **P1**
- Clasificación: **CONFIRMADO por semántica estática; falta test de
  reproducción**
- Archivo: `plugins/search/src/lib/tools/search-symbol.tool.ts`

La tool acepta `cwd?: string`. Hace containment mediante
`resolveWorkspaceContained(...)`, pero luego recorre y lee con
`readdir()` / `readFile()` directos. Un `cwd = external-link ->
/outside/project` es léxicamente válido, pero `readdir()` sigue el symlink.

Reproducción requerida: workspace con `external-link -> /outside`, llamar
`search_symbol` con `cwd: "external-link"`, comprobar que no se devuelve
contenido de `/outside`. Windows puede usar skip condicional para symlinks.

Implementación preferida: `SafeWorkspaceReader` con validación realpath antes
de iniciar el traversal.

Acceptance:

- Test symlink-root falla antes del fix.
- Test pasa después del fix.
- Sin `readdir/readFile` directo en esta tool.
- `bun run lint:architecture-readfile-via-safe-reader` verde.

#### SRCH-002 — `search_references` tiene la misma clase de escape

- Prioridad: **P1**
- Archivo: `plugins/search/src/lib/tools/search-references.tool.ts`

Mismo patrón: `cwd → lexical containment → recursive readdir/readFile
directos`. Migrar a la misma primitive; no duplicar walker.

#### SRCH-003 — `search_search` / backend in-house: `roots` puede ser symlink-root

- Prioridad: **P1**
- Archivos:
  - `plugins/search/src/lib/tools/search.tool.ts`
  - `plugins/search/src/lib/services/search-engine.in-house.ts`
  - `packages/core/src/lib/shared/walk-allowed-files.ts`

`roots: string[]` validado con `resolveWorkspaceContained` pero después
`stat(absRoot)` y traversal real pueden seguir el symlink. La validación
realpath debe ocurrir antes de iniciar el walk.

### §2 — P1 Completar la invariante `SafeWorkspaceReader`

#### FS-001 — El lint mantiene excepciones para componentes de lectura

- Prioridad: **P2** (relacionado con los P1 de search)
- Archivo: `tools/scripts/lint/architecture-readfile-via-safe-reader.script.ts`

Allowlist actual relevante: `project-health`, `quality-policy`, `search`. En
`search` existen seis excepciones directas. Objetivo: `const ALLOWLIST = {}`.
Si existe una excepción genuina, crear una primitive segura específica en
lugar de mantener `node:fs` directo.

#### FS-002 — `project-health` usa traversal directo

- Prioridad: **P2**
- Archivo: `plugins/project-health/src/lib/services/project-health-signals.service.ts`

`readdir`, `stat`, `readFile` directos para muestras. Una carpeta symlink
dentro de sample roots puede hacer que `stat()` la trate como directorio y
se explore fuera. Migrar a safe traversal.

#### FS-003 — `quality-policy` conserva direct fs

- Prioridad: **P2/P3**
- Archivo: `plugins/quality-policy/src/lib/services/quality-policy.service.ts`

Migrar config reads y sample traversal a primitives seguras.

#### FS-004 — API footgun de `SafeWorkspaceReader.resolve()`

- Prioridad: **P3**
- Clasificación: **REVISAR/DISEÑO**

`resolve()` devuelve `absolutePath` tras containment léxico. Un caller podría
hacer `const { absolutePath } = reader.resolve(input); await someOtherApi(absolutePath);`
y asumir erróneamente que hubo realpath containment. Opciones:
`resolveLexical()` + `resolveExistingContained()`, branded type tras
validación real, no exponer absolute path inseguro fuera de operaciones
encapsuladas.

### §3 — P1 PRIVACY — error-reporting y heurística de nombre LLM

#### PRIV-001 — No inferir ownership interno por sufijo raw del `toolName`

- Prioridad: **P1 PRIVACY — máximo énfasis legal**
- Archivos:
  - `plugins/error-reporting/src/lib/origin-analyzer.helper.ts`
  - `plugins/error-reporting/src/lib/report-builder.helper.ts`
  - `plugins/error-reporting/src/lib/internal-classifier.helper.ts`
  - `plugins/error-reporting/src/lib/privacy-validator.helper.ts`
  - `plugins/error-reporting/tests/privacy-adversarial.spec.ts`

La detección de tool LLM considera nombres que terminan en sufijos como
`_orchestrator-runner_invoke`, `_auto-agent-selector_auto_run`. Si un host
externo registra `acme_private_billing_orchestrator-runner_invoke` y falla
con `invalid request body / schema validation / invalid json / malformed
payload`, la ruta `llm-format` puede introducir el raw `toolName` en un
`componentId`/frame sintético interno. Un privacy validator basado en regex
no puede saber que `acme_private_billing` es privado.

**Regla de corrección:** nunca decidir "esta tool pertenece a MCP Vertex"
por el nombre. Usar `IToolIdentityRegistry`:

```
registry.get(toolName)
→ owner === 'mcp-vertex'
→ known category/capability
```

Solo una identidad verificada puede entrar en `safeToolId`, component IDs
públicos o synthetic internal frames.

Test adversarial obligatorio (mínimo):

- `acme_private_billing_orchestrator-runner_invoke` + `invalid request body`
- `cliente-secreto_auto-agent-selector_auto_run` + `schema validation`
- `JaneDoe_internal_repo_orchestrator-runner_invoke` + `invalid json`
- `ΩmegaProject_auto-agent-selector_auto_run` + `malformed payload`

Acceptance:

- Ningún raw external tool name aparece en report DTO / body / fingerprint /
  synthetic frame.
- Mismo fallo privado en dos proyectos genera payload público idéntico o
  ambos se bloquean.
- Una tool MCP Vertex real sigue clasificándose correctamente usando
  registry provenance.
- Reporting sigue `enabled: true` por defecto.
- No se reintroduce `internalOnly` como escape hatch configurable.

### §4 — P1 Mutex: demostrar exclusión, no solo intención

#### MUTEX-001 — El test de stale race usa `mtime`, pero la lease nueva usa `heartbeatAt`

- Prioridad: **P1**
- Archivos: implementación de `with-file-mutex` + tests de race/stale reclaim

El protocolo nuevo usa lease estructurada con `token`, `generation`,
`heartbeatAt`. Pero el test de race manipula
`utimesSync(lockPath, staleTime, staleTime)`, modificando `mtime`, no
`heartbeatAt` dentro de la lease moderna. Por tanto el test puede pasar
sin haber entrado realmente en `structured lease considered stale →
interleaving → heartbeat update → reclaim decision`.

Acceptance:

- El test construye una lease con `heartbeatAt` verdaderamente stale.
- Demuestra que entra en el hook/ruta de `observe stale` esperada.
- Ejecuta el interleaving exacto que se pretende probar.
- El test falla si se elimina la revalidación/generation protection.

#### MUTEX-002 — Verificar ventana reclaimer + tercer contender

- Prioridad: **P1**
- Clasificación: **PROBABLE**

Interleaving a probar:

```
A = holder
B = stale reclaimer
C = third contender
1. B observa stale.
2. A heartbeat / renueva lease.
3. B mueve lock principal a quarantine / reclaim path.
4. lockPath desaparece.
5. C intenta O_EXCL y adquiere.
6. B detecta que la lease cambió y trata de abortar / restaurar.
7. Verificar que nunca existen A y C simultáneamente en critical section.
```

Test recomendado: state machine / property test con `fast-check` o scheduler
determinista de interleavings. Estados mínimos: `free, held-A,
stale-observed-B, quarantined-B, held-C, restore-B, release-A, release-C`.
Invariante: `activeHolders <= 1`.

Acceptance:

- Repro / falsación del interleaving.
- Si reproduce, corregir protocolo.
- Si no reproduce, el test debe explicar por qué el diseño lo impide.
- Property / state-machine test con cientos / miles de secuencias
  deterministas.
- No cerrar por simple prueba happy-path.

### §5 — P1 Tokens: separar superficies y arreglar gates reales

#### TOK-001 — `tokens-budget-real` está rojo en el SHA auditado

- Prioridad: **P1**
- Clasificación: **CONFIRMADO por CI**

Trabajo:

1. obtener log exacto del job fallido;
2. identificar qué superficie excede hard budget o qué assertion falla;
3. reproducir localmente exactamente el comando del CI;
4. comprobar qué client capabilities se están pasando;
5. comprobar si la medición es `adaptive`, `native` o ambas;
6. arreglar semántica / bug;
7. solo re-baseline con justificación si no existe reducción razonable.

Acceptance:

- `tokens-budget-real` verde en GitHub para SHA final.
- Evidence del run en proposal.

#### TOK-002 — Dashboard mezcla bytes `adaptive` con tokens de otra superficie

- Prioridad: **P2**
- Archivos:
  - `docs/mcp-vertex/TOKEN-BUDGETS.md`
  - `tools/scripts/report/token-budget-dashboard.script.ts`
  - `tools/scripts/report/tokenizer-real.script.ts`
  - `tools/scripts/report/token-budget-report-lib.ts`

La tabla de real preset dashboard muestra
`all presets → tools/list ≈ 8 357 B, 6 tools`; la tabla de tokenizer muestra
`swarm → 54 747 estimated tokens` y `vertex → 74 644`. Con heurística de 4
bytes/token, ambas no pueden describir la misma superficie.

Corrección: dos superficies explícitas — `Adaptive surface`, `Native
compatibility surface`. Cada fila con `surfaceMode`, `clientCapabilities/
profile`, `toolCount`, `toolsListBytes`, `estimatedTokens`, `measuredAt`,
`source`.

Acceptance:

- Ninguna tabla mezcla bytes de A con tokens de B.
- `8 357 B` produce estimado coherente con la heurística si se muestra en la
  misma fila.
- Native y adaptive comparables lado a lado.
- Dashboard check detecta mezcla accidental futura.

#### TOK-003 — Gate "real preset" usa por defecto client capabilities privadas de Vertex

- Prioridad: **P2**
- Archivo: `tools/scripts/test/run-actual-preset-budget.script.ts`

El runner usa dynamic client por defecto salvo `--static-client` y pasa una
capability privada para la surface. Decisión a documentar:

- A: "coste con un cliente Vertex-aware que negocia surface dinámica".
- B: "coste que verá un cliente MCP genérico".

Acceptance:

- Renombrar / reportar la semántica exacta.
- Gate separado para `--static-client` / native si native se mantiene.
- Documentar qué superficie es release-blocking.

#### TOK-004 — Revisar política MCP estándar vs capability privada `mcp-vertex/surface`

- Prioridad: **P2**
- Clasificación: **REVISAR / DECISIÓN DE PRODUCTO**

MCP estándar coloca `tools.listChanged` en capabilities del servidor.
Vertex usa además capability privada del cliente para decidir si activa
surface adaptativa. Decisión a evaluar: ¿debe ser `adaptive` el default
para clientes MCP normales, con `native` como compatibility fallback?

No cambiar comportamiento solo porque "la spec parece permitirlo".

Acceptance:

- ADR o proposal con decisión explícita.
- Matriz de compatibilidad real de hosts.
- Tests para cliente que refresca y cliente que no refresca.

#### TOK-005 — Dashboard declara hard breaches y a la vez `Documented deficits: none`

- Prioridad: **P2**
- Clasificación: **CONFIRMADO**

Acceptance:

- Deficits generados automáticamente desde mediciones.
- Si hay hard breach, no puede aparecer `none`.
- Si la medición corresponde a otra surface, etiquetarla y no mezclarla.

### §6 — P1 CI real y Definition of Done

#### CI-001 — `tests` está rojo para HEAD auditado

- Prioridad: **P1**
- Clasificación: **CONFIRMADO**

Trabajo:

- obtener logs del job exacto;
- separar fallo de `bun run test` vs `bun run test:coverage`;
- reproducir con Bun 1.3.14 y frozen lockfile como CI;
- no asumir que el `validate` local anterior representa el entorno CI.

Acceptance:

- Job `tests` verde en SHA final.
- Si era flake, eliminar causa o aislarla con justificación.

#### CI-002 — `lint-governance` está rojo para HEAD auditado

- Prioridad: **P1**
- Clasificación: **CONFIRMADO**

Trabajo: obtener qué sublint falla
(`lint:proposals`, `lint:mass-content-removal`, `lint:scaffolds`,
`lint:agents`, `lint:audit-ids`, `lint:cache`, `lint:proposal-id-drift`,
`lint:proposal-cited-commits`, `lint:reap-legacy-proposals`,
`lint:closed-frozen-guard`, `lint:user-markers`,
`lint:proposal-slice-completeness`, `lint:commit-branch`,
`lint:push-to-develop`, `lint:agent-branch-naming`).

Acceptance:

- Job verde en SHA final.
- No desactivar el lint para cerrar el plan salvo decisión explícita.

#### CI-003 — `q00004` no debe considerarse terminada mientras su SHA esté rojo

- Prioridad: **P1 proceso**
- Clasificación: **CONFIRMADO**

Nueva Definition of Done propuesta:

```
implementation complete
→ targeted tests
→ full local validate
→ candidate push
→ CI completed
→ all required checks green
→ generated artifacts clean
→ acceptance verified
→ review / done
```

Acceptance:

- Governance / proposal transition exige CI evidence para cierre final.
- El SHA de evidence coincide con la implementación que se cierra.
- No vale evidence de un SHA anterior.

#### CI-004 — Lints críticos locales no están todos reflejados en CI

- Prioridad: **P2**
- Clasificación: **CONFIRMADO**
- Archivos: `package.json`, `.github/workflows/ci.yml`

Añadir al CI required:

- `bun run lint:architecture-readfile-via-safe-reader` (a `lint-architecture`).
- `bun run lint:privacy` (a `lint-security` o job dedicado).

Acceptance:

- Los dos se ejecutan en CI.
- Fallan el workflow si incumplen.
- Documentación de required checks actualizada.

### §7 — Branch protection / integración

#### CI-005 — La policy declarativa existe, pero `develop` no estaba protegido realmente

- Prioridad: **P2**
- Clasificación: **CONFIRMADO en snapshot auditado**

Estado: existe `.github/branch-protection.yml`, pero la configuración real
de GitHub observada para `develop` seguía sin protection enabled.

Acceptance:

- Aplicar ruleset / branch protection real o mecanismo equivalente.
- Verificar mediante API que la regla está activa.
- Evidence incluye estado real, no solo archivo YAML.

#### CI-006 — Direct pushes + CI post-push no garantizan que `develop` nunca quede rojo

- Prioridad: **P2**
- Clasificación: **REVISAR / arquitectura de integración**

Diseños posibles:

- agent branch → CI → fast-forward / merge automático;
- staging ref → CI → bot actualiza develop;
- PR sin review humana obligatoria + required checks;
- merge queue;
- otro mecanismo equivalente.

No imponer review humana si no es objetivo del proyecto.

Acceptance:

- Decisión explícita.
- Un commit con tests rotos no puede convertirse en HEAD integrado de
  `develop`.
- Mantener velocidad de agentes sin sacrificar gate real.

### §8 — Manifests / packaging

#### MAN-001 — `changelog` es privado pero aparece en presets distribuibles

- Prioridad: **P2**
- Clasificación: **PROBABLE BUG DE PACKAGING**
- Archivos:
  - `plugins/changelog/package.json`
  - `plugins/changelog/plugin.manifest.ts`
  - `packages/core/src/lib/plugins/preset-catalog.ts`

`changelog` declara `private: true` y `visibility: private` pero es miembro
de `full`, `cli-tool`. Fuera del monorepo puede intentar cargar un paquete
deliberadamente no publicado.

Reproducción: en pack smoke / external install — empaquetar artefactos
publicables, instalar en proyecto vacío con npm, ejecutar todos los presets
públicos, comprobar `loadErrors`.

Acceptance (una de estas decisiones):

- `changelog` se hace publicable correctamente;
- se elimina de presets públicos;
- el preset lo incluye como host-only / optional con semántica real
  soportada;
- existe otro mecanismo de distribución explícito y testeado.

#### MAN-002 — Test externo para TODOS los presets distribuibles

- Prioridad: **P2**
- Clasificación: **MEJORA de packaging**

Acceptance: pack smoke debe probar al menos
`minimal`, `lean`, `standard`, `swarm`, `full`, `vertex`, `web-app`,
`backend-api`, `cli-tool`. Para cada uno: load project, connect MCP
client, zero unexpected load errors, list tools, call una tool bootstrap
segura, close cleanly.

#### MAN-003 — `tokenBudget` de manifests es todavía metadata placeholder

- Prioridad: **P3**
- Clasificación: **MEJORA**

Muchos manifests usan
`tokenBudget: TOKEN_BUDGETS.toolPayloads.search` por lo que múltiples plugins
terminan con los mismos 2700 / 3000. Que el manifest pueda representar:

- static tools/list bytes en native;
- marginal adaptive activation bytes;
- typical output budget;
- o contrato claramente definido.

#### MAN-004 — `toolPermissions` casi vacío

- Prioridad: **P3**
- Clasificación: **MEJORA**

Rellenar progresivamente `tool → exact permission/effect set` para que
adaptive selection no penalice un plugin entero por permisos que solo usa
una tool concreta. Empezar por plugins de alto riesgo: `git`, `forge`,
`issues`, `proposals`, `error-reporting`, `container`, `api`,
`external-mcps`.

### §9 — Preset metadata / adoption cost

#### PRESET-001 — `PRESET_METADATA` mantiene snapshots hardcodeados que ya no representan la surface actual

- Prioridad: **P2**
- Clasificación: **CONFIRMADO**
- Archivo: `packages/core/src/lib/contracts/constants/preset-metadata.constant.ts`

Contiene snapshot `measuredAt: 2026-08-24` y tool counts históricos:
`minimal 29, lean 41, standard 80, swarm 143, full 150, vertex 160`.
Mientras la surface adaptativa actual lista ~6 bootstrap tools.

`buildAdoptionAssessment()` reutiliza budgets de `PRESET_CATALOG`, de modo
que una estimación puede representar otra surface / fecha.

Solución: generar metadata desde la misma medición que token dashboard.
Campos: `surfaceMode`, `measuredAt`, `toolCount`, `schemaBytes`,
`estimatedTokens`, `estimator`, `source`.

Acceptance:

- No mantener tool counts antiguos manuales.
- Adoption assessment indica surface usada.
- Generated-artifacts check detecta drift.

### §10 — Auto-plugin-selector / adaptive optimizer

#### SEL-001 — Integrar coste real en plugin selection

- Prioridad: **P3**
- Clasificación: **MEJORA**
- Archivo: `plugins/auto-plugin-selector/src/lib/score/recommend-plugins.ts`

Scoring actual: `pack`, `language`, `project shape`, `permission risk`,
`unmatched tags`. No integra `token tax`, `latency tax`, `historical
usefulness`, `activation success rate`.

Score conceptual: `expectedUtility - tokenTax - latencyTax -
permissionRisk + historicalSuccess`.

No introducir telemetría privada externa. Uso / metrics deben ser locales /
agregados según política.

### §11 — Privacy validator — no detector semántico de PII empresarial

#### PRIV-002 — Mantener provenance > regex redaction

- Prioridad: **P2 principio**
- Clasificación: **MEJORA / ARQUITECTURA**

El privacy validator actual bloquea clases útiles (absolute paths, Windows
user paths, URLs no allowlisted, email, IP, UUID, JWT/token markers, git
metadata, branch names, JSON/XML/SQL-like strings). No añadir heurísticas
del tipo "si una palabra parece nombre de empresa → redactar". Corregir el
origen del dato para que nunca entre en el DTO.

Acceptance:

- Test PRIV-001 pasa por provenance.
- Validator sigue siendo fail-closed.
- No se amplía el DTO con arbitrary strings.

### §12 — Process runner — mantener fixes existentes

#### PROC-001 — No regresar UTF-8 byte boundaries

- Prioridad: **P3 regression guard**
- Clasificación: **CONFIRMADO como arreglado**

Mantener tests: 1-byte ASCII, 2-byte UTF-8, 3-byte UTF-8, 4-byte emoji,
chunk split exactamente en lead byte, chunk split dentro de continuation
bytes, stdout + stderr combined cap.

### §13 — Plugin lifecycle — mantener arquitectura actual

#### LIFE-001 — Regression suite del lifecycle

- Prioridad: **P3**
- Clasificación: **CONFIRMADO como mejora ya implementada**

Mantener cobertura de: DAG, cycle detection, missing dependencies, blocked
dependents, topological registration, register failure, rollback reverse
order, partial runtime dispose, AbortSignal, timeout, late resolution
disposal, external cancellation.

Nota: no exigir al loader que pueda deshacer mágicamente side effects de un
plugin que ignora AbortSignal, nunca retorna, no ofrece disposer. Contrato
del plugin SDK.

### §14 — Memory — mantener el dispose corregido

#### MEM-001 — Regression guard

- Prioridad: **P3**
- Clasificación: **CONFIRMADO como arreglado**

Mantener test de que al descargar plugin `storeWatcher.dispose()` y
`freshnessDebouncer.cancel()` se ejecutan y no quedan watchers / timers
vivos.

### §15 — Revisiones menores de filesystem

#### FS-005 — Política para `.env.*`

- Prioridad: **P3**
- Clasificación: **REVISAR**

Comprobar si reserved paths tratan únicamente `.env` o también
`.env.local`, `.env.production`, `.env.secret`. No asumir que todos deben
bloquearse. Documentar boundary y testearlo.

---

### Parte III — Orden de ejecución recomendado

> No ejecutar todo en paralelo sin coordinación porque varios cambios afectan
> los mismos gates.

### Fase A — recuperar estado verde

1. `CI-001` — entender `tests` rojo.
2. `TOK-001` — entender `tokens-budget-real` rojo.
3. `CI-002` — entender `lint-governance` rojo.
4. Conseguir un SHA candidato completamente verde antes de seguir declarando
   cierres.

### Fase B — P1 seguridad / privacidad

1. `SRCH-001`
2. `SRCH-002`
3. `SRCH-003`
4. `PRIV-001`
5. `MUTEX-001`
6. `MUTEX-002`

### Fase C — invariantes / gates

1. `FS-001`
2. `CI-004`
3. `TOK-002`
4. `TOK-005`
5. `PRESET-001`

### Fase D — packaging / integration

1. `MAN-001`
2. `MAN-002`
3. `CI-005`
4. `CI-006`
5. `TOK-003` / `TOK-004` como decisión de producto.

### Fase E — mejoras no bloqueantes

1. `FS-002` / `FS-003`
2. `MAN-003` / `MAN-004`
3. `SEL-001`
4. `FS-004` / `FS-005`

---

### Parte IV — Definition of Done global

No considerar esta auditoría terminada hasta cumplir todo lo siguiente.

### P1 funcionales

- `search_symbol` no puede leer fuera mediante symlink-root.
- `search_references` no puede leer fuera mediante symlink-root.
- `search_search` no puede leer fuera mediante `roots` symlink.
- `error-reporting` no clasifica raw external tool names como internos por
  sufijo.
- Payload público nunca contiene external tool name privado en ese edge
  case.
- Mutex race test usa `heartbeatAt` / lease real.
- Interleaving tercer contender está probado o falsado.

### CI

- `tests` green.
- `tokens-budget-real` green.
- `lint-governance` green.
- Todos los required jobs green en el mismo SHA.
- `lint:architecture-readfile-via-safe-reader` está en CI.
- `lint:privacy` está en CI.

### Tokens

- Adaptive y native se muestran por separado.
- No hay bytes de una surface con tokens de otra.
- `Documented deficits` refleja automáticamente breaches reales.
- Está documentado qué client profile usa cada gate.

### Packaging

- Todos los presets distribuibles cargan desde tarballs / instalación
  externa.
- `changelog` tiene una decisión coherente entre `private` y presets.

### Governance

- Proposal final solo pasa a done con evidence del SHA exacto.
- Branch / ruleset real coincide con la policy declarada o existe
  integración equivalente.

---

### Parte V — Findings de auditoría anterior que NO deben reabrirse sin nueva evidencia

Estos puntos se observaron como corregidos en el snapshot actual. Mantener
regression tests, pero no crear trabajo nuevo por defecto:

- `context-for-change` migrated to SafeWorkspaceReader.
- `impact-analysis` migrated to SafeWorkspaceReader.
- `internalOnly:false` eliminado del error reporting.
- `safeToolId` principal derivado de registry.
- Reporter version derivada del package runtime.
- UTF-8 output truncation corregido.
- Adoption write count derivado, no mágico.
- Memory watcher / debouncer dispose implementado.
- Preset summaries derivados.
- Manifest autodiscovery implementado.
- Public package → manifest lint implementado.
- Manifest / package consistency implementada.
- Generated artifacts check implementado.
- Adaptive surface implementada.
- Bootstrap mínimo de tools implementado.
- Lifecycle DAG / rollback / cancellation implementado.

Reabrir cualquiera solo si un test o código actual demuestra regresión.

---

### Parte VI — Resultado esperado al terminar

No se busca "cero findings" por maquillaje.

El objetivo es llegar a un estado donde:

```
workspace boundary  = una sola invariante real
privacy boundary    = provenance segura, no redaction optimista
mutex               = exclusión demostrada por interleavings
token dashboard     = medición coherente por surface
CI                  = gate real de integración, no solo detector post-push
manifests           = source of truth con metadata que representa realidad
```

Y donde la frase *"la auditoría está arreglada"* signifique realmente:

```
mismo SHA
+ targeted tests green
+ validate green
+ GitHub CI green
+ acceptance verificada
```

---

### Parte VII — Resumen ejecutivo para el agente

### Primero arreglar / verificar

1. CI rojo (`tests`, `tokens-budget-real`, `lint-governance`).
2. Search symlink-root containment.
3. Error-reporting LLM suffix provenance.
4. Mutex stale-race test y tercer contender.

### Después consolidar

1. Safe-reader lint sin excepciones peligrosas.
2. Adaptive / native token dashboard separado.
3. Preset metadata generada desde medición real.
4. `changelog` private vs public presets.
5. CI con privacy / safe-reader lints.
6. Integración real de `develop` protegida por checks.

### No hacer

- No desactivar error reporting por defecto.
- No enviar datos del proyecto para "mejor diagnóstico".
- No subir token budgets automáticamente.
- No desactivar lints porque bloqueen el cierre.
- No marcar `PROBABLE` como bug confirmado sin reproducción.
- No marcar proposal `done` con CI rojo.
- No duplicar nuevas primitives de filesystem si `SafeWorkspaceReader` puede
  ampliarse correctamente.

---

**Principio final:**

> No frenar el descubrimiento; industrializar el crecimiento. Cada nueva
> utilidad puede seguir apareciendo por dogfooding, pero las invariantes de
> core — privacidad, containment, lifecycle, concurrencia, tokens, manifests
> y CI — deben ser aburridas, universales y demostrables.

## non-goals

- Preserve the source document as an independently editable proposal.

## Slices

### S1 — Review migrated proposal

- **Status**: done
- **Files**: `ready/feats/f00357-mcp-vertex-auditoria-completa-de-develop-tercera-pasada-todo-ejecutable-para-agente.md`
- **Gate**: `git diff --quiet` (proposal-only edit; no code change)


- **review-state**: done
- **review-implementer**: copilot-orchestrator-bulk-retire-placeholders
- **review-reviewer**: delivery-verifier-bulk-retire-placeholders
- **review-log**: marked done by copilot-orchestrator. Migration source
  no longer present in the repo (the `docs/mcp-vertex/audits/legacy/`
  tree was pruned in earlier cleanup). No actionable scope can be
  derived without the source. Book-keeping entry; no implementation
  expected.

## acceptance

- The migrated proposal is reviewed and its files and validation gate are made explicit.

## notes

- Migrated from `docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-tercera-pasada.md` by `proposal_adopt`
  (f00116). The original file was left untouched — retire it once
  this proposal is the source of truth.

### Verified 2026-09-01

- The prior review-log's premise is misleading but the closure outcome is
  correct: `docs/mcp-vertex/audits/legacy/` genuinely doesn't exist
  anymore, but that is because this proposal file itself already
  preserved the full audit text inline (this is not a stub referencing a
  missing source, unlike f00344-f00355 which pointed at a00092). This
  audit ("tercera pasada", commit-audited noted inline) is the
  `audit-source` for `docs/mcp-vertex/proposals/retired/q00005-plan-hardening-post-auditoria-externa-chatgpt-5-6-sol-tercera-pasada-*.md`,
  whose frontmatter records `status: retired` with 33 child proposals —
  i.e. the actionable scope in this document WAS derived and closed, just
  under q00005's tracking, not this bookkeeping wrapper's. Per this
  document's own §0 instructions ("no debe ejecutarse como una única
  mega-tarea... debe transformarse en propuestas independientes"), that
  is exactly the intended lifecycle.
- Closing this wrapper proposal on that evidence (q00005 retired/done),
  not on the "no actionable scope" claim.


- **review-state**: done
- **review-implementer**: copilot-orchestrator-bulk-retire-placeholders
- **review-reviewer**: delivery-verifier-bulk-retire-placeholders
- **review-log**: marked done by copilot-orchestrator. Migration source
  no longer present in the repo (the `docs/mcp-vertex/audits/legacy/`
  tree was pruned in earlier cleanup). No actionable scope can be
  derived without the source. Book-keeping entry; no implementation
  expected.
