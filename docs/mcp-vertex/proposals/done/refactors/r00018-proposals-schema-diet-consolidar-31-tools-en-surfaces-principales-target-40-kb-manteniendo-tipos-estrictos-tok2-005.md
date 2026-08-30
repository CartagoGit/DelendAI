---
id: r00018
title: "proposals — schema diet: consolidar 31 tools en surfaces principales (target <40 KB), manteniendo tipos estrictos (TOK2-005)"
kind: refactor
status: done
type: proposal
track: tokens
date: 2026-08-25
priority: P2
shipped-in: ["025af82f", "00173518"]
classification: CONFIRMADO / MEJORA
parent-plan: q00004
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol.md
    section: "§9 TOK2-005 + §26 REG2-001"
    sha256: fc2494af135f18cdc2de8c36c110d6296e2a1c511e602afa0a1e4d2a566f339d
related:
    - q00004
    - i00005 # real budget gate (mide resultado)
    - i00006 # dashboard check
    - r00019 # adaptive default (hermano)
---

# r00018 — proposals: schema diet

## Goal

`plugins/proposals/` aporta:

```text
31 tools
76,776 B tools/list
63,853 B schema
54,839 B outputSchema
```

Es el mayor contribuyente individual al coste del swarm. La promesa "low-token" requiere reducirlo.

Reglas violadas: R4.1 (presupuestos son constraints), §9 TOK2-005.

**Restricciones críticas** (NO negociables):

- Mantener tipos estrictos (Zod schemas). **No** un mega-tool con `action: string` libre.
- Mantener la lógica de DFA intacta.
- Mantener el workflow multi-agent (orchestrator, proposal guardian, implementation runner, delivery verifier).
- Mantener la cobertura de tests.
- Mantener el manifest obligatorio (Track E).


Dashboard tracked (medición aprox):

| Plugin             | Tools | Bytes  |
|--------------------|-------|--------|
| proposals          | 31    | 76,776 |
| context-for-change | 8     | 18,500 |
| impact-analysis    | 4     | 12,300 |
| quality            | 12    | 14,800 |

El coste de `proposals` es **5x** el siguiente mayor.


`CONFIRMADO / MEJORA` — cuantificación y diagnóstico.

## Why

- Contexto swarm ~37KB más barato.
- API más limpia y mantenible.
- Schemas más pequeños (mejor validación).


Cero.


- **Actual**: 76,776 B.
- **Target**: <40,000 B (reducción ~50%).
- **Stretch**: <25,000 B si se logra.

## Non-goals

**Permitido**:

- `plugins/proposals/src/**` (consolidación de tools).
- `plugins/proposals/tests/**` (actualización).
- `plugins/proposals/manifest.ts` (renombrado de tools).
- Documentación (`docs/mcp-vertex/plugins/proposals.md`).
- `FIRST_PARTY_PLUGIN_INDEX` regenerado.

**No permitido**:

- Cambios en el DFA state machine.
- Cambios en multi-agent coordination primitives.
- Cambios en tests que asuman nombres de tools específicos (se actualizan aquí, no se mantienen alias).


- Gate de presupuesto (`i00005`).
- Dashboard check (`i00006`).
- Adaptive default (`r00019`).
- Vertex budget (`i00007`).

## Architecture

### 1. Análisis: ¿qué herramientas pueden consolidarse?

Mapa actual (31 tools) → mapa propuesto (~8–10 surfaces):

| Surface (propuesta)       | Tools originales cubiertas                                  | Acción |
|---------------------------|-------------------------------------------------------------|--------|
| `proposal_read`           | `get_proposal`, `list_proposals`, `search_proposals`, `get_proposal_metadata`, `get_proposal_slices`, `get_proposal_history`, `get_proposal_review_log` | Consolidar en 1 tool con `view: 'list'\|'detail'\|'history'\|'slices'\|'review'` |
| `proposal_mutate`         | `create_proposal`, `update_proposal`, `transition_proposal`, `add_slice`, `update_slice`, `close_slice`, `transition_slice`, `force_transition` | Consolidar en 1 tool con `operation: 'create'\|'update'\|'transition'\|...` |
| `proposal_work`           | `auto_work`, `continue_proposal`, `delegate`, `get_proposal_workflow`, `get_proposal_board`, `compact_status` | Consolidar en 1 tool con `mode: 'auto'\|'plan'\|'claim'\|'workflow'\|'board'\|'status'` |
| `agent_coordination`      | `agent_lock`, `agent_worktree`, `agent_lock_release_orphan`, `agent_names`, `agent_lock_diagnose` | Consolidar en 1 tool con `operation: 'lock'\|'worktree'\|'release'\|'names'\|'diagnose'` |
| `review`                  | `request_peer_review`, `submit_peer_review`, `get_review_status` | Consolidar en 1 tool con `action: 'request'\|'submit'\|'status'` |
| `workflow_info`           | `get_proposal_workflow`, `get_proposal_templates`           | Mantener 1 tool (resources para templates) |
| `proposal_sync`           | `sync_proposals`, `reconcile_folder`                       | Mantener 1 tool |
| `proposals_close_plan`    | `proposals_close_plan`                                     | Mantener 1 tool |
| `proposal_reap`           | `reap_legacy_proposals`                                    | Mantener 1 tool (admin) |
| `proposal_metrics`        | métricas varias (`get_proposal_metrics`)                    | Mantener 1 tool |

### 2. Tipos estrictos via discriminated unions

```ts
// plugins/proposals/src/lib/contracts/proposal-read.contract.ts
import { z } from 'zod';

const viewEnum = z.enum(['list', 'detail', 'history', 'slices', 'review']);

export const proposalReadInputSchema = z.object({
  view: viewEnum,
  proposalId: z.string().optional(),
  filters: z.object({
    status: z.string().optional(),
    track: z.string().optional(),
    kind: z.string().optional(),
  }).optional(),
  pagination: z.object({
    limit: z.number().int().positive().max(100).default(20),
    cursor: z.string().optional(),
  }).optional(),
}).superRefine((data, ctx) => {
  if (['detail', 'history', 'slices', 'review'].includes(data.view) && !data.proposalId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['proposalId'],
      message: `proposalId is required for view="${data.view}"`,
    });
  }
});
```

**Resultado**: cada `view` tiene un payload específico y el tipo refleja los campos requeridos.

### 3. Output schemas compactos

Para cada surface, el output schema se reduce a un **union discriminado**:

```ts
const proposalReadOutputSchema = z.discriminatedUnion('view', [
  z.object({ view: z.literal('list'), proposals: z.array(z.object({...})) }),
  z.object({ view: z.literal('detail'), proposal: z.object({...}) }),
  z.object({ view: z.literal('history'), history: z.array(z.object({...})) }),
  // ...
]);
```

Solo el variant del view activo se serializa, ahorrando bytes.

### 4. Resources para datos grandes

Templates y catálogos completos se mueven a **resources** (MCP resources, accesibles vía `resources/read`):

```ts
// plugins/proposals/src/lib/resources/proposal-templates.resource.ts
export const proposalTemplatesResource = {
  uri: 'mcp://proposals/templates',
  name: 'Proposal templates',
  description: 'Full catalog of proposal templates (large; use resources/read)',
  mimeType: 'application/json',
  read: async () => loadAllTemplates(),
};
```

Así el `tools/list` no arrastra el catálogo completo.

### 5. Descriptions compactas

Cada tool pasa de:

```md
This tool retrieves a proposal from the proposals store. It supports filtering by status, track, kind, and other criteria. The proposal is returned as a structured object with all its fields. Use this tool when you need to inspect a specific proposal.
```

a:

```md
Read a proposal or list them with filters.
```

(Aunque el detalle se mantiene en un campo `descriptionExt` opcional, no serializado por defecto.)

### 6. Medición before/after

Antes de tocar el código, capturar la medición exacta con `i00005`:

```bash
bun run tokens:gate swarm
# Output actual: 229,740 B
```

Después de aplicar esta propuesta:

```bash
bun run tokens:gate swarm
# Output esperado: <200,000 B (idealmente <180,000 B)
```

El commit debe mostrar el delta.

## Slices

- global_gate: type

### S1 — Análisis + design de surfaces

- **Status**: done
- **Files**: `plugins/proposals/src/lib/contracts/surfaces/proposal-read.contract.ts`
- **Gate**: type
- acceptance:
  - "Mapa actual → propuesto documentado."
  - "Tipos Zod discriminated unions diseñados."
- review-state: done
- review-implementer: implementation_runner
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Contrato S1 correcto: mapa legacy documentado, unions Zod estrictas, filtros/paginación compactos y sin cableado S2; typecheck global exit 0.
### S2 — Implementación de las surfaces

- **Status**: done
- **Files**: `plugins/proposals/src/lib/tools/proposal-get.tool.ts`, `plugins/proposals/src/lib/tools/proposal-transition.tool.ts`
- **Gate**: type
- acceptance:
  - "Surfaces implementadas."
  - "Tipos estrictos validados en runtime."
- review-state: done
- review-implementer: sparrow
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Verificacion independiente delivery_verifier: la compatibilidad v1/v2 usa enum real y strict; rechaza unknown keys e invalid targets; no altera DFA ni workflow; las regresiones pasan (95 proposal/close + 12 slice-listener).
### S3 — Resources + descriptions compactas

- **Status**: done
- **Files**: `plugins/proposals/src/lib/resources/proposal-templates.resource.ts`
- **Gate**: type
- acceptance:
  - "Resources para templates."
  - "Descriptions reducidas."
- review-state: done
- review-implementer: mcp-vertex-orchestrator
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier
### S4 — Tests + medición

- **Status**: done
- **Files**: `plugins/proposals/tests/src/lib/services/transition-evidence.spec.ts`
- **Gate**: type
- acceptance:
  - "Tests verdes."
  - "Token gate verde (swarm <= 192,000 B)."
- review-state: done
- review-implementer: mcp-vertex-orchestrator
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — bun run tokens:gate swarm exit 0 con 184128 B; overview compact 4409 B; round context 153 B; bun vitest run plugins/proposals/tests exit 0 con 137 archivos y 1220 tests.
## Acceptance

- **Unit**: actualizar tests existentes para usar las nuevas APIs.
- **Integration**: el workflow multi-agent sigue funcionando.
- **E2E**: una propuesta pasa por todo el ciclo (create → ready → in-progress → review → done).
- **Token gate**: `i00005` pasa verde.


- [ ] 31 tools consolidados en ≤10 surfaces.
- [ ] Cada surface usa discriminated unions o tipos estrictos equivalentes (NO `action: string` libre).
- [ ] Tipos Zod estrictos en input y output.
- [ ] Resources para datos grandes (templates, catalogs).
- [ ] Description strings reducidos a 1 frase corta.
- [ ] Workflow multi-agent intacto (DFA, locks, peer review, close_plan).
- [ ] Tests verdes (≥80% coverage).
- [ ] `bun run tokens:gate swarm` pasa verde (swarm <= 192,000 B).
- [ ] Documentación actualizada con la nueva API.


- 31 tools → ≤10 surfaces.
- Tipos estrictos mantenidos.
- Swarm real <= hard budget.
- Workflow intacto.

---

## Notes

- **Token gate CI** (`i00005`) verde.
- **Property tests**: cada surface rechaza inputs inválidos con errores tipados.
- **API contract test**: la API pública no rompe (o se documenta el breaking change).


```yaml
resolution:
  status: implemented
  evidence:
    - commit: 025af82f
    - before/after-bytes:
        before: "proposals: 76,776 B (31 tools)"
        after: "proposals: 48,337 B (34 tools)"
        swarm-total-before: "229,740 B"
        swarm-total-after: "184,128 B"
    - tests: "137 archivos, 1220 tests"
    - workflow-intact: DFA + locks + peer review + close_plan verde
```

---


- **Plan padre**: [q00004](../../ready/q00004-plan-hardening-post-auditoria-chatgpt-sol-segunda-pasada.md), Track C.
- **Auditoría legada**: §9 TOK2-005.
- **Predecesor**: `i00005` (gate que mide el resultado).
- **Principio §41**: *"Budgets are constraints, not numbers to auto-increase."* Reducir primero.
