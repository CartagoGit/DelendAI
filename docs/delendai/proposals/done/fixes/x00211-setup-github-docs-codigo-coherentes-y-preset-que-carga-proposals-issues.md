---
id: x00211
title: "setup-github: docs↔código coherentes y preset que carga proposals/issues"
kind: fix
status: done
type: proposal
track: setup
date: 2026-08-23
closed: 2026-08-24
shipped-in:
  - acf5df01 # S3: align CROSS-PROJECT-SETUP with the real read-only setup flow
  - 40ea326c # S2: init_config derives swarm preset for TS monorepos
  - e85e0cc4 # follow-up: tool-outputs preset enum accepts swarm
---

# x00211 — setup-github: docs↔código coherentes y preset que carga proposals/issues

## Goal

Que `setup-github` (MCP tool y CLI) y `CROSS-PROJECT-SETUP.md` digan la verdad el uno del otro: o el flujo operativo de 7 pasos se implementa de verdad (escribir config vía writer inyectado, verificar tier, imprimir el arranque, marcar configured), o los docs se reducen al flujo real de solo-lectura. Además, que `init_config` recomiende un preset que deje cargados proposals/issues cuando el proyecto los necesita.

## why

Auditoría 2026-08-24 (hallazgos C1, C2): CROSS-PROJECT-SETUP.md describe 7 pasos operativos (escribir config, verificar tier, imprimir arranque, marcar configured) pero `setup_github` es explícitamente de solo lectura ("it never writes config or calls GitHub"). Un LLM que sigue los 7 pasos no produce ningún efecto. Además init_config recomienda lean/standard/minimal, que no cargan proposals/issues, obligando a editar el preset a mano.

## non-goals

- No tocar el plugin issues en sí (fetch/issues list).
- No implementar el tool de adopción end-to-end (propuesta feat).
- No tocar proposal_adopt.

## Slices

- global_gate: type

### S1 — Flujo operativo setup-github (o doc realista)
- **Status**: done
- **Files**: `packages/core/src/lib/setup/setup-steps.ts`, `plugins/issues/src/lib/github-setup.ts`, `plugins/issues/src/lib/tools/setup-github.tool.ts`, `packages/core/src/lib/cli/setup-subcommand.ts`
- **Gate**: type
- acceptance:
  - "El motor de pasos produce pasos operativos reales (write/verify/print/mark) con writer inyectado y sin I/O síncrono en el plugin."
  - "setup_github (tool) y setup-subcommand (CLI) emiten la misma guía operativa."
  - "El doc y el código coinciden (ningún paso prometido queda sin implementar)."
- implementation:
  - "Se eligió la rama 'doc realista': la guía es de solo-lectura por diseño. Además se unificó el vocabulario de tiers (`token`/`anon` → `rest-authed`/`rest-anon`) para que el motor de setup-github y el cliente de issues compartan un mismo enum."

### S2 — init_config recomienda preset que carga proposals/issues
- **Status**: done
- **Files**: `packages/core/src/lib/bootstrap/derive-config.ts`, `packages/core/tests/src/lib/bootstrap/derive-config.spec.ts`
- **Gate**: type
- acceptance:
  - "init_config recomienda un preset que carga proposals/issues cuando el análisis lo requiere (swarm o full), no lean/standard/minimal."
  - "La recomendación queda documentada y testeada."
- implementation:
  - "Los monorepos TypeScript ahora derivan `swarm` (⊇ proposals) en lugar de `standard`, de modo que el workflow de propuestas carga sin editar la config a mano; `issues` queda opt-in vía `full` (requiere repo GitHub)."

### S3 — Docs de cross-project alineados
- **Status**: done
- **Files**: `docs/mcp-vertex/CROSS-PROJECT-SETUP.md`
- **Gate**: type
- acceptance:
  - "CROSS-PROJECT-SETUP.md refleja el comportamiento real (pasos, preset, arranque)."
  - "Sin pasos fantasma."
- implementation:
  - "La tabla de 7 pasos operativos se sustituyó por la guía real de solo-lectura (4 pasos: auth/config/load/verify) que el motor devuelve."
  - "La matriz de tiers se alineó al runtime real de issues (gh/rest-authed/rest-anon) y se anotó que el motor de setup-github usa las formas cortas token/anon (a unificar en S1)."

### S4 — Tests de setup-github y derive-config
- **Status**: done
- **Files**: `plugins/issues/tests/src/lib/github-setup.spec.ts`, `packages/core/tests/src/lib/cli/setup-subcommand.spec.ts`, `packages/core/tests/src/lib/setup/setup-steps.spec.ts`, `packages/core/tests/src/lib/setup/cross-project-guide.spec.ts`
- **Gate**: type
- acceptance:
  - "Specs cubren pasos operativos y la recomendación de preset."
- implementation:
  - "Los specs de setup-github/derive-config cubren el nuevo vocabulario de tiers y la recomendación swarm para monorepos."

## acceptance

- El motor de pasos produce pasos operativos reales (write/verify/print/mark) con writer inyectado y sin I/O síncrono en el plugin.
- setup_github (tool) y setup-subcommand (CLI) emiten la misma guía operativa.
- El doc y el código coinciden (ningún paso prometido queda sin implementar).
- init_config recomienda un preset que carga proposals/issues cuando el análisis lo requiere (swarm o full), no lean/standard/minimal.
- La recomendación queda documentada y testeada.
- CROSS-PROJECT-SETUP.md refleja el comportamiento real (pasos, preset, arranque).
- Sin pasos fantasma.
- Specs cubren pasos operativos y la recomendación de preset.
