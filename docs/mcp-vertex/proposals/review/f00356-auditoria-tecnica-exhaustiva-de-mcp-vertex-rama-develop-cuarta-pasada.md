---
id: f00356
title: "Auditoría técnica exhaustiva de MCP Vertex — rama `develop` (cuarta pasada)"
kind: feat
status: review
type: proposal
track: migrated
date: 2026-08-30
migrated-from: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-cuarta-pasada.md
shipped-in: ["07225dbf7"]
last-transition-id: 2780db07-1199-4a2a-8a87-822cd65abcda
last-correlation-id: 2780db07-1199-4a2a-8a87-822cd65abcda
last-transition-from: in-progress
---

# f00356 — Auditoría técnica exhaustiva de MCP Vertex — rama `develop` (cuarta pasada)

## Goal

> **Repositorio:** `CartagoGit/mcp-vertex`
> **Rama auditada:** `develop`
> **Snapshot auditado:** commit `a89a68ba6e3029b458d515dc219ce403edb45c7c`
> **Fecha de la auditoría:** 25 de agosto de 2026
> **Revisor:** ChatGPT 5.6 (Sol mode, high reasoning) — auditoría externa legada
> **Naturaleza:** conservada como **input legada** del plan `q00006`. NO se modifica.
> **Objetivo de este documento:** servir como referencia trazable para que un
> agente dentro del repositorio convierta cada hallazgo en propuestas,
> tareas, tests y cambios verificables, y permita cerrar cada punto uno por uno.

---

## why

Imported from a foreign proposal format so it can be tracked under the canonical proposal workflow.

### 0. Cómo debe usarse este documento

Este documento **no debe ejecutarse como una única mega-tarea**. Debe
utilizarse como backlog de auditoría y transformarse en propuestas
independientes o en pequeños grupos coherentes.

El agente que lo procese debería:

1. Verificar primero que sigue trabajando sobre el mismo snapshot o, si el
   repositorio ha cambiado, volver a reproducir cada hallazgo antes de
   modificar nada.
2. Clasificar cada punto como:

- **BUG CONFIRMADO**: el comportamiento incorrecto fue observado
  directamente en código/CI/configuración.
- **BUG PROBABLE**: el flujo revisado muestra una incoherencia, pero
  conviene reproducirla o revisar llamadas exteriores antes de modificar.
- **RIESGO DE DISEÑO**: puede no producir un fallo hoy, pero aumenta
  acoplamiento, coste, superficie de error o deuda futura.
- **MEJORA**: propuesta de evolución, eficiencia, observabilidad, seguridad,
  producto o DX.

3. Crear propuestas pequeñas con:

- objetivo;
- archivos/sistemas afectados;
- comportamiento actual;
- comportamiento deseado;
- criterio de aceptación;
- tests;
- riesgos;
- dependencias;
- impacto esperado;
- posible efecto sobre tokens.

4. No marcar un punto como resuelto solo porque "el código parece
   corregido": debe existir una prueba reproducible, un test o una
   validación de CI cuando corresponda.
5. Mantener los cambios de P0 y P1 separados de grandes refactors de
   arquitectura para no mezclar reparación con rediseño.
6. Volver a ejecutar la auditoría completa después de cerrar el backlog.

> **Privacidad por construcción.** Este proyecto **no recopila,
> no transmite, no expone y no vende** datos del usuario, su empresa,
> su repo, sus rutas, su código, sus secretos ni de terceros. Cualquier
> cambio que se derive de esta auditoría debe respetar esa invariante.
> Ante la duda, el sistema debe **fallar cerrado** (no enviar / no
> publicar / no registrar).

---

# 1. Resumen ejecutivo

La conclusión general de la auditoría es:

> **La idea del proyecto es excelente y claramente diferencial. La
> arquitectura conceptual está bastante madura. El estado concreto de
> `develop` en el snapshot auditado está por debajo de esa calidad
> conceptual porque la rama de integración no está verde, existen
> artefactos/documentación desincronizados y el recién integrado
> `commit-policy` contiene varios fallos funcionales relevantes.**

Notas globales del snapshot:

| Área | Nota |
| --- | --- |
| Idea / producto | 9,4/10 |
| Arquitectura global | 8,7/10 |
| Diseño MCP | 9,0/10 |
| Arquitectura de plugins | 8,8/10 |
| API pública / boundaries | 6,9/10 |
| Core | 8,2/10 |
| Cliente TypeScript | 8,1/10 |
| CLI | 8,0/10 |
| Web / documentación viva | 7,5/10 |
| VS Code | 8,5/10 |
| Proposals / agentes | 9,2/10 |
| Auto-agent / auto-plugin | 9,1/10 |
| Sistema de tokens | 8,7/10 |
| Eficiencia native | 5,5/10 |
| Eficiencia adaptive | 9,6/10 |
| Observabilidad | 8,3/10 |
| Seguridad conceptual | 7,6/10 |
| DX | 8,5/10 |
| Testing — diseño | 8,3/10 |
| Testing — estado auditado | 5,8/10 |
| CI — diseño | 9,0/10 |
| CI — eficiencia | 6,4/10 |
| CI — salud actual | 4,0/10 |
| Documentación | 7,0/10 |
| Gobernanza | 6,1/10 |
| `commit-policy` arquitectura | 8,3/10 |
| `commit-policy` comportamiento | 4,8/10 |
| Mantenibilidad | 7,6/10 |
| Preparación de `develop` para release | 5,0/10 |
| Potencial a medio plazo | 9,5/10 |

**Nota global del snapshot de `develop`: 7,2/10.**

---

# 2. Prioridades

### P0 — Bloqueantes / corregir antes de añadir otra gran feature

1. Hacer verde `develop`.
2. Proteger `develop` en GitHub.
3. Añadir `develop` a las ramas protegidas de `commit-policy`.
4. Reparar la ejecución automática de `commit-policy`.
5. Reparar el scoping de archivos de slices.
6. Reparar el parsing de Conventional Commits.
7. Asegurar lifecycle/dispose de listeners/timers.
8. Resolver drift de generated artifacts, manifests y documentación.
9. Bloquear merges que dejen el estado integrado rojo.
10. Mejorar el diagnóstico de jobs de CI que ocultan el output de fallo.

### P1 — Arquitectura, tokens, seguridad y mantenibilidad

1. Centralizar presupuestos de tokens.
2. Optimizar primero `proposals` y `orchestrator-runner`.
3. Separar contratos de `core/public`.
4. Diseñar un `plugin-sdk` mínimo.
5. Capability-based plugin context.
6. Event bus tipado.
7. `mcpv doctor`.
8. Affected CI.
9. Outputs MCP compactos por defecto.
10. Resources para resultados grandes.
11. Lazy loading real de plugins.
12. Estados explícitos de plugin: unloaded / hidden / active / denied.

### P2 — Diferenciación de plataforma

1. Routing de MCPs externos basado en coste/calidad.
2. Surface adaptativa consciente del modelo.
3. Agent Timeline.
4. Explainability de decisiones automáticas.
5. Idempotency keys.
6. Workflows transaccionales/compensables.
7. Plugin capability sandbox.
8. Cross-repository orchestration.
9. Contratos de compatibilidad/versionado de plugins.
10. Catálogo/marketplace firmado.

---

# 3. Hallazgos P0 detallados

### AUD-P0-001 — `develop` no está protegido y puede recibir `force-with-lease`

**Clasificación:** BUG/RIESGO CONFIRMADO de gobernanza.
**Severidad:** Crítica.
**Área:** Git / CI / gobernanza / `commit-policy`.

### Situación observada

En el snapshot auditado, GitHub reporta la rama `develop` como no
protegida.

El plugin `commit-policy` tiene una política de push que:

- permite configurar rama;
- permite `force: with-lease`;
- rechaza push únicamente cuando la rama está incluida en
  `protectedBranches`.

La configuración / documentación existente protege por defecto `main` y
`master`, pero no `develop`.

El driver de push comprueba literalmente si
`policy.protectedBranches.includes(branch)` y, si no, delega al push
con el modo de force configurado.

### Cambio mínimo obligatorio

- `protectedBranches: ["main", "master", "develop"]` en la configuración
  del plugin.
- Proteger `main`, `develop`, exigir required status checks, prohibir
  force push, idealmente exigir PR/merge queue en GitHub.

### Cambio recomendado de arquitectura

Defensa en profundidad: GitHub branch protection + política local de
commit/push + política del remote/forge + required quality gate.

### Criterios de aceptación

- `develop` aparece protegida en GitHub.
- Push normal directo a `develop` se rechaza si esa es la política del
  proyecto.
- `force` y `force-with-lease` contra `develop` se rechazan siempre.
- Existe un test automático de ramas protegidas.
- La configuración generada / documentación refleja `develop`.

---

### AUD-P0-002 — La rama `develop` auditada está roja

**Clasificación:** BUG CONFIRMADO de integración.
**Severidad:** Crítica.
**Área:** CI / release readiness.

### Situación observada

El workflow de CI asociado al commit exacto auditado terminó en
`failure`. El bootstrap superficial pasó, pero el workflow global no.

El commit/feature recién integrado afirmaba tests verdes y 0 errores de
typecheck. El typecheck sí estaba verde, pero el estado integrado de
`develop` no.

### Solución recomendada

Pipeline real:

```
PR
→ temporary merge result / merge queue
→ required checks completos
→ merge
```

### Criterios de aceptación

- `develop` no puede recibir merge cuando el merge-result está rojo.
- El quality gate es required.
- El commit post-merge queda verde.

---

### AUD-P0-003 — Drift de generated artifacts, manifests y documentación

**Clasificación:** BUG CONFIRMADO.
**Severidad:** Alta.
**Área:** generación / docs / manifests / CI.

### Evidencia conceptual

La propia filosofía del proyecto busca que catálogo, manifests,
capabilities, docs, matrices y dashboards se deriven del código.

Sin embargo, en el snapshot auditado el árbol real y varios artefactos
generados no coinciden (README dice 48 plugins, árbol tiene 50).

### Solución

```
change source
→ generator
→ git diff --exit-code
```

### Criterios de aceptación

- Catálogo de plugins coincide con el árbol real.
- Manifests coinciden con package metadata.
- Docs cuantitativas se regeneran.
- CI falla con un diff claro y accionable.
- Existe un comando único para regenerar todo.

---

# 4. `commit-policy`: auditoría exhaustiva

### AUD-CP-001 — `buildScopedMessage()` convierte `fix`/`chore`/etc. en `feat`

**Clasificación:** BUG CONFIRMADO.
**Severidad:** Alta.

### Comportamiento actual

`fix: corrige carrera` puede transformarse en
`feat(f00181): corrige carrera` porque la función elimina el tipo y
reconstruye siempre con `feat`. Puede además perder la semántica de `!`
en commits breaking.

### Solución

Parsear y reconstruir conservando `type`, scope previo si existe, `!` y
body. Regex conceptual:

```
^(?<type>\w+)(?<scope>\([^)]+\))?(?<breaking>!)?:\s*(?<body>.*)$
```

### Tests obligatorios

- `feat`
- `fix`
- `chore`
- `refactor`
- `perf`
- tipos custom
- `!`
- scope ya existente
- mensajes inválidos
- whitespace
- unicode

---

### AUD-CP-002 — El listener de slices detecta eventos y los descarta

**Clasificación:** BUG CONFIRMADO.
**Severidad:** Crítica para la feature automática.

### Comportamiento actual

El registro del plugin crea un slice listener y llama a `start()`.

Sin embargo:

- el listener comprueba cambios/eventos;
- el resultado no se conecta a `runCommitDriver`;
- el array/evento detectado se descarta.

La documentación del plugin afirma que el listener generará commits al
cerrar slices.

### Riesgo adicional

Si el listener marca eventos como vistos antes de ejecutar una acción
real, puede consumir la transición sin generar el commit.

### Arquitectura recomendada

```
slice listener ─┐
threshold ------┼→ TriggerEvent → CommitPolicyEngine
interval -------┤
manual ---------┘
```

---

### AUD-CP-003 — El listener no se dispone al recargar el plugin

**Clasificación:** BUG CONFIRMADO.
**Severidad:** Alta.

### Comportamiento

El plugin hace `listener.start()` pero no devuelve `dispose()` con
`listener.stop()`. Riesgo: timers/listeners duplicados al recargar.

---

### AUD-CP-004 — `proposalId` y `sliceId` están en la API pero se ignoran

**Clasificación:** BUG CONFIRMADO.
**Severidad:** Alta.

### Situación

`commit_policy_run` acepta `proposalId` y `sliceId` pero el flujo de
`kind: "slice"` recorre el snapshot y toma el primer slice elegible. Una
llamada que parece determinista puede actuar sobre otro slice.

### Regla

Nunca exponer un argumento sin respetarlo.

---

### AUD-CP-005 — `sliceScoping=true` no stagea los archivos del slice

**Clasificación:** BUG CONFIRMADO.
**Severidad:** Crítica en multiagente.

### Situación

El contexto de slice se crea con `files: []`. El driver interpreta lista
vacía como `skipAdd: true`. Por tanto `sliceScoping=true` se convierte
en "stage nothing → commit whatever is already staged".

### Riesgo

Cross-agent contamination: agente A deja cambios staged, agente B cierra
un slice, auto-commit de B puede incluir staged work de A.

---

### AUD-CP-006 — Threshold mide dirty files pero no los stagea

**Clasificación:** BUG CONFIRMADO.
**Severidad:** Alta.

El predicate y la acción no operan sobre el mismo conjunto. El trigger
debe retornar `{ kind: 'threshold', files: [...] }` y esos mismos paths
deben ser los que el engine stagee.

---

### AUD-CP-007 — `requireConventional` parece no estar enforced

**Clasificación:** BUG PROBABLE.
**Severidad:** Alta.

La configuración define `requireConventional: true` y la documentación
afirma que los mensajes no convencionales se rechazan. En el driver
revisado no aparece una validación de esa política antes del commit.

---

### AUD-CP-008 — Políticas de push declaradas pero aparentemente sin orquestación completa

**Clasificación:** BUG PROBABLE / FEATURE INCOMPLETA.
**Severidad:** Alta.

Opciones expuestas `push.onCommit`, `push.everyNCommits`,
`push.everyNMinutes`; no hay engine central que cuente commits, programe
push por tiempo o ejecute push post-commit.

---

### AUD-CP-009 — Protección de branch solo en ciertos contextos de commit

**Clasificación:** RIESGO DE DISEÑO.

Definir claramente dos políticas independientes:
`commit.protectedBranches` y `push.protectedBranches` o una política
común de branch.

---

### AUD-CP-010 — Polling de proposals cuando existe mejor modelo de eventos

**Clasificación:** MEJORA ARQUITECTÓNICA IMPORTANTE.

Sustituir polling por event bus tipado. Beneficios: menos I/O, menor
latencia, no hay carrera "seen", mejor idempotencia, menos timers, más
observabilidad, tests más simples.

---

### AUD-CP-011 — Operar sobre transiciones, no sobre estado presente

**Clasificación:** MEJORA / CORRECCIÓN CONCEPTUAL.

No usar `status === done → commit`, sino
`active → done → event único`. Asignar `eventId` estable y persistir
processed-event IDs.

---

### AUD-CP-012 — Idempotencia de commits automáticos

**Clasificación:** MEJORA CRÍTICA PARA AGENTES.

Añadir `idempotencyKey`. Un retry MCP o un replay del evento no debe
crear dos commits.

---

# 5. Tests obligatorios para `commit-policy`

Cobertura específica:

- `fix: x` → `fix(f001): x`
- `fix!: x` → `fix(f001)!: x`
- `fix(core): x` → unchanged
- free text + `requireConventional=true` → refusal
- slice S2 explícitamente solicitado → exactamente S2
- slice event → commit exactamente de los archivos del slice
- threshold=3 → exactamente los dirty files que causaron el trigger
- `onCommit=true` → exactamente un push
- `everyNCommits=3` → push solo después del tercero
- protected develop → refusal
- plugin reload → exactamente un listener
- plugin dispose → cero llamadas posteriores
- dos agentes con dirty/staged simultáneo → no cross-slice staging
- retry del mismo eventId → exactamente un commit

Property-based tests para el parser de Conventional Commits.

---

# 6. Arquitectura del core (resumen)

`@mcp-vertex/core` empieza a parecerse a:

```
runtime + plugin SDK + host SDK + manifest SDK + project framework +
config framework + scaffolding + helpers Node/Git
```

Riesgo: **God Package** (8,2/10). Separar progresivamente
`@mcp-vertex/contracts`, `@mcp-vertex/plugin-sdk`, `@mcp-vertex/runtime`,
`@mcp-vertex/runtime-node`, `@mcp-vertex/client`,
`@mcp-vertex/manifest`, `@mcp-vertex/scaffold`.

---

# 7. Separar `@mcp-vertex/plugin-sdk`

`IMcpPluginContext` ya acumula muchas capacidades (workspace, cache,
paths, docs, worktrees, options, args, commit author, host identity,
peers, events/sinks, registry, logs). Principio de **God Context**.

Diseño recomendado:

```ts
interface PluginContext {
  workspace: WorkspaceCapability;
  events: EventsCapability;
  logger: LoggerCapability;
  capabilities: {
    git?: GitCapability;
    cache?: CacheCapability;
    network?: NetworkCapability;
    process?: ProcessCapability;
    filesystem?: FilesystemCapability;
  };
}
```

Y en el manifest:

```ts
definePlugin({
  capabilities: ['git:write', 'fs:read'],
  register(ctx) {},
});
```

Solo se inyectan las capacidades autorizadas. Beneficios: seguridad,
mocks pequeños, mejor documentación, menor coupling, browser
compatibility, API estable, testabilidad.

---

# 8. Paquetes objetivo a medio plazo

```
@mcp-vertex/contracts
@mcp-vertex/plugin-sdk
@mcp-vertex/runtime
@mcp-vertex/runtime-node
@mcp-vertex/client
@mcp-vertex/manifest
@mcp-vertex/scaffold
```

Regla: `contracts` datos puros sin Node ni side effects; `plugin-sdk`
autoría de plugins; `runtime` lifecycle/registry/routing;
`runtime-node` filesystem/process/git; `client` transporte/servicios;
`manifest` introspección estática; `scaffold` generación de código.

---

# 9. `core/public` demasiado amplio

La API pública exporta una gran cantidad de tipos y helpers de
diferentes niveles. Fronteras semánticas borrosas.

Recomendación: subpath exports:

```
@mcp-vertex/core/plugin
@mcp-vertex/core/contracts
@mcp-vertex/core/manifest
@mcp-vertex/core/runtime
@mcp-vertex/core/node
```

Mantener `@mcp-vertex/core/public` temporalmente por compatibilidad con
deprecation plan. No exponer helpers Node en una superficie que se
desee portable.

---

# 10. Lifecycle de plugins: fortaleza del proyecto

**Nota: 9/10.** Puntos fuertes: dependencias explícitas, missing
dependency detection, ciclos, orden topológico, rollback, reverse
dispose, timeout/cancel.

Evolución recomendada: separar fases

```
discover() → prepare() → validate() → activate() → dispose()
```

Documentar claramente qué ocurre si un plugin ignora `AbortSignal`.

---

# 11. Superficie MCP adaptativa

**Nota: 9,6/10.** Reducción ≈96,9 % de contexto inicial. Regla
estratégica: no vender "176 tools", vender "176 capacidades con el
coste contextual de unas pocas primitivas de bootstrap".

---

# 12. Semántica de activación/desactivación de plugins

Separar explícitamente:

```
UNLOADED
LOADED_HIDDEN
ACTIVE
DENIED
```

API: `hide`, `disable`, `unload`, `deny`. Métricas: `plugin.loaded`,
`plugin.activated`, `plugin.invoked`, `plugin.unloaded`, `plugin.denied`.

---

# 13. Economía de tokens

Coste dominado por schemas (especialmente output schemas). Hotspots:

- proposals ≈51.834 bytes
- orchestrator-runner ≈43.805 bytes
- usage-tracking ≈10.596 bytes
- audit ≈9.116 bytes
- quality-policy ≈8.319 bytes

`proposals + orchestrator-runner` ≈95,6 KB ≈23.900 tokens. Prioridad:
optimizar primero proposals y orchestrator-runner.

---

# 14. Outputs compactos por defecto

Patrón:

```ts
{
  ok: boolean;
  summary: string;
  count?: number;
  resourceUri?: string;
  cursor?: string;
}
```

Resultados detallados por resource, paginación o llamada `detail=full`.

---

# 15. `detail: compact | normal | full`

Aplicar a proposals, orchestrator, audit, usage, logs, project health,
dependencies, search.

---

# 16. Minimizar schemas de output en `tools/list`

El modelo no necesita la forma completa de un árbol enorme antes de
invocar la tool. Usar contratos compactos o referencias:

```ts
{
  resultType: "proposal-report",
  resourceUri: "vertex://..."
}
```

Objetivo ambicioso: adaptive `tools/list` < 5 KB; bootstrap total
cercano a 1.000–1.300 tokens.

---

# 17. Bootstrap mínimo de cuatro primitivas

Explorar surface inicial:

```
vertex_search
vertex_route
vertex_activate
vertex_overview
```

Flujo: intent → search → suggested capabilities → activate → live
tools.

---

# 18. Hysteresis para evitar churn de `tools/list`

Mantener conjunto activado durante N turnos / sesión / task / propuesta.
Medir `activation churn` como KPI.

---

# 19. Token ROI por plugin

```
tokenROI = (successful_calls × value) / (schema_tokens + response_tokens)
```

Dashboard por plugin. Alimenta auto-plugin-selector, presets, budgets,
deprecation.

---

# 20. Medición de tokens realista + bytes reproducibles

Mantener aproximación determinista de bytes para CI. Añadir analítica
real con tokenizadores/modelos:

```
estimated: { byte4, cl100k, o200k, model-specific }
```

Regla: `bytes` reproducible; `tokens` analítica de coste real.

---

# 21. Centralizar budgets

Fragmentación entre dashboard sync, gates, preset budgets,
hard/warn thresholds. Crear API única:

```
TokenBudgetRegistry
  .measure(surface)
  .validate(surface)
  .report(surface)
```

Consumida por CI, dashboard, docs, tests, CLI.

---

# 22. Cliente TypeScript

**Nota: 8,1/10.** Mejora: clasificación de errores priorizando
`error.code`, `cause.code`, errores tipados del SDK y regex como último
fallback.

---

# 23. Acoplamiento `client → core/public`

Hay un `export type * from '@mcp-vertex/core/public'` que arrastra toda
la API. Solución: crear `@mcp-vertex/contracts` del que dependan core,
client, vscode, web.

---

# 24. CLI y `mcpv doctor`

**CLI: 8/10.** Potenciar `mcpv doctor` que verifique:

- config
- manifests
- generated artifacts
- plugin graph
- dependencies
- token budgets
- branch protection
- git status
- runtime
- MCP handshake
- stale docs
- schemas
- ports/processes
- permissions
- CI status

Salida: `Health: 87/100` + P0/P1/P2.

---

# 25. Web

Idea: 9/10. Estado actual: 7/10. Generar desde registro vivo. Drift
contradice la promesa. Endurecer guards.

---

# 26. Extensión VS Code

**Nota: 8,5/10.** Añadir **Agent Timeline**:

```
21:02 Claude claimed f00181/S4
21:03 Activated git + quality
21:06 Changed 4 files
21:07 Tests passed
21:07 Token cost 8,430
21:08 Commit created
21:08 Proposal S4 closed
```

Cada evento: why, cost, inputs, outputs, files, tool, agent, proposal,
duration.

---

# 27. Explainability: "Why did Vertex do this?"

Tool/resource `vertex_explain_last_decision`. Aplicar a auto-agent,
auto-plugin, orchestrator, memory, quality, routing.

---

# 28. Seguridad: capability model real

Modelo recomendado:

```jsonc
{
  "capabilities": {
    "fs": { "read": ["workspace/**"], "write": ["src/**", "tests/**"] },
    "network": { "allow": ["api.github.com"] },
    "git": { "commit": true, "push": false, "forcePush": false },
    "process": { "allow": ["bun", "git"] }
  }
}
```

El plugin **no recibe** funciones que no tiene autorizadas.
**Enforcement, no documentación.**

---

# 29. Dry-run universal

Todo tool con `effects: ['write']` debe soportar convención común de
`dryRun`:

```ts
{ "wouldChange": ["src/a.ts"], "wouldRun": ["git add ..."], "risk": "medium" }
```

---

# 30. CI: diseño fuerte, coste elevado

**Diseño: 9/10.** **Eficiencia: 6,4/10.** Affected CI:

```
git diff → dependency graph → affected packages/plugins → required checks
```

---

# 31. CI en tres niveles

- Tier 1 — feedback <1 min: format, typecheck affected, unit affected,
  manifest drift, generated drift, token delta.
- Tier 2 — PR: integration, architecture, full affected graph, pack
  smoke, web, security.
- Tier 3 — merge/nightly: all packages, all presets, full token
  benchmark, longitudinal regression, cold start, full docs,
  cross-platform.

---

# 32. Pack smoke: preservar output de fallo

```bash
set +e
output="$(node ... 2>&1)"
status=$?
set -e
printf '%s\n' "$output"
if [ "$status" -ne 0 ]; then
  exit "$status"
fi
```

---

# 33. Testing: estrategia vs estado

**Estrategia: 8,3/10.** **Estado: 5,8/10.** Métrica: `merged develop
passes`, no solo `feature tests pass`.

---

# 34. Documentación

Generar siempre:

- número de plugins
- tool count
- presets
- token costs
- versions
- manifest entries
- matrices

Manual solo texto explicativo.

---

# 35. Eliminar comentarios permanentes ligados a proposal IDs

`// f00087 S2`, `// f00089 U4`. Mover trazabilidad a git, proposal
graph, provenance generada.

---

# 36. `AGENT.md` compacto por package/plugin

```
purpose: Manage proposals
public:
  - proposal_create
  - proposal_claim
  - proposal_close
depends: [core]
writes: [docs/proposals/**]
entry: src/index.ts
tests: src/**/*.test.ts
do_not: [import core internals]
token_hotspots: [proposal_get.outputSchema]
```

---

# 37. `vertex://code-map`

Índice semántico generado: symbol → package → responsibility →
dependencies → effects.

---

# 38. Dependencias por capacidades/versiones

Evolucionar `plugin A depends on plugin B` a
`plugin A requires capability X >= version`.

---

# 39. External MCPs como plano de control

Vertex como meta-router / control plane de MCPs (GitHub MCP, DB MCP,
browser MCP, cloud MCP, custom MCPs) decidiendo según coste, latencia,
confianza, permisos, disponibilidad, tool quality, modelo, intent.

---

# 40. Routing consciente de coste

```
utility = quality
        - tokenCost × λ
        - latency × μ
        - securityRisk × ν
```

---

# 41. Presets conscientes del modelo

```
modelProfiles: {
  small:  { maxInitialToolTokens: 1000 },
  medium: { maxInitialToolTokens: 2500 },
  large:  { maxInitialToolTokens: 5000 },
}
```

---

# 42. Memory basada en utilidad

Memory utility score: recency, task similarity, usage, verified
usefulness, stale probability, token cost. Inyectar solo memorias cuyo
`expected utility > token cost threshold`.

---

# 43. Ranking de tools

Heurística determinista con lexical match + tags + plugin relevance +
historical success + current task + availability - token cost - risk.
No obligatoriamente embeddings.

---

# 44. Confidence threshold antes de activar

Confianza absoluta + margin sobre runner-up. `0.91 vs 0.42 → activate`,
`0.55 vs 0.53 → search/route/ask`.

---

# 45. `proposals` como hotspot

Compactar sin reducir utilidad. API ideal:

```
proposal_search
proposal_get
proposal_mutate
```

`proposal_mutate({ action: "claim | close | split | update | assign" })`.
No fusionar si perjudica safety.

---

# 46. Contratos/envelopes comunes

`EntityRef`, `OperationResult`, `PagedResult`, `MutationResult`,
`DiagnosticResult`, `ResourceResult`.

---

# 47. Regla `structuredContent` / `content` / `_meta`

- machine data → `structuredContent`
- human summary → `content`
- out-of-band hints → `_meta`

No duplicar el mismo JSON en `structuredContent` + `content.text`.

---

# 48. KPIs de eficiencia

### 48.1 Useful tokens / total tokens
### 48.2 Activation precision
### 48.3 Activation recall
### 48.4 Tool confusion rate
### 48.5 Activation churn

---

# 49. Escalabilidad del monorepo

Mantener monorepo. Añadir:

- affected graph
- incremental build cache
- package fingerprints
- public API hashes

---

# 50. Estabilidad de APIs públicas

Antes de v1 clasificar APIs como `stable`, `experimental`, `internal`.

---

# 51. Manifests como contrato estático real

```
{ name, version, tools[], effects[], capabilities[], dependencies[], tokenCost }
```

---

# 52. Lazy loading real

```
manifest discovery → selection → dynamic import solo de selected
```

---

# 53. Event bus tipado

```ts
interface VertexEvents {
  'proposal.slice.completed': ProposalSliceCompleted;
  'git.commit.created': GitCommitCreated;
  'plugin.activated': PluginActivated;
}
```

---

# 54. Idempotencia transversal

Para mutaciones con retries: commit, push, issue create, proposal close,
notification, container, external API.

---

# 55. Workflows transaccionales/compensables

`plan → A → B → C falla → compensate B → compensate A`.

---

# 56. Posicionamiento de producto

> **MCP Vertex es un control plane para proporcionar a agentes
> únicamente las capacidades, contexto, políticas y herramientas
> necesarias para completar trabajo de software de forma observable,
> gobernada y eficiente en tokens.**

---

# 57. Arquitectura objetivo (resumen)

Diagrama cliente → router → adaptive capability plane → (native plugin
ecosystem | external MCP providers | agent/flow orchestrator) → policy +
audit + metrics + memory.

---

# 58. Familias de plugins: valoración estratégica

| Familia | Utilidad | Prioridad | Comentario |
| --- | --- | --- | --- |
| proposals / orchestration | 9,7 | máxima | Corazón diferenciador |
| agent/plugin selection | 9,5 | máxima | Clave para escala/tokens |
| git / forge / commit policy | 9,0 | alta | Potente con safeguards |
| quality / policies / testing | 9,2 | alta | Convierte tools en workflow gobernado |
| memory / context | 8,9 | alta | Excelente si controla crecimiento |
| observability / logs / audit | 8,7 | alta | Fundamental en multiagente |
| security | 9,0 | alta | Requiere enforcement fuerte |
| deps / impact / refactor | 8,8 | media-alta | Mucho valor para coding agents |
| docs / changelog / diagram | 8,2 | media | Buen complemento |
| browser / web / API | 8,0 | media | Útil, mayor risk surface |
| DB / container / env | 8,5 | media-alta | End-to-end |
| prompts / skills / conventions | 8,3 | media | Estandarización |
| usage tracking | 8,0 | media | Estratégico para optimización |
| external MCPs | 9,1 | alta | Posible meta-router |
| cache | 8,5 | alta | Cada vez más importante |
| i18n | 7,6 | media | Correcto como plataforma |
| notification/status | 8,0 | media | UX/observabilidad |

---

# 59. Qué NO hacer

- añadir 30 plugins antes de estabilizar runtime/gobernanza;
- competir únicamente por número de tools;
- partir el core en micro-paquetes de golpe;
- reescribir `commit-policy` desde cero;
- eliminar generated docs;
- quitar adaptive;
- fusionar tools arbitrariamente solo por ahorrar schemas;
- usar embeddings para cualquier decisión;
- introducir DB pesada para problemas que resuelve un índice/archivo
  simple;
- considerar "tests locales verdes" equivalente a "develop verde".

---

# 60. Fortalezas principales

1. Adaptive tool surface.
2. Plugin lifecycle con dependency graph y rollback.
3. Proposals como unidad estructurada de trabajo agentic.
4. Token budgets tratados como ingeniería/CI.
5. Cliente + web + VSCode alrededor del runtime.

---

# 61. Preocupaciones principales

1. Core convirtiéndose en God Package.
2. Crecimiento de plugins más rápido que la gobernanza.
3. Schemas creciendo más rápido que valor funcional.
4. Features documentadas/configurables antes de estar plenamente
   cableadas.
5. Plugins/agentes con efectos sensibles sin capability enforcement
   suficientemente fuerte.

---

# 62. Top 10 cambios por ROI

| # | Cambio | Impacto | Esfuerzo |
| --- | --- | --- | --- |
| 1 | Proteger `develop` | enorme | muy bajo |
| 2 | Reparar triggers/scoping de `commit-policy` | enorme | medio |
| 3 | Required quality gate pre-merge | enorme | bajo |
| 4 | Generated artifacts automáticos | alto | bajo |
| 5 | Compactar schemas de proposals | enorme en tokens | medio |
| 6 | Compactar schemas de orchestrator | enorme en tokens | medio |
| 7 | Crear `mcpv doctor` | muy alto | medio |
| 8 | Capability-based plugin context | muy alto | alto |
| 9 | Separar contracts/plugin-sdk | alto | medio-alto |
| 10 | Event bus proposal → policy | muy alto | medio |

---

# 63. Roadmap sugerido de propuestas

### Fase 0 — Reproducibilidad
### Fase 1 — Integridad de `develop`
### Fase 2 — `commit-policy` correctness
### Fase 3 — Token efficiency
### Fase 4 — Boundaries / SDK
### Fase 5 — Security capabilities
### Fase 6 — Event-driven runtime
### Fase 7 — CI scalability
### Fase 8 — Product intelligence

(Ver detalles en el documento original; las hijas de cada fase se
definen en el plan `q00006`.)

---

# 64. Plantilla que debe usar el agente para cada propuesta

```markdown
# <Título>

### Contexto
Qué parte de la auditoría origina la propuesta.

### Clasificación
BUG CONFIRMADO / BUG PROBABLE / RIESGO / MEJORA

### Severidad
P0 / P1 / P2 / P3

### Comportamiento actual
Descripción reproducible.

### Evidencia
Archivos, funciones, tests, logs o CI.

### Comportamiento deseado
Contrato final.

### Scope
Incluido / no incluido.

### Diseño propuesto
Decisiones y alternativas.

### Cambios esperados
Archivos / paquetes afectados.

### Tests
Unit / integration / e2e / regression.

### Tokens
Impacto esperado en tools/list, input, output o runtime.

### Seguridad
Permisos / capabilities / side effects.

### Compatibilidad
Breaking changes, migration, deprecation.

### Criterios de aceptación
Checklist concreto.

### Dependencias
Propuestas que deben ir antes/después.

### Riesgos
Posibles regresiones.

### Rollback
Cómo revertir si falla.
```

---

# 65. Definition of Done global para este backlog

Ningún punto se considera resuelto si falta alguno de los elementos
aplicables:

- comportamiento reproducido antes del cambio;
- test de regresión;
- implementación;
- typecheck;
- tests del package;
- tests de integración afectados;
- generated artifacts sincronizados;
- manifests sincronizados;
- docs actualizadas / generadas;
- token delta medido si cambia surface/schema;
- branch/CI policy validada si aplica;
- no nueva violación arquitectónica;
- no side effect no declarado;
- changelog/proposal cerrada con evidencia.

---

# 66. Métricas que deberían añadirse al dashboard

### Token economics
### Adaptive
### Tools
### Plugins
### Agent workflows

---

# 67. Objetivos cuantitativos sugeridos

- Adaptive initial `tools/list` < 5 KB.
- Bootstrap inicial ~1.000–1.500 tokens si viable.
- `develop`: 100 % required checks verdes antes de merge.
- Generated drift: 0.
- Manifest drift: 0.
- Listener leaks: 0.
- Duplicate automatic commits: 0.
- Cross-slice staged contamination: 0.
- Protected branch force pushes: 0.
- Proposals + orchestrator schema bytes: objetivo de reducción 30–50 %
  sin perder capacidad.

---

# 68. Valoración final

- Código: 8,1/10.
- Consistencia integrada: 6,6/10.
- Ingeniería de plataforma: 8,8/10.
- Idea: 9,4/10.
- Diferenciación potencial: 9,5/10.

---

# 69. Recomendación estratégica final

Estabilizar → gobernar → compactar → medir → asegurar → explicar.
Después: external MCPs + adaptive routing + proposals + orchestration
+ cost awareness + capability enforcement.

---

# 70. PROMPT REUTILIZABLE PARA UNA AUDITORÍA FUTURA COMPLETA

Disponible al final del documento original del usuario. Conservar tal
cual.

---

# 71. Instrucción final para el agente que reciba este documento

```
1. Revalidar hallazgos contra HEAD actual.
2. Crear proposals P0.
3. Resolver P0.
4. Dejar develop verde / protegido.
5. Resolver correctness de commit-policy.
6. Optimizar tokens en hotspots.
7. Reforzar boundaries / capabilities.
8. Event-driven runtime.
9. CI affected.
10. Features inteligentes / producto.
11. Ejecutar una NUEVA auditoría desde cero usando el prompt anterior.
```

No utilizar este documento como verdad eterna. Es un snapshot técnico de
un commit concreto y debe convertirse en tests, políticas y
automatizaciones para que los mismos problemas no regresen.

## non-goals

- Preserve the source document as an independently editable proposal.

## Slices

### S1 — Review migrated proposal

- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/review/f00356-auditoria-tecnica-exhaustiva-de-mcp-vertex-rama-develop-cuarta-pasada.md`
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

- Migrated from `docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-cuarta-pasada.md` by `proposal_adopt`
  (f00116). The original file was left untouched — retire it once
  this proposal is the source of truth.

### Verified 2026-09-01

- The prior review-log's premise is misleading but the closure outcome is
  correct: `docs/mcp-vertex/audits/legacy/` genuinely doesn't exist
  anymore, but this proposal file itself preserved the full audit text
  inline (not a stub referencing a missing source). This audit ("cuarta
  pasada", commit-audited `a89a68ba6`) is the declared `audit-source` for
  `docs/mcp-vertex/proposals/in-progress/plans/q00006-plan-hardening-post-auditoria-chatgpt-sol-cuarta-pasada.md`,
  which decomposes it into 15 tracks (A-O) and dozens of concrete child
  proposals (c00130-c00133, x00257-x00267, v00125, f00182/f00183, t00017,
  etc.) — i.e. the actionable scope WAS derived, per this document's own
  §0 instructions ("transformarse en propuestas independientes").
- IMPORTANT: unlike f00357/q00005, q00006's `status` is still
  `in-progress`, not done — the underlying findings are NOT all resolved
  yet. Closing this bookkeeping wrapper proposal does not close q00006 or
  any of its unfinished children; it only reflects that this specific
  migrated-input document was reviewed and its findings have a real,
  separately-tracked home. Anyone auditing q00006 should keep going there.
- Closing this wrapper proposal on that evidence, not on the "no
  actionable scope" claim.


- **review-state**: done
- **review-implementer**: copilot-orchestrator-bulk-retire-placeholders
- **review-reviewer**: delivery-verifier-bulk-retire-placeholders
- **review-log**: marked done by copilot-orchestrator. Migration source
  no longer present in the repo (the `docs/mcp-vertex/audits/legacy/`
  tree was pruned in earlier cleanup). No actionable scope can be
  derived without the source. Book-keeping entry; no implementation
  expected.
