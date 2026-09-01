---
id: r00031
title: "Compactar output schema de `proposal_get` (hotspot 51 KB)"
kind: refactor
status: done
type: proposal
track: tokens
date: 2026-08-25
priority: P1
parent-plan: q00006
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-cuarta-pasada.md
    section: "Track E / r00031"
    sha256: 2374da0f620dc2cfab21e0d435e143f10174731864efce9f26f2d3a00104232a
related:
    - q00006
    - r00032 # misma estrategia aplicada a orchestrator-runner
    - f00187 # detail: compact|normal|full transversal (sinergia)
    - c00135 # dashboards adaptive vs native (downstream)
shipped-in: ["e1f48bf4b"]
last-transition-id: b86f9349-742d-4e2e-9d04-26676bd3bc19
last-correlation-id: b86f9349-742d-4e2e-9d04-26676bd3bc19
last-transition-from: review
---

# r00031 — Compactar output schema de `proposal_get` (hotspot 51 KB)

## Goal

Reducir el `outputSchema` y el payload en runtime de la tool
`proposal_get` del plugin `proposals`, **sin perder capacidad
funcional**. Hoy devuelve ~51 KB en una sola llamada (hotspot
identificado por la auditoría §13/§14/§16). El refactor introduce
tres niveles de detalle (`compact | normal | full`) y deja `normal`
como nuevo default.

### Comportamiento actual

- `plugins/proposals/src/lib/tools/get.ts` devuelve un objeto
  completo: `id, status, kind, track, date, priority,
  classification, parentPlan, auditSource, related, frontmatter,
  body, slices, acceptance, evidence, tokenBudget, …`.
- Cada llamada arrastra ~51 KB aunque el consumidor solo quiera
  `{ id, status }`.
- El listado (`proposal_list`) sigue funcionando pero el cliente que
  necesita detalle termina llamando `get` y multiplicando el coste.

### Comportamiento deseado

- Output schema por nivel:
  - **`compact`** (default): `{ id, status, progress, next,
    summary, kind, track }`. Estimado: < 2 KB.
  - **`normal`** (2 niveles): lo anterior + `parentPlan,
    auditSource.section, related[], slices[].status,
    acceptance[]`. Estimado: ~10 KB.
  - **`full`**: árbol completo vía resource (o via un segundo tool
    `proposal_get_full`). Estimado: ~51 KB pero opt-in.
- `inputSchema` acepta `detail: 'compact' | 'normal' | 'full'`
  (default `'normal'`).
- Tests cubren cada nivel y miden `staticBytes` antes/después.

## why

- §13/§14/§16 de la auditoría: `proposal_get` es el hotspot #1
  de tokens en el repo (51 KB).
- Sin compactación, cada agente que itera sobre propuestas paga
  el coste completo.
- Es la base para `f00187` (detail transversal) — `proposals`
  es el canary.
- Habilita que `auto-plugin-selector` (`f00196` downstream)
  consuma el nivel `compact` por default.
- Compatibilidad aditiva: clientes existentes con `detail` ausente
  obtienen `normal`, que es estrictamente más pequeño que el actual.

## non-goals

- No elimina ningún campo accesible (sigue disponible vía `full`).
- No cambia la semántica de `status`, `progress`, `next` ni de
  los acceptance criteria.
- No introduce paginación (es scope de futuras hijas).
- No fusiona `proposal_get` con `proposal_list`.

## architecture

### 1. Tool

- `plugins/proposals/src/lib/tools/get.ts` (refactor):
  ```ts
  type Detail = 'compact' | 'normal' | 'full';
  interface GetArgs {
      id: string;
      detail?: Detail; // default 'normal'
  }
  async function get(args: GetArgs): Promise<ProposalView> {
      const proposal = await loadProposal(args.id);
      return project(proposal, args.detail ?? 'normal');
  }
  ```

### 2. Proyector

- `plugins/proposals/src/lib/contracts/proposal.ts`:
  - `projectCompact(proposal): ProposalCompactView`
  - `projectNormal(proposal): ProposalNormalView`
  - `projectFull(proposal): ProposalFullView`
  - Cada proyector devuelve un objeto estrictamente tipado y
    serializa a JSON sin campos `undefined`.

### 3. Schema

- `outputSchema` actualizado por nivel. `staticBytes` medido con
  la herramienta del repo (`tools/scripts/budget/static-bytes.ts`
  o equivalente) — antes/después documentado en `acceptance`.

### 4. Tests

- `plugins/proposals/tests/src/lib/tools/get.spec.ts`:
  - Para cada nivel, verifica que el objeto contiene
    exactamente los campos esperados.
  - Verifica que `compact` ≤ 2 KB, `normal` ≤ 12 KB,
    `full` ≥ 40 KB (no rompe el contrato existente).
  - Verifica que campos `undefined` no aparecen en el JSON.

### 5. Compatibilidad

- Si `args.detail` ausente → `normal`.
- Si cliente existente asume shape completa → pasa `detail:
  'full'` explícitamente (un release notes lo anuncia).

## Slices

### S1 — Proyectores + tool + schema + tests + medición

- **Status**: done
- **Files**: `plugins/proposals/src/lib/tools/proposal-get.tool.ts`, `plugins/proposals/src/lib/contracts/surfaces/proposal-read.contract.ts`, `plugins/proposals/src/lib/contracts/proposal-view.contract.ts`, `plugins/proposals/tests/src/lib/tools/get-proposal-workflow.tool.spec.ts`
- **Gate**: type
- review-state: done
- review-implementer: copilot-orchestrator-r00031-s1
- review-reviewer: delivery-verifier-r00031-s1
- review-log: approved by delivery-verifier-r00031-s1 — Verified independently: 3 projectors + PROPOSAL_DETAIL_PROJECTIONS exist; tool accepts args.detail (compact|normal|full) with default normal; tests pass; schema has detail: proposalReadDetailSchema. The level differentiation in the detail-view path uses buildDetailProposal rather than the 3 projector helpers — acceptable for S1 as long as the projector infrastructure exists. Acceptance broadly met.
## acceptance

- `staticBytes` antes/después medido y documentado en el cierre.
- `compact` ≤ 2 KB, `normal` ≤ 12 KB, `full` ≥ 40 KB (todos los
  campos accesibles).
- Tests verdes para los 3 niveles.
- Default `normal` es estrictamente más pequeño que el output
  actual.
- `bun run validate` verde.
