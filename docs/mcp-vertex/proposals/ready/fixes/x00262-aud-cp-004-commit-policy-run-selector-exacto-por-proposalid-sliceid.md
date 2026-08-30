---
id: x00262
title: "AUD-CP-004 — `commit_policy_run` selector exacto por `proposalId`+`sliceId`"
kind: fix
status: ready
type: proposal
track: commit-policy
date: 2026-08-25
priority: P0
classification: CONFIRMADO
parent-plan: q00006
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-cuarta-pasada.md
    section: "Track B / x00262"
    sha256: 2374da0f620dc2cfab21e0d435e143f10174731864efce9f26f2d3a00104232a
    finding: AUD-CP-004
related:
    - q00006
    - x00263 # sliceScoping stagea exactos
    - x00259 # parser invertible para mensajes
    - f00182 # engine para enrutar el commit
---

# x00262 — AUD-CP-004: `commit_policy_run` debe seleccionar el slice exacto o fallar tipado

## Goal

El handler de `commit_policy_run`
(`plugins/commit-policy/src/lib/tools/run-tool.ts`) cuando recibe
`kind: "slice"` debe exigir el par `(proposalId, sliceId)` y
**rechazar** el comportamiento implícito actual "primer slice
elegible". Si la selección es exacta, procede; si no, devuelve un
refusal tipado determinista.

### Comportamiento actual (BUG)

```
kind: "slice", sin proposalId/sliceId
  → recorre snapshot, toma el primer slice "elegible"
  → commit en el slice equivocado
```

### Comportamiento deseado

| Entrada | Salida |
| --- | --- |
| `proposalId` + `sliceId` válidos | selecciona ese slice exacto |
| `proposalId` + `sliceId` y el slice no existe | refusal tipado `SLICE_NOT_FOUND` |
| Solo uno presente (proposalId o sliceId) | refusal `INCOMPLETE_SELECTOR` |
| `kind: "slice"` sin selector | refusal `SELECTOR_REQUIRED` |
| `kind: "manual"` sin selector | OK (no aplica) |

Cada refusal incluye los códigos esperados en la respuesta, no
excepciones genéricas.

## Why

- Bug "predicado ≠ acción": el código promete "selecciona el slice
  que te digo" pero opera implícitamente sobre "el primero que
  parezca elegible". Cross-agent, el primer elegible puede ser el
  slice de OTRO agente.
- Compromete la trazabilidad de auditoría: si el commit se asocia al
  slice equivocado, el peer-review y el cierre del slice se confunden.
- Pieza previa indispensable para `x00263` (sliceScoping exacto) y
  para `f00182` (engine central que enruta por selector).

## Non-goals

- No permitir selección por defecto "primer slice elegible".
- No añadir `proposalId`/`sliceId` opcionales a `kind: "manual"`
  (eso es ortogonal).
- No romper el surface de `commit_policy_status` ni `commit_policy_push`.

## Architecture

### 1. Refactor del handler `run-tool.ts`

```ts
type CommitPolicyRunArgs = {
  kind: "slice" | "manual" | "threshold" | "interval";
  proposalId?: string;
  sliceId?: string;
  message?: string;       // solo manual
  force?: boolean;        // bypass protected-branch (logged)
};

type CommitPolicyRunResult =
  | { ack: "OK"; commitSha: string; proposalId?: string; sliceId?: string }
  | { ack: "ERR"; code: "SELECTOR_REQUIRED" | "INCOMPLETE_SELECTOR" |
                    "SLICE_NOT_FOUND" | "BRANCH_PROTECTED" |
                    "REQUIRE_CONVENTIONAL"; reason: string };
```

### 2. Validaciones previas al staging

1. Si `kind: "slice"`:
   - Ambos `proposalId` y `sliceId` requeridos → si falta uno de los
     dos, `INCOMPLETE_SELECTOR`.
   - Ninguno presente → `SELECTOR_REQUIRED`.
   - Cargar slice del snapshot → si no existe, `SLICE_NOT_FOUND`.
2. Cargar message + branch policy + requireConventional.
3. Pasar al engine (`f00182`) para stage + commit + push.

### 3. Logging estructurado

Toda respuesta del tool emite un log con `{tool: 'commit_policy_run',
args, result, tookMs}`. Esto alimenta `commit_policy_status` y la
auditoría externa.

## Slices

- global_gate: lint

### S1 — Handler devuelve refusals tipados ante selector incompleto/inexistente

- **Status**: done
- **Files**: `plugins/commit-policy/src/lib/tools/run-tool.ts`, `plugins/commit-policy/tests/src/lib/tools/run-tool.spec.ts`
- **Gate**: type
- **Dependency**: —
- acceptance:
  - "selector exacto → selecciona ese slice y commit"
  - "selector inexistente → refusal `SLICE_NOT_FOUND`"
  - "selector parcial → refusal `INCOMPLETE_SELECTOR`"
  - "sin selector + kind=slice → refusal `SELECTOR_REQUIRED`"
  - "sin selector + kind=manual → ok"
  - "logs estructurados por invocación"
- review-state: done
- review-implementer: implementation_runner
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Revisión independiente aprobada: resolveSliceSelector exige proposalId+sliceId exactos; distingue SELECTOR_REQUIRED e INCOMPLETE_SELECTOR; devuelve SLICE_NOT_FOUND determinista; no selecciona el primer slice elegible; manual sin selector sigue permitido. El logging por invocación ya lo aporta la instrumentación general host/logs con toolName, args, result y elapsedMs. Biome y typecheck verdes; test focalizado 5/5.
## acceptance

- Comportamiento determinista: misma entrada → misma salida siempre.
- Cero excepciones genéricas: cualquier rechazo es refusal tipado.
- Tests cubren las 5 filas de la tabla de la sección Goal.
- `bun run lint` verde; `tsc --noEmit` verde.
- Breaking para clientes que usaban "primer elegible" → nota en
  CHANGELOG (release notes claras, no error).
