---
id: a00071
kind: audit
title: "25-07-2026 · Auditoría exhaustiva independiente (LLM code reading) — fronteras de confianza y concurrencia"
status: done
date: 2026-07-25T22:30:00Z
track: security+concurrency+architecture+invariants+ci+release
related:
    - a00070 # intake auditoría externa GitHub-API (mismo día)
    - a00068 # auditoría + recomendaciones 24-07
    - a00066 # auditoría general 22-07
    - a00069 # multi-agent drift (en paralelo)
author: copilot-grok-4.5 (orchestrator)
mode: general + independent code reading
closed-by: cartago (intake 2026-07-25, restored 2026-07-26)
closed-evidence:
  - trust-boundaries + concurrency findings grounded in live file:line evidence
  - resolved via x00072/x00073 + extensions to a00068/a00069
shipped-in:
  - daab5199 # intake commit
  - 4dc01795 # x00072/x00073/x00152 follow-ups
---

# 25-07-2026 · Auditoría exhaustiva independiente — `@mcp-vertex/core`

> **Documento independiente.** Auditoría Scope A (lectura de código por LLM)
> pedida junto al intake externo `a00070`. No copia el informe externo: lo
> **complementa** con hallazgos nuevos y re-confirma los P0 en el árbol live.
>
> HEAD auditado: `4710d2a4` (`develop` / worktree `agent/copilot-audit-intake`).
> Revisor: `copilot-grok-4.5` (orchestrator) + investigator subagent.
> Método: playbook `mcp-vertex-audit-playbook` Phases 0–10.
> Suite completa: **no** re-ejecutada en esta pasada (ver Verified state).

---

## Goal

**Veredicto:** arquitectura sólida (primitivas atómicas, DI, effects, defaults
de gasto seguros) con **nota global ~7,1/10**, pero **2 P0 + varios P1** en
fronteras de confianza (env de external-mcps, Workspace Trust VS Code, publish
`workspace:*`, CSP `unsafe-inline`) impiden recomendar el proyecto para
workspaces no confiables o release npm vía `--tool=npm` hasta cerrar tracks.

## why

El usuario pidió, además del intake del auditor externo, una auditoría completa
propia. Esta propuesta es esa entrega: evidencia `file:line`, tabla de
concurrencia, scan de invariantes, scoreboard y recomendaciones accionables.

## non-goals

- No implementar fixes.
- No sustituir `a00070` (intake externo) ni `a00068`.
- No certificar `bun run validate` verde sin haberlo corrido aquí.
- No fuzzing ni multiproceso real (quedan en Fase 3).

## Slices

- global_gate: lint

### S1 — Registro de la auditoría independiente

- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/review/a00071-25-07-2026-copilot-grok-auditoria-exhaustiva-independiente.md`
- **Gate**: lint
- acceptance:
  - "≥12 findings con file:line"
  - "Concurrency table + invariants scan"
  - "Scoreboard justificado; P0 no puntúa >6 en su dimensión"
  - "Recommendations add/remove/modify/reorganize"
- review-state: done
- review-implementer: copilot-grok-4.5
- review-reviewer: copilot-minimax-m3
- review-log: approved by copilot-minimax-m3 — Independent LLM audit (Scope A code-reading) complete; trust-boundaries + concurrency findings backed by live file:line evidence; complements the external GitHub-API intake (a00070).
## acceptance

- Findings con evidencia y Resolution Track.
- Scoreboard Phase 10.
- Alineado al scaffold de propuestas (`lint:proposals`).

---

## Verified state

| Paso | Comando / Verificación | Resultado |
|---|---|---|
| 1 | `git rev-parse HEAD` | `4710d2a4fc7c80296a5462a7d517a7de103f3c35` |
| 2 | `git log -1 --oneline` | `fix(a00069): S8 state_health claim/release imbalance gate` |
| 3 | LOC `*.ts` packages/plugins/extensions/apps/tools | ~92 501 |
| 4 | `find packages/core/src -name '*.ts' \| wc -l` | 174 |
| 5 | `find plugins -name '*.ts' \| wc -l` | 1667 |
| 6 | specs `*.spec.ts` | 551 |
| 7 | Plugins en disco | 29 |
| 8 | `bun.lock` | presente |
| 9 | Biome sample paths críticos | verde |
| 10 | `bun run test` / `validate` completo | **no ejecutado en esta auditoría** (Scope A; forge tuvo exit 132 en otra sesión — no se usa como veredicto) |
| 11 | Scripts `.py`/`.sh` en tools/scripts | 0 (Hard Rule 10 OK) |

---

## Findings

### 1. [P0] VS Code spawnea comando del workspace en activate sin Workspace Trust

**File**: [`extensions/vscode/package.json#L21`](../../../../extensions/vscode/package.json#L21) · [`extensions/vscode/src/extension.ts#L208`](../../../../extensions/vscode/src/extension.ts#L208) · [`#L666`](../../../../extensions/vscode/src/extension.ts#L666)

```json
"activationEvents": ["workspaceContains:**/mcp-vertex.config.json"]
```

```typescript
// activate → createDefaultClient → lee .mcp.json → McpStdioClient.connect({command,args,cwd})
```

**Problem**: Sin `isTrusted`, sin `untrustedWorkspaces: false`, sin aprobación
con huella. Repo malicioso = RCE al abrir.
**Impact**: Crítico — anula el modelo de confianza del host.
**Resolution Track**: Deferred → **SEC-001** (también C-01 en a00070).

---

### 2. [P0] external-mcps: spawn sin env mínimo filtrado

**File**: [`plugins/external-mcps/src/lib/subprocess/server-registry.ts#L83`](../../../../plugins/external-mcps/src/lib/subprocess/server-registry.ts#L83) · [`#L161`](../../../../plugins/external-mcps/src/lib/subprocess/server-registry.ts#L161)

```typescript
const child = spawn(command, [...args], {
  ...(options.env !== undefined ? { env: { ...options.env } } : {}),
});
// createChildTransport: spawner(command, args, { cwd }) — sin env allow-list
```

**Problem**: Contrato `entry.env` sugiere allow-list; runtime hereda
`process.env` si no se pasa `env`.
**Impact**: Exfiltración de tokens GH/npm/cloud/IA.
**Resolution Track**: Deferred → **SEC-002** (C-02 a00070).

---

### 3. [P1] npm publish path no reescribe `workspace:*`

**File**: [`tools/scripts/release/release.script.ts#L17`](../../../../tools/scripts/release/release.script.ts#L17) · [`#L194`](../../../../tools/scripts/release/release.script.ts#L194) · [`tools/scripts/smoke/pack.script.ts#L127`](../../../../tools/scripts/smoke/pack.script.ts#L127)

**Problem**: Driver documenta el hueco; `publishAll` solo ejecuta publish;
smoke sí reescribe temporalmente → falsa señal verde.
**Impact**: Tarballs npm ininstalables para client/cli.
**Resolution Track**: Deferred → **REL-001** (C-03 a00070).

---

### 4. [P1] CSP `script-src 'unsafe-inline'` en 5 webviews

**File**: [`packages/ui-extension/src/webview/csp.ts`](../../../../packages/ui-extension/src/webview/csp.ts) (WEBVIEW_CSP_OVERRIDES: toolbar, settings, dashboard, knowledge, configuration-center)

**Problem**: Anula defensa CSP si hay interpolación incorrecta futura.
**Impact**: XSS → `acquireVsCodeApi` messaging.
**Resolution Track**: Deferred → **SEC-CSP / IDE-003** (M-11 a00070).

---

### 5. [P1] Contención léxica sin realpath

**File**: [`packages/core/src/lib/shared/contain-path.ts#L26`](../../../../packages/core/src/lib/shared/contain-path.ts#L26)

```typescript
// Note: containment is lexical (no `realpath`) ... symlink escape remains ...
```

**Problem**: Symlink dentro del workspace → fuera = read/write/delete escape.
**Impact**: Rompe el modelo “contained tools”.
**Resolution Track**: Deferred → **SEC-003** (H-02 a00070).

---

### 6. [P1] `readDoc` ignora roots/extensiones del catálogo

**File**: [`plugins/docs/src/lib/services/engine.ts#L297`](../../../../plugins/docs/src/lib/services/engine.ts#L297)

```typescript
export const readDoc = async (workspaceRootAbs, relPath) => {
  const contained = resolveWorkspaceContained(workspaceRootAbs, relPath);
  // ... stat + readFile completo; sin check de roots/extensions
};
```

**Problem**: `listDocs` filtra; `readDoc` solo contención léxica → se usa como
lector genérico de cualquier path contenido.
**Impact**: Exposición de config/secrets vía tool de docs.
**Resolution Track**: Deferred → **SEC-docs** (H-03 a00070).

---

### 7. [P1] `env_check` acepta rutas absolutas fuera del workspace

**File**: [`plugins/env/src/lib/env/real-deps.ts#L12`](../../../../plugins/env/src/lib/env/real-deps.ts#L12)

```typescript
readEnv: async (path) => {
  const abs = isAbsolute(path) ? path : join(workspaceRootAbs, path);
  return await readFile(abs, 'utf8');
},
```

**Problem**: Sin `resolveWorkspaceContained` / realpath.
**Impact**: Oráculo de existencia/estructura de ficheros externos.
**Resolution Track**: Deferred → **SEC-009** (H-09 a00070).

---

### 8. [P1] OSV: errores de red → lista vacía (falso “limpio”)

**File**: [`plugins/security/src/lib/deps/osv.ts`](../../../../plugins/security/src/lib/deps/osv.ts) (`catch { return [] }`, `!response.ok → []`)

**Problem**: Indistinguible de “0 vulns”; sin retry; sin status incomplete.
**Impact**: CI/operador confían en señal falsa.
**Resolution Track**: Deferred → **SEC-004 / SEC-005** (H-04 a00070).

---

### 9. [P1] Plugin loader: timeout sin cancelación; dependsOn post-import; sin dispose

**File**: [`packages/core/src/lib/plugins/load-plugins.ts`](../../../../packages/core/src/lib/plugins/load-plugins.ts) (`withTimeout`/`Promise.race`; `checkPluginDependencies` post-load)

**Problem**: Import/register siguen tras timeout; grafo no topológico; sin
`dispose` en contrato.
**Impact**: Leaks de timers/hijos; orden frágil; H-01.
**Resolution Track**: Deferred → **CORE-001**.

---

### 10. [P2] CI no equivale al script raíz `validate`

**File**: [`.github/workflows/ci.yml`](../../../../.github/workflows/ci.yml)

**Problem**: Jobs lint / typecheck / test:coverage / build / pack-smoke /
metrics — no el monolito `bun run validate` (gates de arquitectura/docs/drift
pueden quedar fuera).
**Impact**: Paridad local↔CI (H-06 matizado).
**Resolution Track**: Deferred → **CI-001**.

---

### 11. [P2] web-fetch: redirects sin detección de bucle; allow-list por hostname no IP

**File**: [`plugins/web-fetch/src/lib/services/engine.ts`](../../../../plugins/web-fetch/src/lib/services/engine.ts)

**Problem**: maxRedirects sin Set de URLs visitadas; sin bloqueo RFC1918 post-DNS.
**Impact**: DoS por loop; SSRF residual (M-02).
**Resolution Track**: Deferred → **NET-001 / NET-002**.

---

### 12. [P2] stderr de MCP externo drenado y descartado

**File**: [`plugins/external-mcps/src/lib/subprocess/server-registry.ts#L111`](../../../../plugins/external-mcps/src/lib/subprocess/server-registry.ts#L111)

```typescript
// stderr is drained ... but never parsed — it may carry secrets.
child.stderr?.on('data', () => undefined);
```

**Problem**: Sin audit trail ni debug; secrets podrían irse “off-record”.
**Impact**: Observabilidad y detección de abuso.
**Resolution Track**: Deferred → **NET-001b**.

---

### 13. [P2] `process.cwd()` en entry/scaffold (Hard Rule 2 parcial)

**File**: [`packages/core/src/cli.ts`](../../../../packages/core/src/cli.ts) · [`packages/core/src/lib/scaffold/scaffold-host.ts`](../../../../packages/core/src/lib/scaffold/scaffold-host.ts)

**Problem**: Entry points con cwd implícito; scaffold default argument contradice
jsdoc “never read process.cwd here”.
**Impact**: Tests/host programático heredan cwd sorpresa.
**Resolution Track**: Deferred → **CORE-003**.

---

### 14. [P2] activationEvents `**/mcp-vertex.config.json` demasiado amplio

**File**: [`extensions/vscode/package.json#L21`](../../../../extensions/vscode/package.json#L21)

**Problem**: Activa por config en subárboles (p.ej. node_modules de ejemplo).
**Impact**: Overhead + superficie de spawn innecesaria.
**Resolution Track**: Deferred → **IDE-001**.

---

### 15. [P2] Session claim/release balance solo telemetría (a00069 S8)

**File**: [`plugins/proposals/src/lib/locks/agent-lock-engine.ts`](../../../../plugins/proposals/src/lib/locks/agent-lock-engine.ts) (`getAgentLockSessionBalance`)

**Problem**: imbalance expuesto pero no fuerza fallo de cierre de sesión.
**Impact**: locks stale hasta GC.
**Resolution Track**: Deferred → **STATE-balance** (parcialmente mejorado por
`state_health` en 4710d2a4 — re-verificar enforcement en close path).

---

### Concurrency table

| Scenario | Risk | Mitigation | Gap |
|---|---|---|---|
| Dos agentes escriben index proposals | Torn JSON | writeFileAtomic + mutex | ✅ |
| Muerte mid-lock-write | Corrupt lock | writeFileAtomic | ✅ |
| sync concurrente registry | Snapshot intermedio | mutex suele cubrir write | ⚠️ ampliar a read+transform |
| External MCP hijo escribe workspace | Race host/hijo | ninguna nativa | ❌ inherent |
| Claim sin release | Stale lock | GC + session balance telemetry | ⚠️ enforce on close |
| Worktree add/remove vs sync | Registry stale | coordinator opt-in | ⚠️ mandatory if agentWorktree |

---

### Invariants bootstrap scan

| # | Regla | Estado |
|---|---|---|
| 1 | Core agnostic | ✅ |
| 2 | No process.cwd en engines | ⚠️ entry/scaffold |
| 3 | No *Sync hot path | ✅ (muestreo) |
| 4 | Durable writes atómicas | ✅ |
| 5 | resolveWorkspaceContained | ⚠️ env_check / docs_read gaps |
| 6 | redactSecrets | ⚠️ logs amplitud (M-10) |
| 7 | Token budget | ✅ (gates/métricas) |
| 8 | outputSchema | ✅ (muestreo amplio) |
| 9 | i18n web | ⚠️ no re-verificado exhaustivo |
| 10 | No py/sh en tools | ✅ |

---

## Scoreboard

| Dimensión | Nota | Justificación |
|---|---:|---|
| Seguridad | **4,5/10** | P0 C-01/C-02; H-02/H-03/H-09; CSP inline |
| Concurrencia | 7,0/10 | Primitivas fuertes; gaps sync/session |
| Testabilidad | 7,5/10 | DI excelente; paths timeout/SSRF undertested |
| Mantenibilidad | 7,0/10 | SOLID bueno; superficie scripts grande |
| Observabilidad | 6,0/10 | stderr drop; OSV silencioso |
| Portabilidad | 8,5/10 | Core hermético; entry cwd |
| Rendimiento | 7,5/10 | async; budgets parciales |
| Cumplimiento invariantes | 7,0/10 | 7 pass / 3 partial |
| Arquitectura SOLID | 8,5/10 | contratos + composición |

**Nota final: 7,1/10** — sólida en núcleo; **no production-ready untrusted**
hasta SEC-001/002 + REL-001.

---

### recommendations

### add

1. SEC-001 Workspace Trust + aprobación comando (extensión).
2. SEC-002 env mínimo external-mcps + test señuelo.
3. REL-001 rewrite compartido smoke/release + publish tarball.
4. SEC-003 realpath/no-follow containment.
5. SEC-docs política única list/read.
6. SEC-009 contain env paths.
7. SEC-004/005 OSV incomplete + retry.
8. CORE-001 lifecycle v2 (DAG, dispose, AbortSignal).
9. CI-001 paridad validate.
10. SEC-CSP nonces webviews.
11. NET-001/002 SSRF + redirect-loop.
12. STATE-001 stateDir durable fuera de `.cache`.

### remove

- Nada urgente; no eliminar smoke pack — alinearlo con release.

### modify

- `publishAll` para reutilizar rewrite del smoke.
- `readDoc` para exigir membership en catálogo.
- `realEnvDeps` para containment.
- `activationEvents` a root-level config.
- OSV return type con `status: ok|incomplete|error`.

### reorganize

- Unificar runners de comando (H-08).
- Separar `cacheDir` vs `stateDir`.
- Coordinator worktree+registry mandatory cuando `agentWorktree: true`.

---

## notes

- Overlap consciente con `a00070`: P0/P1 de fronteras se confirman en ambos
  para `audit_consolidate`.
- Hallazgos “nuevos” relativos al externo narrativo: CSP overrides concretos,
  stderr discard, activation glob `**`, session balance telemetry-only,
  scaffold `process.cwd` vs jsdoc.
- Worktree aislado `agent/copilot-audit-intake` para no interferir con a00069.

### next actions

1. Spawnear fixes SEC-001, SEC-002, REL-001 (Fase 0–1).
2. `audit_consolidate` sobre `done/audits` + ready a00070/a00071 cuando el
   usuario mueva a done/audits.
3. Re-correr `bun run validate` en sesión dedicada antes de release.
