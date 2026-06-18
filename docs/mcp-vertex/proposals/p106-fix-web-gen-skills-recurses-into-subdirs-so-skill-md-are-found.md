---
id: p106
status: pending
type: proposal
track: web
date: 2026-06-18
---

# p105 — fix(web): gen-skills recurses into subdirs so SKILL.md are found

## Goal

Hacer que `apps/web/scripts/gen-skills.ts:walkSkills` recaude en subdirectorios para descubrir los SKILL.md que viven en `skills/<plugin>/SKILL.md`. Hoy solo procesa el nivel raíz, así que `walkSkills('skills/')` devuelve `[]`, `gen-skills --strict` falla, `apps/web/src/data/skills.json` queda vacío y la página `/skills` se renderiza sin contenido. El fix cambia ~10 líneas: el bucle se vuelve recursivo, y `rel` se construye desde la ruta absoluta (no desde `skills/${entry}`) para que `slugFromPath` (que ya espera `skills/<plugin>/SKILL.md`) reciba el formato correcto. Se añade un spec en `apps/web/scripts/__tests__/gen-skills.spec.ts` con 2 casos (dir inexistente + recuperación desde subdir). Aceptación: `bun run site:strict` ya no falla por este motivo; `apps/web/src/data/skills.json` contiene los 2 SKILL.md con path `skills/mcp-vertex-…/SKILL.md`; `bun run validate` verde.

## Slices

- global_gate: lint

### s1-fix-and-test — Recursar walkSkills + spec + regenerar skills.json
- files: apps/web/scripts/gen-skills.ts
- files: apps/web/scripts/__tests__/gen-skills.spec.ts
- files: apps/web/src/data/skills.json
- gate: lint
- acceptance:
  - "walkSkills recursa en subdirectorios"
  - "rel se construye desde la ruta absoluta"
  - "spec nuevo con 2 casos (dir inexistente + recuperación desde subdir) verde"
  - "apps/web/src/data/skills.json contiene los 2 SKILL.md con path skills/mcp-vertex-…/SKILL.md"
  - "bun run site:strict ya no falla por este motivo"
  - "bun run validate verde (typecheck + lint + scss + tests)"
- status: pending
