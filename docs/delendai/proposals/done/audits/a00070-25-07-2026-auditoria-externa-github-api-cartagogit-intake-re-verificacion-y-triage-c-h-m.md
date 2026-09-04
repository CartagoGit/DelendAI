---
id: a00070
kind: audit
title: "25-07-2026 · Auditoría externa GitHub-API (CartagoGit) — intake, re-verificación y triage C/H/M"
status: done
date: 2026-07-25T22:00:00Z
track: security+release+architecture+ci+invariants
related:
    - a00068 # última auditoría exhaustiva interna con recomendaciones
    - a00066 # auditoría general antigravity
    - a00069 # multi-agent branch state (in-progress en paralelo)
author: copilot-grok-4.5 (orchestrator) — intake del informe externo
mode: external-intake + live re-verify
source_commit_claimed: 048f88a7051fac32a89918e20d94bb6bba95a103
source_branch_claimed: main
closed-by: cartago (intake 2026-07-25, restored 2026-07-26)
closed-evidence:
  - C-01, C-02, C-03 confirmed via live re-verification
  - x00072/x00073/x00152 fix proposals carry the closed-evidence
shipped-in:
  - daab5199 # intake commit
  - 4dc01795 # x00072/x00073/x00152 follow-ups
  - 32c30d3a # x00072 SEC-001 S1
  - fd0edcb7 # x00152 REL-001 S1
  - 759b7c6f # x00073 SEC-002 S3
---

# 25-07-2026 · Auditoría externa GitHub-API — intake y triage — `@mcp-vertex/core`

> **Documento independiente (intake).** Un revisor externo analizó
> `CartagoGit/mcp-vertex` vía API de GitHub (sin clonar ni ejecutar
> `bun`/`validate`/Vitest/CodeQL). Este archivo **ingesta** ese informe en el
> formato canónico de auditorías del monorepo, **re-verifica** cada hallazgo
> crítico/alto contra el HEAD local de `develop`, y deja **tracks de
> resolución** listos para spawnear propuestas `x`/`i`/`f`.
>
> HEAD local de re-verificación: `4710d2a4` (`develop`).
> Commit reclamado por el auditor externo: `048f88a7` (`main`).
> Revisor intake: `copilot-grok-4.5` (orchestrator).
> Método del externo: estático vía GitHub API — **sin** ejecución dinámica.
> Método del intake: lectura de código live + citas `file:line`.

---

## Goal

1. Registrar la auditoría externa completa (3 críticos, 9 altos, 14 medios) en
   el sistema de propuestas.
2. Re-verificar cada C/H contra el árbol actual y etiquetar
   `CONFIRMADO` / `PARCIAL` / `STALE` / `NO_REPRO`.
3. Mapear issues SEC/REL/CORE/CI/NET/STATE a tracks accionables.
4. **No implementar fixes aquí** — solo intake + triage.

**Veredicto de intake (una frase):** los tres críticos del informe externo
siguen **CONFIRMADOS** en `develop@4710d2a4`; la madurez sigue siendo beta
avanzada para workspaces de confianza, no lista para repositorios no confiables
ni MCP externos en producción hasta cerrar SEC-001/002 y REL-001.

## why

El usuario pegó una auditoría externa extensa y pidió (a) crear la propuesta de
auditoría al estilo del proyecto y (b) una auditoría propia completa (ver
`a00071`). Separar intake (a00070) de la auditoría interna independiente
(a00071) evita mezclar evidencia de dos revisores y permite
`audit_consolidate` posterior.

## non-goals

- No implementar remediaciones (ni Phase 0 bloqueos de release más allá del
  registro).
- No invalidar `a00066`/`a00068`.
- No certificar cobertura dinámica que el externo no ejecutó; el intake solo
  re-lee código.
- No spawnear automáticamente las 9 issues — se listan como tracks.

## Slices

- global_gate: lint

### S1 — Registro canónico + triage C/H re-verificado

- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/review/a00070-25-07-2026-external-github-api-security-release-audit-intake.md`
- **Gate**: lint
- acceptance:
  - "Frontmatter kind:audit canónico"
  - "Verified state con HEAD develop"
  - "Cada C/H con estado CONFIRMADO|PARCIAL|STALE y file:line live"
  - "Scoreboard del externo preservado + nota de re-verificación"
  - "Tracks SEC/REL/CORE/CI/NET/STATE listados"
- review-state: done
- review-implementer: copilot-grok-4.5
- review-reviewer: copilot-minimax-m3
- review-log: approved by copilot-minimax-m3 — External-audit-intake re-verification complete. Each C/H finding has live file:line evidence; scoreboard preserved with annotation.
## acceptance

- Findings C/H con evidencia live `file:line`.
- Tabla de triage completa.
- Scoreboard justificado (el del externo, anotado).
- `bun run lint:proposals` acepta el scaffold.

---

## Verified state

| Paso | Comando / Verificación | Resultado |
|---|---|---|
| 1 | `git rev-parse HEAD` (worktree intake) | `4710d2a4fc7c80296a5462a7d517a7de103f3c35` |
| 2 | `git log -1 --oneline` | `fix(a00069): S8 state_health claim/release imbalance gate` |
| 3 | `git branch` | `develop` / `agent/copilot-audit-intake` |
| 4 | LOC `*.ts` (packages/plugins/extensions/apps/tools) | ~92 501 |
| 5 | Plugins en `plugins/` | 29 (incl. `external-mcps`, `security`, `web-fetch`) |
| 6 | `bun.lock` | presente |
| 7 | Typecheck sample | `tsc --noEmit` exit 0 en pasada previa de sesión |
| 8 | Biome sample (3 paths críticos) | verde |
| 9 | Suite completa / `bun run validate` | **no re-ejecutada en este intake** (Scope A + triage) |
| 10 | Auditor externo ejecutó validate/tests? | **No** (limitación declarada §1 del informe) |

---

### Resumen del informe externo (preservado)

### Evaluación global (externo)

| Área | Nota | Evaluación |
|---|---:|---|
| Arquitectura y modularidad | 8,1/10 | Buena separación, contratos claros |
| TypeScript y contratos | 8,5/10 | strict + Zod |
| Calidad y pruebas | 7,6/10 | CI no ejecuta validate completo |
| Seguridad | 5,2/10 | Fronteras VS Code / env / paths |
| CI/CD y publicación | 5,8/10 | workspace:* + radio de impacto |
| Rendimiento y resiliencia | 6,8/10 | cancelación / budgets incompletos |
| Mantenibilidad | 7,4/10 | SOLID bueno; complejidad crece |
| Documentación ↔ código | 6,4/10 | deriva y narrativa histórica |

**Madurez recomendada (externo):** beta avanzada para trust; no abrir untrusted
ni external MCP hasta cerrar críticos.

### Aspectos bien resueltos (externo, §7) — aceptados

Escrituras atómicas, mutexes, cuarentena, effects metadata, defaults de gasto
conservadores, CSP central + escaping, smoke de tarballs, release order
centralizado, overview/catálogo, TypeScript estricto.

---

## Findings

### C-01 — Ejecución de código al abrir workspace VS Code — **CONFIRMADO**

**Severidad:** crítica · **Área:** extensions/vscode · **Track:** SEC-001

**Evidencia live:**

```json
// extensions/vscode/package.json L21-L23
"activationEvents": [
  "workspaceContains:**/mcp-vertex.config.json"
],
```

```typescript
// extensions/vscode/src/extension.ts L208-L233 (activate → createDefaultClient)
export const activate = async (context, deps = {}) => {
  // ...
  client = await (deps.createClient ?? createDefaultClient)(vscode);
```

```typescript
// extensions/vscode/src/extension.ts L617-L675
// lee <workspace>/.mcp.json → command/args controlados por el repo
// createDefaultClient → McpStdioClient.connect({ command, args, cwd })
```

No hay `vscode.workspace.isTrusted`, ni
`capabilities.untrustedWorkspaces.supported: false`, ni diálogo de aprobación
con huella del comando.

**Impacto:** repo malicioso con `mcp-vertex.config.json` + `.mcp.json` ejecuta
binario al abrir.

**Remediación (externo, obligatoria):** trust gate, aprobación explícita,
huella, separar discover vs start, tests integración.

---

### C-02 — MCP externos heredan `process.env` completo — **CONFIRMADO**

**Severidad:** crítica · **Área:** plugins/external-mcps · **Track:** SEC-002

**Evidencia live:**

```typescript
// plugins/external-mcps/src/lib/subprocess/server-registry.ts ~L83-L86
const child = spawn(command, [...args], {
  stdio: ['pipe', 'pipe', 'pipe'],
  ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
  ...(options.env !== undefined ? { env: { ...options.env } } : {}),
});
```

```typescript
// ensureBooted / createChildTransport ~L161
const child = options.spawner(command, args, { cwd: options.cwd });
// ← no pasa env filtrado desde entry.env
```

```typescript
// options-schema.ts ~L121 — documenta env como nombres permitidos
env: z.array(EnvVarNameSchema).optional(),
```

Si `env` se omite, Node hereda `process.env` completo. El contrato sugiere
allow-list; el runtime no la aplica en `ensureBooted`.

**Remediación:** entorno mínimo desde cero + PATH/TMP/HOME + entry.env;
fallar si falta requerida; test con secreto señuelo.

---

### C-03 — `npm publish` sin reescribir `workspace:*` — **CONFIRMADO**

**Severidad:** crítica release / alta runtime · **Área:** release/smoke · **Track:** REL-001

**Evidencia live:**

```typescript
// tools/scripts/release/release.script.ts L17-L29 (comentario del propio driver)
// bun publish rewrites workspace:*; npm publish does NOT
```

```typescript
// publishAll — solo `run(tool, ['publish'|...], dir)` sin rewrite previo
```

```typescript
// tools/scripts/smoke/pack.script.ts L127-L167
// packWithResolvedWorkspaceDeps reescribe temporalmente y restaura en finally
```

```text
packages/client/package.json + packages/cli/package.json → dependencies workspace:*
```

Smoke prueba artefacto distinto al que publica `--tool=npm`.

**Remediación:** función única `resolveWorkspaceDependenciesForPublish`;
publicar tarballs verificados; bloquear npm path hasta cerrar.

---

### Triage live — Altos

| ID | Título | Estado live | Evidencia / nota | Track |
|---|---|---|---|---|
| H-01 | Loader plugins: factory antes de validar; Promise.race sin cancel; dependsOn sin DAG; sin dispose | **CONFIRMADO** | `load-plugins.ts` withTimeout/Promise.race; checkPluginDependencies post-import | CORE-001 |
| H-02 | Contención léxica sin realpath (symlink escape) | **CONFIRMADO** | `contain-path.ts` documenta explícitamente "no realpath" | SEC-003 |
| H-03 | `docs_read` no exige roots/extensiones del catálogo | **CONFIRMADO** | `readDoc` solo `resolveWorkspaceContained` + readFile; no filtra roots/ext | SEC-docs |
| H-04 | security: cwd, OSV versión declarada, Promise.all, errores→[], severity exacta | **CONFIRMADO** (muestra OSV) | `osv.ts` catch→`[]`; sin lockfile resuelto en query | SEC-004 |
| H-05 | version pin MCP externo decorativo; llmDecidesActivation débil | **PARCIAL** | schema exige version; no hay validador de ejecutor en ensureBooted | SEC-002b |
| H-06 | CI no corre `bun run validate` completo | **PARCIAL / matizado** | `ci.yml` tiene jobs lint/typecheck/test:coverage/build/pack-smoke — no el script monolítico `validate` | CI-001 |
| H-07 | Release auto: NPM_TOKEN estático, actions por tag, blast radius | **CONFIRMADO** (workflow) | `.github/workflows/release.yml` | REL-002 |
| H-08 | Runners de comando duplicados; cancelación incompleta | **CONFIRMADO** (arquitectura) | `run-command.ts` + quality runner | CORE-005 |
| H-09 | `env_check` rutas absolutas sin contención | **CONFIRMADO** | `real-deps.ts` L12-15: `isAbsolute ? path : join(root, path)` | SEC-009 |

---

### Medios (M-01 … M-14) — resumen de intake

Se aceptan como backlog sin re-prueba línea a línea en este slice:

| ID | Tema | Track sugerido |
|---|---|---|
| M-01 | search rg vs walker | SEARCH-001 |
| M-02 | web-fetch SSRF incompleto | NET-001 |
| M-03 | state durable bajo `.cache` | STATE-001 |
| M-04 | cache sizeOf / custom rules | CACHE-001 |
| M-05 | isAgentStuck last-wins | CORE-006 |
| M-06 | peerPlugins vacío durante register | CORE-001 |
| M-07 | client MCP sin timeout/Zod responses | CLIENT-001 |
| M-08 | args VS Code split whitespace | IDE-002 |
| M-09 | retentionDays sin bounds | LOGS-001 |
| M-10 | logs capturan args/results amplios | LOGS-002 |
| M-11 | CSP unsafe-inline | IDE-003 / SEC-CSP |
| M-12 | toolchain TS drift | CHORE-toolchain |
| M-13 | CodeQL sin develop | CI-002 |
| M-14 | base branch `develop` hardcode | PROP-base |

---

### Plan de remediación (externo §8) — prioridad intake

### Fase 0 — bloqueo preventivo

1. No auto-start comando en untrusted (C-01).
2. Desactivar external-mcps en prod hasta SEC-002.
3. Pausar release `--tool=npm` hasta REL-001.
4. Rotar NPM_TOKEN si hay duda.

### Fase 1 — 24–72 h

C-01, C-02, C-03 + tests regresión; contener env/SAST cwd; OSV incomplete≠clean;
paridad validate/CI.

### Fase 2–3

Loader v2, realpath, runner único, SSRF, stateDir, permisos por effects, fuzzing.

---

### Issues recomendadas (mapeo)

| Issue | Aceptación mínima |
|---|---|
| **SEC-001** | ningún spawn workspace-controlled si `!isTrusted`; huella; tests |
| **SEC-002** | secreto señuelo ausente en hijo; solo allow-list; fail-closed missing env |
| **REL-001** | mismo artefacto smoke+publish; 0 `workspace:` en tarball |
| **CORE-001** | DAG+ciclos+dispose+AbortSignal+rollback |
| **SEC-003** | symlink out no lee/escribe/borra |
| **SEC-004** | lockfile real, concurrency limit, severity threshold, errors visibles |
| **NET-001** | bloqueo loopback/RFC1918/link-local/metadata/DNS rebind |
| **CI-001** | cada gate de `validate` representado o job monolítico requerido |
| **STATE-001** | memory/logs/usage fuera de cache limpieable |

---

## Scoreboard

| Dimensión | Externo | Intake (develop@4710d2a4) | Nota |
|---|---:|---:|---|
| Arquitectura | 8,1 | 8,0 | confirma loader/lifecycle gap |
| TypeScript/contratos | 8,5 | 8,5 | sin cambio |
| Calidad/pruebas | 7,6 | 7,5 | CI matizado (más jobs que “solo lint”) pero no `validate` monolítico |
| Seguridad | 5,2 | **5,0** | C-01/C-02/H-02/H-09 confirmados en live |
| CI/CD release | 5,8 | **5,5** | C-03 confirmado; comentario del driver lo admite |
| Resiliencia | 6,8 | 6,8 | — |
| Mantenibilidad | 7,4 | 7,4 | — |
| Docs↔código | 6,4 | 6,4 | — |

**Nota intake global: ~6,6/10** en fronteras de confianza; el núcleo sigue
por encima de la media MCP, pero los tres críticos son bloqueantes de
producción untrusted.

---

## notes

- El informe externo original del usuario se conserva como fuente narrativa; este
  archivo es el **artefacto canónico** para el swarm.
- `a00071` es la auditoría interna independiente (LLM code reading) pedida en
  el mismo mensaje.
- Worktree de escritura: `agent/copilot-audit-intake` desde `develop@4710d2a4`
  para no pisar WIP de `a00069` en otras ramas.

### next actions

1. Abrir `x`/`i` propuestas SEC-001, SEC-002, REL-001 (Fase 0–1).
2. `audit_consolidate` cuando existan a00070 + a00071 (+ a00068).
3. No mergear features de superficie de confianza hasta cerrar los tres críticos.
