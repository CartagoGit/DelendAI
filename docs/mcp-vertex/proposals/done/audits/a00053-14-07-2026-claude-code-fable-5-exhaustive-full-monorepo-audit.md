---
id: a00053
kind: audit
title: Auditoría exhaustiva del monorepo — tokens, adopción, hooks, extensión y web
status: done
type: proposal
track: audit
date: 2026-07-14
---

# a00053 — Auditoría exhaustiva del monorepo: tokens, adopción, hooks, extensión y web

## Goal

Auditar cualitativamente el monorepo completo en `d3b77a81` (tras la sesión de
hardening que reactivó los git hooks, armó el gate de métricas y recortó
`agent_catalog` 14 103 B → 2 321 B), con foco en los tres ejes que pidió el
usuario: coste real en tokens para cualquier LLM, ausencia de bloqueos, y
facilidad de instalación/migración para proyectos consumidores.

## Why

Nueve auditorías previas (a00044–a00052) sanearon la mayor parte de la
arquitectura. El valor marginal de esta pasada está en (1) re-verificar los
findings diferidos de a00052 en vez de repetirlos a ciegas, (2) medir payloads
reales contra el workspace vivo (no el sintético del e2e), y (3) recorrer la
historia de adopción de punta a punta (`mcpv init` real en un proyecto limpio,
launch de la extensión, configs de cada IDE).

## Non-goals

- Reescribir subsistemas completos durante la auditoría (se derivan a propuestas).
- Publicar en npm (decisión del usuario con gates propios, 2026-07-07).
- La redecoración visual de las webviews de producción.

## Slices

- global_gate: e2e

### S1 — Audit completed
- **Files**: docs/mcp-vertex/proposals/done/audits/a00053-14-07-2026-claude-code-fable-5-exhaustive-full-monorepo-audit.md
- **Gate**: `bun run validate`
- **Status**: done

## Acceptance

- Estado verificado con números reales de la Fase 0.
- Cada finding con archivo+línea, evidencia, impacto y resolution track.
- Tabla de concurrencia, scan de hard rules 1–10 y scoreboard justificado.
- Propuestas oficiales creadas para todo lo diferido.

## Verified State

| Verificación | Valor |
|---|---|
| HEAD | `d3b77a81` |
| TypeScript LOC (sin specs: core 18.6k; con specs total) | 249 233 |
| Tests | 531 files / 4 465+ pass / 0 fail (`bun run validate` verde end-to-end) |
| Cobertura | Stmts 84.86 % · Branches 71.73 % · Funcs 84.51 % · Lines 86.35 % |
| Biome repo | 0 errors · 3 warnings · 31 infos |
| `bun install` | verde (reparado en esta sesión: antes fallaba en `lefthook install`) |
| Gate de métricas | armado con baseline en `config/metrics-baseline.json` (antes: no-op) |
| `agent_catalog {compact}` real-workspace | 2 321 B (antes 14 103 B) |
| `overview {compact}` real-workspace | 2 278 B |
| `plan_mcp_project {}` real-workspace | **205 963 B (~51k tokens)** |
| `analyze_project {}` real-workspace | 12 933 B (compact: 873 B) |
| `rules_get_rules {}` real-workspace | 12 318 B (sin modo compact) |

Preflight: `bun run validate`, `bun run test:coverage`, `bunx biome ci .`,
`bun run metrics:gate`, medición stdio real de 18 tools contra `--workspace=.`,
y `mcpv init --dry-run` ejecutado en un proyecto consumidor limpio.

### Cobertura cualitativa

| Fase | Qué se leyó/ejecutó | Resultado |
|---|---|---|
| Core | árbol completo de `lib/`, `assemble.ts`, `overview-tool`, `plan-tool`, `analyze-tool`, `scaffold-host`, greps de invariantes | findings 1, 11, 12 |
| Client/CLI | `agent-catalog-service`, `server-args.service`, `host-entry-resolver`, flujo `init` completo (dry-run real) | findings 3, 5 |
| Plugins | greps de invariantes en los 20; engines requeridos del playbook (task-queue 853 LOC, lock-engine 562, sync-registry 650, round-context, continuity, zombie) | findings 9, 13; invariantes limpios |
| Extensión VS Code | `extension.ts` completo (719 líneas), validación de mensajes webview (spot-check `open-settings`), dev pages | findings 3, 8, 10 |
| ui-extension | renderers, componentes con aria, dev entry | findings 7, 8 |
| Web | gates (`check:i18n` 12×166, style-integrity 65 scss+95 astro, content-integrity, astro check 0 err) + pagefind en `Base.astro`/`ToolPage.astro` | verde; 4 hints |
| Tools/scripts | linters (40+), metrics gate, catálogo, hooks; 0 scripts no-TS | findings 2, 6 (resueltos en sesión) |
| Skills | los 20 `bodyPath` del catálogo generado verificados existentes | alineado |

## Findings

### 1. `plan_mcp_project` y `analyze_project` son verbosos por defecto (P0 · tokens)
**File**: [`plan-tool.ts#L143`](packages/core/src/lib/bootstrap/plan-tool.ts#L143), [`analyze-tool.ts#L99`](packages/core/src/lib/bootstrap/analyze-tool.ts#L99)

```typescript
if (args.compact === true)
    return json(compactResult(blueprint, args));
```

**Problem**: el modo compacto existe y funciona (901 B / 873 B) pero es opt-in.
La llamada sin argumentos — la que hace cualquier LLM que descubre el tool —
devuelve 205 963 B (~51k tokens) en `plan_mcp_project` y 12 933 B en
`analyze_project`. a00052 ya midió 213 KB y lo difirió; sigue sin resolver.
**Impact**: una sola llamada ingenua consume un cuarto del contexto de un
modelo de 200k y entierra la conversación. Contradice frontalmente la promesa
"low-token" del proyecto.
**Resolution Track**: Deferred to proposal `x00101` (compact por defecto,
`full: true` opt-in, y presupuesto e2e para ambos).

### 2. Enforcement de git hooks silenciosamente muerto + `bun install` roto (P0 · resuelto en sesión)
**File**: `tools/scripts/install-formatter-hook.script.ts` (eliminado), [`lefthook.yml#L23`](lefthook.yml#L23)

```typescript
// instalador retirado:
copyFileSync(sourceHook, targetHook);      // machacaba el pre-commit de lefthook
const legacyHooks = [join(HOOKS_DIR, 'pre-push'), ...];
unlinkSync(legacy);                        // borraba el pre-push de lefthook
```

**Problem**: el `prepare` instalaba lefthook y acto seguido el instalador del
formatter sobrescribía `pre-commit` y borraba `pre-push` incondicionalmente.
Todos los checks de `lefthook.yml` (incluidos los BLOCKING) llevaban muertos
desde x00088, y el siguiente `lefthook install` fallaba con `pre-commit.old`
residual, rompiendo `bun install`. Además `execSync('git add --', formattable)`
pasaba el array como *options*: los bytes formateados nunca se re-stageaban.
**Impact**: cero enforcement local; pushes directos a develop que debían
bloquearse pasaban; install roto para cualquier clon nuevo.
**Resolution Track**: Resuelto en `5b694899`+`d3b77a81` (lefthook dueño único,
formatter como comando lefthook, `sync-git-hooks.script.ts` de limpieza).

### 3. La extensión VS Code no arranca en un proyecto consumidor (P0 · adopción)
**File**: [`extension.ts#L564`](extensions/vscode/src/extension.ts#L564)

```typescript
const defaults = { command: 'bun', args: ['run', 'mcp-vertex'] } as const;
```

**Problem**: el spawn por defecto asume un script `"mcp-vertex"` en el
`package.json` del workspace. `mcpv init` no añade ese script (escribe
`mcp-vertex.config.json`, `.mcp.json`, `.vscode/mcp.json`, agentes e
instrucciones — verificado con dry-run real), así que en un consumidor recién
inicializado la extensión muere al conectar salvo que el usuario configure
`mcp-vertex.server.command` a mano.
**Impact**: la primera experiencia del IDE en un proyecto adoptante es un
fallo de conexión; contradice "instalación fácil".
**Resolution Track**: Deferred to proposal `x00102` (derivar el default del
mismo launch canónico dual que `.mcp.json`, reutilizando el
`host-entry-resolver` existente).

### 4. Adopción externa bloqueada mientras `@mcp-vertex/cli` no esté en npm (P0 · decisión de usuario)
**File**: [`server-args.service.ts#L199`](packages/cli/src/lib/server-args.service.ts#L199)

```typescript
export const buildCanonicalLaunch = (…) // → bunx --package @mcp-vertex/cli …
```

**Problem**: todo el flujo de adopción (`mcpv init`, docs, configs generadas)
apunta a `bunx --package @mcp-vertex/cli`, que no resuelve porque el paquete no
está publicado. Dentro del repo se dogfoodea el host local (arreglado en
`0625acda` + esta sesión para Codex), pero un consumidor externo no tiene ese
fallback.
**Impact**: hoy nadie fuera de este repo puede adoptar la librería siguiendo
sus propias instrucciones.
**Resolution Track**: gates de publicación ya fijados por el usuario
(2026-07-07): scss + completitud de extensión + toolkit cross-IDE. Recogido en
la propuesta `x00102` como criterio de cierre; la publicación en sí es
decisión del usuario.

### 5. `mcpv init` — "What's next" con pasos erróneos (P1 · adopción)
**File**: [`init-human-summary.service.ts#L223`](packages/cli/src/lib/init/init-human-summary.service.ts#L223)

```typescript
const f = written.find((w) => w.path.includes('/docs/mcp-vertex/proposals/ready/'));
const id = f.path.split('/').pop()?.replace('.md', '') ?? 'f00001';
nextActions.push(`open ${brand(id)} and walk the agent ownership table`);
```

**Problem**: el primer archivo escrito bajo `ready/` es el `.gitkeep`, no la
propuesta de adopción, así que el resumen imprime «open `.gitkeep` and walk
the agent ownership table» (reproducido en dry-run real). Además el paso 2
recomienda `bun run validate` sin comprobar que el consumidor tenga ese
script, y el paso 5 sugiere `bun mcpv scaffold swarm`, que no es un comando
válido (`mcpv` es un binario, no un módulo de bun).
**Impact**: los primeros 60 segundos de un adoptante siguen instrucciones
rotas — exactamente donde más confianza hay que dar.
**Resolution Track**: Deferred to proposal `x00102` (filtrar `.md` no-gitkeep,
condicionar el hint de validate, corregir el comando de scaffold).

### 6. `validate` estaba rojo y el gate de métricas era un no-op (P1 · resuelto en sesión)
**File**: [`self-host-dogfood.script.ts#L100`](tools/scripts/lint/self-host-dogfood.script.ts#L100), [`diff-snapshots.script.ts#L205`](tools/scripts/metrics/diff-snapshots.script.ts#L205)

**Problem**: `lint:self-host-dogfood` y 2 tests de `repo-mcp-config.spec`
esperaban solo la forma `bunx` tras el cambio intencional de `0625acda`;
`@mcp-vertex/conventions` (y otros 4 plugins) no estaban enlazados en
`node_modules` (el CLI dist no cargaba el preset swarm completo); y el gate
longitudinal de métricas se saltaba silenciosamente por falta de baseline.
**Impact**: la "fuente de verdad" de calidad no era verde y el invariante de
presupuesto de tokens no estaba protegido por nada.
**Resolution Track**: Resuelto en `5b694899`+`d3b77a81` (contrato dual de
launch, devDependencies `workspace:*`, baseline versionada en
`config/metrics-baseline.json`, `agent_catalog` trackeado, budget e2e 1450→900).

### 7. aria-labels hardcodeados en inglés en la UI compartida (P2 · i18n/a11y)
**File**: [`toast.ts#L40`](packages/ui-extension/src/components/toast.ts#L40), [`language-picker.ts#L65`](packages/ui-extension/src/components/language-picker.ts#L65)

```typescript
? `<button type="button" class="mcpv-toast__close" aria-label="Close" …
<select class="mcpv-lang-picker__select" data-mcpv-lang aria-label="Language">
```

**Problem**: el paquete tiene un sistema i18n de 12 idiomas y estos labels de
accesibilidad quedan fuera de él.
**Impact**: lectores de pantalla en 11 de los 12 idiomas anuncian controles en
inglés; incumple la regla "i18n completa o no se shippea".
**Resolution Track**: Deferred to proposal `x00103`.

### 8. `docsUrl` 404 hardcodeado por triplicado (P2 · ya en scope de x00100)
**File**: [`dashboard.ts#L94`](extensions/vscode/src/dev/pages/dashboard.ts#L94), [`dashboard.ts#L113`](extensions/vscode/src/dev/pages/dashboard.ts#L113), [`entry.ts#L89`](packages/ui-extension/src/dev/entry.ts#L89)

```typescript
docsUrl: 'https://cartagogit.github.io/mcp-vertex/',
```

**Problem**: tres copias del mismo enlace que hoy devuelve 404.
**Impact**: el dashboard de dev enlaza a una página muerta.
**Resolution Track**: cubierto por `x00100` S2 (constante única) — ejecutar.

### 9. Cobertura de branches al 71.7 % y PARSE_ERROR en el proveedor V8 (P2 · tests)
**File**: salida de `bun run test:coverage` (V8CoverageProvider, `code: 'PARSE_ERROR', id: undefined`)

**Problem**: los branches quedan 13 puntos por debajo de statements (84.9 %),
con el grueso del riesgo en ramas de error de engines de concurrencia
(`agent-lock-engine.ts`: 562 LOC / 1 spec de 238 líneas). Además un archivo no
cubierto revienta el parser del coverage y ensucia cada corrida.
**Impact**: las ramas de recuperación (las que corren cuando algo ya va mal)
son las menos testeadas; el PARSE_ERROR entrena a ignorar el output.
**Resolution Track**: Deferred to proposal `t00002`.

### 10. x00100 (dev preview de la extensión) con S1–S3 pendientes (P2 · trabajo conocido)
**File**: [`x00100…md`](docs/mcp-vertex/proposals/in-progress/x00100-vs-code-extension-dev-preview-overhaul-perf-styles-i18n-metrics-dead-links.md)

**Problem**: builds frías por sección, ?lang que no aplica a todas las páginas,
página de métricas rota y el 404 del finding 8. Parte de S1 ya avanzó
(`6433fa2e` pool de clientes MCP por cwd) pero el archivo no lo refleja.
**Impact**: la preview de desarrollo — el escaparate de la extensión — es lenta
y se ve rota.
**Resolution Track**: ejecutar `x00100` (siguiente trabajo de extensión).

### 11. `TOKEN-BUDGETS.md` desactualizado respecto a los gates reales (P3 · docs)
**File**: [`TOKEN-BUDGETS.md#L20`](docs/mcp-vertex/TOKEN-BUDGETS.md#L20)

**Problem**: la tabla "Enforced budgets" dice `overview compact 2 100` cuando
el e2e ya exige `1 200`, no lista `agent_catalog` (budget nuevo: 900), y la
sección "Full Preset Scaling" pre-data el recorte de esta sesión.
**Impact**: el documento que "demuestra" la promesa low-token contradice al
código que la exige.
**Resolution Track**: Deferred to proposal `x00101` (refrescar junto al cambio
de defaults).

### 12. `assemble.ts` con 1 335 líneas (P3 · mantenibilidad)
**File**: [`assemble.ts#L1`](packages/core/src/lib/cli/assemble.ts#L1)

**Problem**: 2.6× el umbral de refactor del playbook (500); mezcla ensamblado
de config, wiring de presets y composición de tools.
**Impact**: cada cambio de CLI toca un archivo gigante con radio de explosión
amplio.
**Resolution Track**: Deferred to proposal `r00009` (split por concern, sin
cambio de comportamiento).

### 13. Higiene de invariantes: limpio (informativo)

Verificado por grep+lectura sobre los 20 plugins y el core: 0 `process.cwd()`
en engines (solo la plantilla del entry point generado, que es el lugar
permitido), 0 `writeFile` durables fuera de `writeFileAtomic` (33 archivos lo
usan), 0 `@ts-ignore`, 0 `console.log` de producción, `redactSecrets` presente
en memoria y proposals, 0 scripts no-TS en `tools/`, y los 20 `bodyPath` de
skills existen. Los watchers de notification serializan ticks y `await_lock`
es event-driven: sin busy-wait en hot paths.

## Concurrencia

| Escenario | Riesgo | Mitigación | Gap |
|---|---|---|---|
| Dos agentes escriben `index.json` a la vez | JSON roto | `withFileMutex` + `writeFileAtomic` en `sync-proposal-registry.ts` | ✅ |
| Agente muere a mitad de escritura del lock | `agents.lock.json` corrupto | `writeFileAtomic` + `quarantineCorruptFile` en `agent-lock-engine.ts` | ✅ |
| Lector de logs lee mientras el writer escribe | lectura rota | JSONL append-only; `logs_tail` tolera línea final parcial | ✅ (verificado en watcher; el parser de tail no se auditó línea a línea) |
| Dos `enqueue` simultáneos al task queue | duplicado por taskId | dedupe del writer (fix previo, memoria de sesión) + mutex | ✅ |
| Formatter re-stagea mientras otro hook toca el index | index.lock contention | comandos lefthook advisory con `\|\| true`; solo el formatter escribe el index | ✅ |

## Hard rules 1–10

| Regla | Estado |
|---|---|
| 1. Core agnóstico (sin imports de plugins) | ✅ `lint:cli-imports` 0 violaciones |
| 2. Sin `process.cwd()` en engines | ✅ (finding 13) |
| 3. Sin `*Sync` en hot paths | ✅ (3 hits, todos boot-time) |
| 4. Writes durables por primitivas | ✅ (33 archivos con `writeFileAtomic`) |
| 5. Contención de paths (`resolveWorkspaceContained`) | ✅ en superficies con path input |
| 6. `redactSecrets` antes de persistir | ✅ memoria + proposals |
| 7. Presupuesto de tokens protegido | ⚠️ ahora sí hay gate armado, pero el finding 1 (plan/analyze default) lo incumple de facto |
| 8. `outputSchema` en todo tool público | ✅ (2 `catchall`, documentados) |
| 9. i18n completa en web | ✅ gates verdes · ⚠️ finding 7 en ui-extension |
| 10. `tools/`/`scripts/` solo TS | ✅ |

## Scoreboard

| Dimensión | Score | Justificación |
|---|---:|---|
| Arquitectura / SOLID | 8.0 | límites de plugin limpios y contratos inyectados; `assemble.ts` gigante (f12) |
| Contratos / modularidad | 8.0 | outputSchema universal, SDK generado; duality de launch ahora explícita |
| Seguridad | 7.5 | mensajes webview validados, redacción de secretos; sin P0 nuevos |
| Concurrencia / durabilidad | 8.0 | primitivas correctas y adoptadas; branches de error poco testeadas (f9) |
| Eficiencia de tokens | 5.5 | orientación ya lean (catalog 2.3 KB) y gate armado, pero `plan` a 206 KB por defecto es un P0 vivo (f1) |
| Portabilidad / adopción | 5.0 | init completo pero con pasos rotos (f5), extensión no arranca en consumidores (f3), npm sin publicar (f4) |
| UI / accesibilidad / i18n | 7.0 | 12 idiomas en web+ide verdes; aria-labels EN (f7), dev preview pendiente (f10) |
| Tests | 8.0 | 4 465 verdes, e2e de protocolo y budgets; branches 71.7 % y PARSE_ERROR (f9) |
| Documentación / skills | 7.5 | bootstrap canónico fuerte, skills alineadas; TOKEN-BUDGETS.md desfasado (f11) |

**Overall: 7.2/10.** El runtime y las primitivas están sólidos y la higiene de
invariantes es de las mejores que puede mostrar un monorepo de este tamaño; lo
que separa esto de un 10 no es el motor sino la puerta de entrada: dos defaults
verbosos que traicionan la promesa low-token, y una historia de adopción que
solo funciona dentro del propio repo. Ambas cosas son acotadas y ejecutables.

## Propuestas derivadas

| Propuesta | Contenido | Prioridad |
|---|---|---|
| `x00101` | Token-lean por defecto: `plan_mcp_project`/`analyze_project` compact-first + `rules_get_rules` compact + budgets e2e + refresh TOKEN-BUDGETS.md | P0 |
| `x00102` | Adopción out-of-the-box: default spawn de la extensión vía launch canónico dual, fixes del "What's next" de init, smoke de consumidor extendido | P0/P1 |
| `x00103` | i18n de aria-labels en ui-extension (toast, language-picker y barrido) | P2 |
| `t00002` | Cobertura de branches en engines de concurrencia + fix del PARSE_ERROR de coverage | P2 |
| `r00009` | Split de `assemble.ts` por concern (sin cambio de comportamiento) | P3 |
| `x00100` | (existente) dev preview S1–S3 — siguiente trabajo de extensión | P2 |
