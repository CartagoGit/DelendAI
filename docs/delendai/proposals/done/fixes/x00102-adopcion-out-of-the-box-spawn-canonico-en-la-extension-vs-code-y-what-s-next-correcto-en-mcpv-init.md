---
id: x00102
title: "Adopción out-of-the-box: spawn canónico en la extensión VS Code y What's next correcto en mcpv init"
kind: fix
status: done
type: proposal
track: adoption
date: 2026-07-13
closed-by: cartago (consolidated evidence pass 2026-07-26)
closed-evidence:
  - 3 commits referencing x00102 recovered from git log --grep (precedes convention)
  - all declared Files verified to exist via 3-commit batch
shipped-in:
  - 61e33d69 # feat(proposals): a00057 — Files: doc drift is a recurring class; permanent ratch
  - e0654296 # fix(adoption): x00102 — extension reuses the workspace .mcp.json launch; init Wh
  - b3abc41e # docs(audit): a00053 exhaustive monorepo audit + 5 derived proposals; fix(proposa
---

# x00102 — Adopción out-of-the-box: spawn canónico en la extensión VS Code y What's next correcto en mcpv init

## Goal

Que un proyecto consumidor recién inicializado con mcpv init funcione a la primera: la extensión VS Code deja de asumir un script "mcp-vertex" inexistente en el package.json del consumidor y resuelve su spawn por la misma cadena canónica dual que .mcp.json (bunx publicado → host-entry-resolver local), y el resumen "What's next" de init deja de imprimir pasos rotos (open .gitkeep, bun mcpv scaffold, validate asumido). El smoke de external-install cubre ambos.

## why

Findings 3, 4 y 5 de a00053: hoy la primera experiencia de un adoptante es una extensión que no conecta y un resumen post-init con un archivo equivocado y un comando inválido. La publicación en npm (gates del usuario 2026-07-07) desbloquea el tramo final, pero estos fixes son necesarios con o sin npm.

## non-goals

- Publicar @mcp-vertex/cli en npm (decisión del usuario con gates propios)
- Rediseñar el flujo interactivo de init
- Soporte de nuevos IDEs

## Slices

- global_gate: e2e

### S1 — Extensión: default spawn vía launch canónico dual (reutilizando host-entry-resolver)
- **Status**: done
- **Files**: `extensions/vscode/src/extension.ts` (spawn resolution landed inline here, no separate resolver module)
- **Gate**: e2e
- acceptance:
  - "en un workspace con .mcp.json generado por init, la extensión conecta sin configurar mcp-vertex.server.command"
  - "mcp-vertex.server.command/args siguen teniendo precedencia cuando el usuario los define"
  - "sin script mcp-vertex en package.json la extensión ya no muere con bun run mcp-vertex"

### S2 — init What's next: propuesta real en vez de .gitkeep, validate condicionado, comando scaffold válido
- **Status**: done
- **Files**: `packages/cli/src/lib/init/init-human-summary.service.ts`, `packages/cli/src/lib/init/init-human-summary.service.spec.ts`
- **Gate**: e2e
- acceptance:
  - "el paso enlaza la propuesta f00001-adopt-* (archivo .md, nunca .gitkeep)"
  - "el hint de validate solo aparece si el package.json del consumidor tiene ese script"
  - "el hint de migración usa un comando mcpv válido"

### S3 — Smoke de consumidor: external-install cubre spawn de extensión y What's next
- **Status**: done
- **DependsOn**: [S1, S2]
- **Files**: `tools/scripts/verify/external-install-smoke.script.ts`
- **Gate**: e2e
- acceptance:
  - "el smoke falla si el What's next contiene .gitkeep o un comando inválido"
  - "el smoke verifica que el spawn por defecto de la extensión resuelve en un consumidor init'ed"

## acceptance

- en un workspace con .mcp.json generado por init, la extensión conecta sin configurar mcp-vertex.server.command
- mcp-vertex.server.command/args siguen teniendo precedencia cuando el usuario los define
- sin script mcp-vertex en package.json la extensión ya no muere con bun run mcp-vertex
- el paso enlaza la propuesta f00001-adopt-* (archivo .md, nunca .gitkeep)
- el hint de validate solo aparece si el package.json del consumidor tiene ese script
- el hint de migración usa un comando mcpv válido
- el smoke falla si el What's next contiene .gitkeep o un comando inválido
- el smoke verifica que el spawn por defecto de la extensión resuelve en un consumidor init'ed
