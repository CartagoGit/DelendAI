---
id: x00305
title: "Exponer outputSchema efectivo de proposals_close_plan en runtime"
kind: fix
status: ready
type: proposal
track: audit-stabilization
priority: P0
date: 2026-08-29
parent-plan: q00012
related: [F-002, x00302]
shipped-in: ["b8d35225d # fix(proposals): expose close-plan outputSchema at runtime"]
---

# x00305 — Exponer outputSchema efectivo de proposals_close_plan

## goal

Garantizar que la registration que llega al protocolo MCP para `proposals_close_plan` expone un `outputSchema` que cubre dry-run y cierre aplicado.

## why

El source local de `plugins/proposals/src/lib/tools/close-plan.tool.ts` contiene una union de schema, pero el E2E de protocolo observa la herramienta sin `outputSchema`. Debe localizarse la ruta efectiva, incluyendo dist, assembly y cualquier registration duplicada.

## why this design

La correccion sigue la ruta runtime observada y conserva el E2E como autoridad; no relaja el contrato para ocultar la discrepancia.

## non-goals

- Cambiar la semantica de cierre de planes.
- Relajar el E2E.
- Modificar `x00298` salvo conflicto directo y documentado.

## architecture

El runtime registra exactamente una herramienta con `outputSchema`; el E2E no reporta herramientas ausentes y las respuestas de exito validan.

## slices

### S1 — Reparar registration y validar runtime

- **Status**: done
- **Files**: `plugins/proposals/src/lib/tools/close-plan.tool.ts`, `plugins/proposals/tests`, `packages/core/tests/src/lib/e2e/outputschema.e2e.spec.ts`
- **Gate**: `bunx vitest run packages/core/tests/src/lib/e2e/outputschema.e2e.spec.ts plugins/proposals/tests/src/lib/tools/close-plan.tool.spec.ts`
- Localizar la registration efectiva de `proposals_close_plan`.
- Actualizar dist/generated artifacts solo si estan stale.
- Mantener tests de registration y E2E.
- review-state: done
- review-implementer: implementation_runner
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Aprobación independiente: registration directa y managed/lazy exponen outputSchema; la ruta managed/lazy ejecuta callTool real y valida structuredContent; los cuatro escenarios directos están cubiertos; no hay hooks de test en IClosePlanToolOptions ni relajación del E2E.
## acceptance

- [ ] `mcp-vertex_proposals_proposals_close_plan` no aparece en `missing outputSchema`.
- [ ] Dry-run closable y dry-run blocked validan contra el schema.
- [ ] Cierre aplicado y respuesta blocked validan contra el schema de exito.
- [ ] La registration directa y la managed lazy assembly coinciden.
- [ ] Typecheck, build y tests dirigidos pasan.

### Required tests

- `bunx vitest run packages/core/tests/src/lib/e2e/outputschema.e2e.spec.ts plugins/proposals/tests/src/lib/tools/close-plan.tool.spec.ts`
- `bunx tsc --noEmit -p tsconfig.json`
- `bun run build`

## risks and mitigations

Revertir solo los cambios de registration/schema y regenerar artefactos afectados. No usar reset sobre el working tree compartido.

- La discrepancia puede estar en dist o en una segunda registration path. El arreglo debe demostrar el punto exacto de divergence antes de editar.

### Completion evidence

Registrar la lista runtime de tools, schema observado, tests, build y hash de commit.
