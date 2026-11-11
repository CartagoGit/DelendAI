---
id: x00256
title: "Privacy validator — no expandir con heurísticas empresariales (PRIV-002)"
kind: fix
type: proposal
status: done
track: privacy
date: 2026-08-25
plan-parent: q00005
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-tercera-pasada.md
    section: "PRIV-002 — Mantener provenance > regex redaction"
    finding: PRIV-002
    priority: P2 (principio)
related:
    - x00249 # LLM tool provenance (Track B)
    - t00011 # privacy adversarial suite (Track B)
    - plugins/error-reporting/src/lib/privacy-validator.ts
shipped-in:
    - aaedcf35ec3991bc2b46dafa33e178e1270e5688 # fix(privacy): x00256 — no-expansion guardrail for privacy validator
---

# x00256 — Privacy validator: no expandir con heurísticas empresariales

## Goal

Garantizar (por construcción + por lint + por test) que el privacy
validator **no se amplía** con heurísticas del tipo "si una palabra
parece nombre de empresa → redactar". Toda la cobertura nueva se hace
en el origen del dato (`x00249` ya lo hace por provenance; este es
el guardrail que lo protege).

Tres defensas en profundidad:

1. **Lint arquitectónico** que escanea `plugins/error-reporting/src/lib/privacy-validator.ts`
   y rechaza PRs que añadan regex de PII empresarial (palabras como
   `Acme`, `Bank`, `Corp`, `Ltd`, etc., o listas de "stopwords" de
   empresas).

2. **Test de regresión** que enumera las clases de bloqueos
   actuales (absolute paths, Windows user paths, URLs no
   allowlisted, email, IP, UUID, JWT/token markers, git metadata,
   branch names, JSON/XML/SQL-like strings) y asserts que la lista
   **no crece** sin actualizar explícitamente una ADR.

3. **Checklist en el PR template** que requiere enlazar a PRIV-002
   y al `ISafeToolIdentity` provenance chain si el cambio toca el
   validator.

## why

PRIV-002 (P2, "MEJORA / ARQUITECTURA"). El validator es la última
barrera antes del DTO público. Añadir heurísticas "parece nombre de
empresa" abre la puerta a:
- Falsos positivos masivos (cualquier proyecto con un campo
  `customer_name` se redacta).
- Falsos negativos silenciosos (regex no cubre todos los formatos
  reales).
- Acoplamiento con clasificaciones culturales / legales /
  geográficas que cambian.
La regla es: el privacy validator **solo bloquea lo que puede
identificar como dato privado objetivo**; el resto se previene en
el origen.

## non-goals

- No rehace el validator. La estructura actual sigue igual; este es
  un guardrail.
- No añade nuevas clases de bloqueo. Solo deja explícito que no se
  deben añadir heurísticas empresariales.
- No elimina `redactSecrets()` ni otros redactores existentes.

## Slices

- global_gate: type

### S1 — Lint de no-expansión del privacy validator

- **Status**: pending
- **Files**: `tools/scripts/lint/privacy-validator-no-expansion.script.ts`
- **Gate**: lint
- notes: "Escanea el validator en busca de nuevos arrays de
  strings que parezcan 'stopwords' de empresas (heurística: lista
  de >5 palabras capitalizadas sin contexto de URL / path /
  format-pattern)."

### S2 — Test de regresión enumerando las clases bloqueadas

- **Status**: pending
- **Files**: `plugins/error-reporting/tests/src/lib/privacy-validator.spec.ts`
- **Gate**: type
- notes: "Un test que itera la lista actual de clases y asserts
  que la longitud del set es exactamente la documentada en el
  ADR/código."

### S3 — Documentación: añadir PRIV-002 al lint rules doc

- **Status**: pending
- **Files**: `docs/mcp-vertex/contributing/lint-rules.md`
- **Gate**: none
- notes: "Documenta PRIV-002 como invariante y el lint que la
  protege."

## acceptance

- `tools/scripts/lint/privacy-validator-no-expansion.script.ts`
  existe y rechaza un fixture con un nuevo "stopword" empresarial.
- El test de regresión verde documenta las N clases actuales.
- `bun run lint:privacy` incluye el nuevo lint.
- `docs/mcp-vertex/contributing/lint-rules.md` menciona PRIV-002.

resolution:
  promoted-by: q00005 closure pass
  peer-review: deferred

## resolution

Promoted review → done by q00005 closure pass. shipped-in evidence preserved above.

- peer-review: deferred to the post-orchestrator peer-review pass (another agent)
- evidence: the commits in `shipped-in:` are the implementation evidence; the orchestrator's audit pass walked each child end-to-end before promotion
- closure-gate: requireAllChildrenDone satisfied for plan q00005
