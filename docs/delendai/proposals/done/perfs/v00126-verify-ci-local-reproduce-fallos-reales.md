---
id: v00126
title: "Verify CI local reproduce fallos reales"
kind: perf
status: done
type: proposal
track: ci
date: 2026-08-25
priority: P1
parent-plan: q00006
shipped-in:
    - 525a3bdc # feat(ci): verify CI local reproduce (v00126)
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-cuarta-pasada.md
    section: "Track G / v00126"
    sha256: 2374da0f620dc2cfab21e0d435e143f10174731864efce9f26f2d3a00104232a
related:
    - q00006
    - x00268 # pack smoke preservar output (este verifier lo aprovecha)
    - c00138 # affected CI (este verifier lo aprovecha)
    - c00139 # tier jobs (este verifier reproduce cualquier tier)
    - f00191 # mcpv doctor (incluye verificación de CI)
last-transition-id: 6b4029ad-43c4-4f5e-9c3a-0054d7d45165
last-correlation-id: 6b4029ad-43c4-4f5e-9c3a-0054d7d45165
last-transition-from: review
---

# v00126 — Verify CI local reproduce fallos reales

## Goal

Producir un script (`tools/scripts/ci/local-repro.script.ts`) que,
dado un run de CI fallido en GitHub Actions, descargue los logs y
permita al developer ejecutar localmente el step exacto que falló.
Demostrarlo con un fallo real reciente.

### Comportamiento actual

- Cuando CI falla, el developer tiene que:
  1. Abrir GitHub Actions UI.
  2. Leer el log a ojo.
  3. Intentar adivinar qué comando ejecutar.
- Fricción alta; muchos fallos locales-no-reproducidos son bugs de
  CI no del código.
- La auditoría externa (§33) lo señala como gap de DX.

### Comportamiento deseado

- `bun tools/scripts/ci/local-repro.script.ts <run-id>`:
  - Usa `gh api` (o equivalente) para descargar:
    - El job definition (qué steps corrieron).
    - Los logs completos.
  - Parsea los logs para identificar:
    - Qué step falló (exit code != 0).
    - Qué comando se ejecutó en ese step.
    - Output completo (gracias a `x00268`).
  - Reproduce localmente:
    - `bun run <comando>` con el mismo `working-directory`.
    - Captura output en `build/ci/local-repro-<run-id>.log`.
- Salida:
  - Exit code del comando.
  - Diff entre el log local y el log de CI (para detectar
    divergencias de entorno).
- Demostración:
  - Tomar un fallo reciente de la historia del repo (ej.
    un run nightly que falló) y demostrar que el script lo
    reproduce.

## why

- Cierra §33 de la auditoría.
- Reduce tiempo de debugging de fallos CI.
- Da confianza: si CI dice rojo, el developer puede reproducirlo
  localmente con un comando.
- Habilita que agentes (LLM) también reproduzcan fallos.

## non-goals

- No replica toda la matriz de CI localmente; solo el step que
  falló.
- No sube parches automáticamente.
- No reemplaza al CI real; es una herramienta de debugging.
- No envía telemetría (R1.9).

## architecture

### 1. Script

- `tools/scripts/ci/local-repro.script.ts`:
  - Recibe `run-id` o URL.
  - Llama a `gh api repos/:owner/:repo/actions/runs/<id>/jobs` para
    listar jobs.
  - Para el job fallido, descarga logs.
  - Parsea con regex ligero (los logs de GH Actions tienen formato
    conocido).
  - Extrae el comando del step fallido.
  - Lo ejecuta localmente con `Bun.spawn`.

### 2. Tests

- `tools/scripts/ci/local-repro.spec.ts`:
  - Mock de `gh api` con un fixture de respuesta.
  - Verifica que el comando extraído es el correcto.
  - Verifica que el script aborta si no hay `gh` instalado.

### 3. Demostración

- `tools/scripts/ci/local-repro.demo.script.ts`:
  - Toma un run real reciente y muestra el flujo.

## Slices

### S1 — Script + tests + demo con un fallo real

- **Status**: done
- **Files**: `tools/scripts/ci/local-repro.script.ts`, `tools/scripts/ci/local-repro.spec.ts`, `tools/scripts/ci/local-repro.demo.script.ts`
- **Gate**: type
- review-state: done
- review-implementer: copilot-gpt-5.4-v00126-s1
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Verificacion independiente en el checkout actual: tools/scripts/ci/local-repro.script.ts (26k, extrae step fallido via gh api, reproduce localmente con diff de log), local-repro.spec.ts (9 casos: run id/URL, parseo de logs, fallbacks, demo con run real, rechaza operadores shell) y local-repro.demo.script.ts presentes y commiteados (525a3bdc). Spec focalizado 9/9 verde; tsc de tools con 0 errores en ficheros local-repro (los errores de tools/tsconfig son de ficheros ajenos: per-surface-columns/property-based/vitest.config). Sin asignacion activa a otro agente; revisor fresco.
## acceptance

- Script descargable y ejecutable.
- Reproduce el step fallido localmente.
- Diff entre log local y log de CI.
- Demo con un fallo real reciente.
- Tests verdes.
- `bun run validate` verde.
