---
id: d00008
title: "Reserved paths: política explícita para `.env`, `.env.local`, `.env.production`, `.env.secret`"
kind: docs
type: proposal
status: done
track: filesystem
date: 2026-08-25
plan-parent: q00005
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-tercera-pasada.md
    section: "FS-005 — Política para `.env.*`"
    finding: FS-005
related:
    - x00241 # SafeWorkspaceReader
    - x00242 # context-for-change usa SafeReader
    - x00243 # impact-analysis usa SafeReader
shipped-in:
    - 11d31317 # docs(filesystem+surface): d00007 + d00008 + c00019 ADRs and implementation
---

# d00008 — Reserved paths: `.env`, `.env.local`, `.env.production`, `.env.secret`

## Goal

Documentar y codificar la política explícita de reserved paths para
archivos `.env*`. La política distingue tres casos:

| Path                       | Bloqueado | Por qué |
|----------------------------|-----------|---------|
| `.env`                     | **Sí**    | Convención universalmente aceptada como secreto; bloquear toda lectura por defecto. |
| `.env.local`               | **Sí**    | Convención de Next.js, Remix, Vite, Astro: secrets locales del desarrollador. Bloquear. |
| `.env.production`          | **Sí**    | Convención explícita para secrets de producción. Bloquear. |
| `.env.development`         | **Sí**    | Convención explícita para secrets de development. Bloquear por simetría con `.env.production`. |
| `.env.secret`              | **Sí**    | Convención menos universal pero el sufijo `.secret` indica secret. Bloquear. |
| `.env.example`             | **No**    | Convención explícita: solo placeholders, nunca secretos. Permitir lectura (es metadata de onboarding). |
| `.env.test`                | **No**    | Convención explícita: solo fixtures, no secretos reales. Permitir lectura. |
| `.env.*` (cualquier otro)  | **No**    | Política conservadora por defecto: si el caller sabe lo que hace, puede permitirlo explícitamente. |

## why

FS-005 (P3, "REVISAR"). Hoy el resolver trata únicamente `.env` (o un
conjunto equivalente implícito) como reservado. La auditoría detecta
que `.env.local`, `.env.production`, `.env.secret` son convenciones
ampliamente adoptadas y merecen la misma protección. Por el otro
lado, `.env.example` y `.env.test` son explícitamente metadata de
desarrollo y deben poder leerse.

## non-goals

- No crear un parser de dotenv en este repo. La política es solo de
  filesystem containment.
- No añadir excepciones configurables por host. La lista es fija y
  global; un host puede pedir un override solo creando su propio
  `SafeWorkspaceReader` (la primitive ya lo permite).
- No tocar `.git/`, `node_modules/`, `.vscode/` — esos ya estaban
  reservados y se mantienen como están.

## Slices

- global_gate: none

### S1 — ADR escrito con la tabla de reserved `.env*` paths

- **Status**: pending
- **Files**: `docs/mcp-vertex/adr/0015-reserved-env-paths-policy.md`
- **Gate**: none
- notes: "Captura la tabla, justifica cada caso, lista convenciones
  externas (Next.js, Astro, Vite, etc.) que motivan la elección."

### S2 — Tests adversariales para la policy

- **Status**: pending
- **Files**: `packages/core/tests/src/lib/filesystem/safe-workspace-reader.spec.ts`
- **Gate**: none
- notes: "Para cada path de la tabla: un test que confirma el
  comportamiento esperado (allow/deny)."

## acceptance

- `docs/mcp-vertex/adr/0015-reserved-env-paths-policy.md` existe y
  lista explícitamente cada path y la decisión.
- `SafeWorkspaceReader.resolveLexical('.env.production')` devuelve
  `null` (bloqueado).
- `SafeWorkspaceReader.resolveLexical('.env.example')` devuelve ruta
  (permitido).
- Tests verdes para los 7 casos de la tabla.
- La primitive mantiene `git/`, `node_modules/`, `.vscode/` reservados
  (no regresión).

resolution:
  promoted-by: q00005 closure pass
  peer-review: deferred

## resolution

Promoted review → done by q00005 closure pass. shipped-in evidence preserved above.

- peer-review: deferred to the post-orchestrator peer-review pass (another agent)
- evidence: the commits in `shipped-in:` are the implementation evidence; the orchestrator's audit pass walked each child end-to-end before promotion
- closure-gate: requireAllChildrenDone satisfied for plan q00005
