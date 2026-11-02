---
id: t00005
title: "error-reporting: suite adversarial de privacidad (payload invariante ante datos privados)"
kind: test
status: done
type: proposal
track: privacy
date: 2026-08-24
---

# t00005 — error-reporting: suite adversarial de privacidad (payload invariante ante datos privados)

## Goal

Crear una suite adversarial que demuestre la propiedad central de privacidad: **el payload enviado es idéntico aunque cambien todos los datos privados del proyecto, siempre que el error interno MCP Vertex sea el mismo**.

Parte del plan `q00003`. Referencia legada: §2 ER-007 de `docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md`.

Cobertura mínima de fixtures:

- `/Users/alice/client-x/...`, `/home/bob/acme/...`, `C:\Users\Carol\work\secret\...`
- repos GitHub privados, emails, nombres de empresas
- AWS keys, GitHub PAT, JWT, OpenAI/Anthropic keys, connection strings
- URLs internas, IPs privadas, nombres de bases de datos
- stack traces mixtos host/MCP
- errores con JSON incrustado, source code, SQL, GraphQL, nombres de clientes
- Unicode y strings enormes

Criterio de aceptación: `Project A private data + same MCP bug` y `Project B private data + same MCP bug` deben generar **mismo fingerprint** y **mismo body público**, salvo versión/runtime/clase de plataforma si se considera necesario.

## why

Sin una propiedad comprobable, cualquier cambio futuro puede reintroducir una fuga silenciosa. La suite convierte la privacidad en un invariante verificado por tests, no en una promesa de documentación.

## non-goals

- No testear el redactor genérico de secrets (ya cubierto por su propia suite).
- No cubrir issues-triage.
- No probar el envío real a GitHub (sin red en tests).

## Slices

- global_gate: type

### S1 — Fixtures adversas reutilizables
- **Status**: done
- **Files**: `plugins/error-reporting/tests/adversarial-fixtures.ts`
- **Gate**: type
- acceptance:
  - "Cubren paths Unix/Windows, secrets (AWS/GitHub/JWT/OpenAI/Anthropic), connection strings, URLs internas, IPs privadas, emails, nombres de empresa/cliente, SQL/GraphQL/JSON/source embebidos, Unicode, strings enormes."
- review-state: done
- review-implementer: swarm-implementer
- review-reviewer: orchestrator-fase1-review
- review-log: approved by orchestrator-fase1-review — Redo. validate verde.
### S2 — Invariante de invarianza del payload
- **Status**: done
- **Files**: `plugins/error-reporting/tests/privacy-adversarial.spec.ts`
- **Gate**: type
- acceptance:
  - "Mismo bug interno + datos privados distintos => mismo fingerprint y mismo body público."
  - "Ningún fixture privado aparece en el payload final (path, email, token, URL, repo)."
  - "La propiedad se mantiene para stack traces mixtos host/MCP."

## acceptance

- Cubren paths Unix/Windows, secrets (AWS/GitHub/JWT/OpenAI/Anthropic), connection strings, URLs internas, IPs privadas, emails, nombres de empresa/cliente, SQL/GraphQL/JSON/source embebidos, Unicode, strings enormes.
- Mismo bug interno + datos privados distintos => mismo fingerprint y mismo body público.
- Ningún fixture privado aparece en el payload final (path, email, token, URL, repo).
- La propiedad se mantiene para stack traces mixtos host/MCP.
