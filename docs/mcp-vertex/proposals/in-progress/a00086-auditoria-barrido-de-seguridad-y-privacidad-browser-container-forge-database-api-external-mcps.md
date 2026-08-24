---
id: a00086
title: "auditoría: barrido de seguridad y privacidad (browser, container, forge, database, api, external-mcps, ...)"
kind: audit
status: in-progress
type: proposal
track: plugin-hardening
date: 2026-08-24
---

# a00086 — auditoría: barrido de seguridad y privacidad (browser, container, forge, database, api, external-mcps, ...)

## Goal

Auditar los plugins de mayor superficie de seguridad/privacidad, siguiendo el checklist §24 de la auditoría legada, y convertir solo los hallazgos demostrables en fixes.

Parte del plan `q00003`. Referencia legada: §24 de `docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md` + §30 (modelo de privacidad).

Ejes de revisión por grupo (cada hallazgo se marca `confirmed / probable / not reproducible / already fixed / accepted risk`):

- **browser, web-fetch, link-check**: sandbox, network boundaries, redirects, DNS rebinding, allowlist, localhost/private networks, downloads, secrets en page content/logs.
- **container, forge, git**: command safety (Docker/K8s), process tree timeout, socket access, operaciones destructivas, resets, writes, huge diffs/binarios.
- **database, env, api, security**: read-only guarantees, credenciales/connection strings, NUNCA devolver secret values, SSRF, redirects, auth headers, CVE network behavior.
- **external-mcps, logs, observability, orchestrator-runner**: trust boundary, capability import, namespace conflicts, redaction, PII accidental, process lifecycle, token fan-out.

La auditoría es trabajo de lectura de código (no solo comandos): se documenta archivo+línea y se propone fix solo con evidencia.

## why

La auditoría legada revisa los 43 plugins como checklist, no como sentencia. Este barrido de seguridad/privacidad convierte la parte de mayor riesgo en hallazgos verificables que alimentan fixes con evidencia.

## non-goals

- No 'arreglar' observaciones no reproducibles.
- No tocar código en esta propuesta (solo hallazgos + propuestas hijas derivadas).
- No cubrir error-reporting (track privacy dedicado).

## Slices

- global_gate: none

### S1 — Auditar browser/web-fetch/link-check
- **Status**: pending
- **Files**: `plugins/browser/**`, `plugins/web-fetch/**`, `plugins/link-check/**`
- **Gate**: none
- acceptance:
  - "Cada eje revisado con evidencia archivo+línea; hallazgos clasificados."

### S2 — Auditar container/forge/git
- **Status**: pending
- **Files**: `plugins/container/**`, `plugins/forge/**`, `plugins/git/**`
- **Gate**: none
- acceptance:
  - "Destructivas, process tree, socket y writes revisados; hallazgos clasificados."

### S3 — Auditar database/env/api/security
- **Status**: pending
- **Files**: `plugins/database/**`, `plugins/env/**`, `plugins/api/**`, `plugins/security/**`
- **Gate**: none
- acceptance:
  - "Read-only, credenciales, secret values, SSRF/redirects y CVE network revisados."

### S4 — Auditar external-mcps/logs/observability/orchestrator-runner
- **Status**: pending
- **Files**: `plugins/external-mcps/**`, `plugins/logs/**`, `plugins/observability/**`, `plugins/orchestrator-runner/**`
- **Gate**: none
- acceptance:
  - "Trust boundary, PII, redaction y lifecycle de procesos revisados."

## acceptance

- Cada eje revisado con evidencia archivo+línea; hallazgos clasificados.
- Destructivas, process tree, socket y writes revisados; hallazgos clasificados.
- Read-only, credenciales, secret values, SSRF/redirects y CVE network revisados.
- Trust boundary, PII, redaction y lifecycle de procesos revisados.

## verified state

Pendiente: los hallazgos de esta auditoría se verifican contra el código antes de su cierre.

## findings

Pendiente: sin hallazgos clasificados aún.

## scoreboard

| Severidad | Conteo |
|---|---|
| alta | 0 |
| media | 0 |
| baja | 0 |
