---
id: x00266
title: "AUD-CP-008/009 — Push policy engine: `onCommit`, `everyNCommits`, `everyNMinutes`"
kind: fix
status: done
shipped-in:
    - e8b4c5c5
type: proposal
track: commit-policy
date: 2026-08-25
priority: P1
classification: CONFIRMADO
parent-plan: q00006
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-cuarta-pasada.md
    section: "Track B / x00266"
    sha256: 2374da0f620dc2cfab21e0d435e143f10174731864efce9f26f2d3a00104232a
    finding: AUD-CP-008, AUD-CP-009
related:
    - q00006
    - x00267 # branch protection unificada
    - x00261 # dispose para parar el scheduler
    - f00182 # engine que orquesta
---

# x00266 — AUD-CP-008/009: `CommitPolicyEngine` orquesta push con `onCommit` / `everyNCommits` / `everyNMinutes`

## Goal

El push no está bajo la misma orquestación que el commit: hay un
`push-tool.ts` que se invoca separadamente y un
`interval-timer.ts` que opera sincrónicamente sin scheduler
único. Esto produce pushes duplicados, pushes a ramas protegidas,
y pushes zombie tras reload.

Tras la corrección, el `CommitPolicyEngine` (`f00182`) orquesta el
push con un scheduler único, lifecycle-clean (vía `x00261`), y
declara 3 modos combinables:

| Modo | Comportamiento |
| --- | --- |
| `onCommit: true` | Push tras cada commit exitoso |
| `everyNCommits: N` | Push al cerrar el contador en N |
| `everyNMinutes: M` | Push programado a intervalo fijo M (minutos) |

Combinaciones:
- `onCommit=true` + `everyNCommits=N` → **un** push (no doble).
- `onCommit=false` + `everyNCommits=N` → push solo al cerrar N.
- `onCommit=true` + `everyNMinutes=M` → push inmediato y reset
  ventana (scheduler reprograma).
- `everyNMinutes=M` solo → push cada M minutos.

Reglas adicionales:
- Branch protegida (`x00267`) prevalece: zero push a `develop` /
  `main` / ramas en `protectedBranches`.
- Scheduler disposed al unload (depende de `x00261`).

### Comportamiento actual (BUG)

```
- push se invoca independientemente desde push-tool
- interval-timer no se limpia al reload
- Combinaciones duplican pushes
- No hay chequeo unificado contra branch protection
```

### Comportamiento deseado

```
push policy:
  onCommit: true
  everyNCommits: 3
  everyNMinutes: 30
  protectedBranches: ['develop', 'main']

events:
  commit #1 → engine: count=1, no push (esperando N=3), onCommit suppressed por everyN
  commit #2 → count=2, no push
  commit #3 → count=3 → PUSH, count=0
  scheduler tick (30min) → PUSH (ventana)
  branch = 'develop' → PUSH rechazado (refusal BRANCH_PROTECTED)
  dispose() → scheduler.clear, zero pushes en curso
```

## Why

- Push policy es la otra mitad de commit-policy: sin push policy
  correcta, los commits se quedan locales y los merges se
  desincronizan.
- "Push on commit + everyN minutes" actual duplica pushes, lo que
  rompe idempotencia y dispara notificaciones espurias.
- Combinaciones mal resueltas rompen la regla "one source of
  truth".
- Branch protection unificada (`x00267`) depende de que el push
  pase por el engine.

## Non-goals

- No añadir push paralelo (nunca paralelo, siempre secuencial).
- No añadir push parcial (--force-with-lease no es por-comando).
- No introducir un sistema de colas externo.
- No exponer nuevos MCP tools; la policy se configura vía el
  tool existente `commit_policy_status` o `register()`.

## Architecture

### 1. Tipos de la policy

```ts
// plugins/commit-policy/src/lib/contracts/push-policy.ts (nuevo o ampliado)
export interface PushPolicy {
  onCommit: boolean;
  everyNCommits?: number;
  everyNMinutes?: number;
  protectedBranches: string[]; // matches prefix + exact
  remote?: string;            // default 'origin'
  branch?: string;            // default = current
}
```

### 2. Scheduler único

```ts
// plugins/commit-policy/src/lib/services/scheduler.ts (nuevo)
export class PushScheduler {
  start(): void;
  stop(): void;       // idempotente, propio del dispose
  tick(now: number): Promise<void>;
}
```

Estado interno: `pendingPushes: PushCandidate[]`, `windowStart`,
`commitCount`. Cualquier tick o `onCommitAck` re-evalúa si toca
push.

### 3. Integración con el engine

```ts
// engine.ts
async commitSucceeded(result: CommitResult) {
  this.commitCount += 1;
  if (this.policy.protectedBranches.includes(currentBranch())) {
    return { ack: 'OK_NO_PUSH', reason: 'BRANCH_PROTECTED' };
  }
  const shouldPush =
    (this.policy.onCommit && !this.policy.everyNCommits) ||
    (this.policy.everyNCommits && this.commitCount >= this.policy.everyNCommits) ||
    (this.policy.everyNMinutes && now - this.windowStart >= this.policy.everyNMinutes * 60_000);
  if (shouldPush) await this.pushDriver.pushOnce();
}
```

### 4. Errores tipados

| Caso | Refusal |
| --- | --- |
| Push a protected branch | `BRANCH_PROTECTED` |
| Push a remote sin tracking | `NO_UPSTREAM` |
| Push rechazado por upstream (non-fastforward) | `NON_FASTFORWARD` |
| Scheduler ya disposed | `SCHEDULER_DISPOSED` (no push) |

## Slices

- global_gate: lint

### S1 — `CommitPolicyEngine` orquesta push según policy combinada

- **Status**: done
- **Files**: `plugins/commit-policy/src/lib/engine.ts`, `plugins/commit-policy/src/lib/services/scheduler.ts`, `plugins/commit-policy/tests/src/lib/services/scheduler.spec.ts`
- **Gate**: type
- **Dependency**: `f00182`
- acceptance:
  - "onCommit=true → un push por commit"
  - "everyNCommits=3 → push después del tercero, no antes"
  - "everyNMinutes → scheduler ejecuta una vez, dispose lo para"
  - "combinación onCommit+everyNCommits → un push (no doble)"
  - "push a `develop` → refusal BRANCH_PROTECTED"
- review-state: done
- review-implementer: sparrow
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Revision independiente del checkout actual: verificados onCommit=true -> un push por commit; everyNCommits=3 -> push solo tras el tercero; everyNMinutes -> scheduler ejecuta una vez y stop/dispose evita ticks posteriores; onCommit+everyNCommits -> un solo push al cerrar la ventana; push a develop protegido -> refusal BRANCH_PROTECTED. Tests enfocados y typecheck del plugin en verde. Hay cambios fuera del slice en el repo, pero no bloquean esta aprobacion del slice porque el alcance modificado y sus validaciones locales pasan.
## acceptance

- Tests cubren las 5 filas de la tabla de la sección Goal.
- Scheduler disposed al `dispose()` del plugin (`x00261`).
- Cero pushes duplicados en combinaciones.
- `bun run lint` verde; `tsc --noEmit` verde.
- Sin nueva dependencia npm.
