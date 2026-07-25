---
id: x00152
kind: fix
title: "REL-001 · Publicar exactamente los tarballs verificados (rewrite workspace:* compartido)"
status: ready
type: proposal
track: release+supply-chain
date: 2026-07-25
related:
  - a00070 # intake auditoría externa
  - a00071 # auditoría independiente
---

# x00152 — REL-001 · Publicar exactamente los tarballs verificados (rewrite workspace:* compartido)

## Goal

Extraer una única función `resolveWorkspaceDependenciesForPublish` usada
tanto por `tools/scripts/smoke/pack.script.ts` como por
`tools/scripts/release/release.script.ts`; generar tarballs inmutables con
`workspace:*` ya reescrito, inspeccionar cada `package.json` interno, instalar
y arrancar los tarballs, y publicar **esos** tarballs (no los directorios
fuente).

Concretamente:

1. Mover el rewrite de `workspace:*` a
   `tools/scripts/publish/workspace-deps.ts` con API pública
   `resolve(pkgDir, versionPlan) → rewrittenPkgJson` (idempotente, con
   `restore` en `finally`).
2. `pack.script.ts` consume el helper compartido (no mantiene su copia local).
3. `publishAll` refactorizado en 3 pasos: (a) genera tarballs con rewrite,
   (b) los inspecciona (verifica `0` ocurrencias de `workspace:` dentro del
   tarball), (c) publica los tarballs.
4. Si `--tool=npm` se invoca sin tarballs verificados → exit 2 con mensaje
   explícito.
5. Test e2e: instalar un tarball reescrito en un proyecto vacío y arrancar el
   bin CLI.

## why

Las auditorías `a00070` y `a00071` confirman **C-03**: `@mcp-vertex/client` y
`@mcp-vertex/cli` declaran `workspace:*` en producción; `npm publish` NO los
reescribe (el comentario del propio driver lo admite en
`tools/scripts/release/release.script.ts#L17-L29`); el smoke sí reescribe
temporalmente en `tools/scripts/smoke/pack.script.ts#L127-L167`, pero el
workflow de release
(`.github/workflows/release.yml`) usa `--tool=npm --provenance` directamente.
Esto publica tarballs ininstalables para `client/cli` cuando el usuario hace
`npm install`.

El smoke prueba un artefacto **distinto** al publicado. Esto es una señal
falsa verde y rompe el flujo de release.

## non-goals

- No migrar de `npm publish` a `bun publish` globalmente.
- No firmar atestación de procedencia en este slice (queda como follow-up
  separado).
- No tocar dependencias runtime de los plugins; solo dependencias intra-repo
  (`@mcp-vertex/core`, `@mcp-vertex/client`).
- No introducir un registry efímero ni proxy npm — solo verificar que el
  artefacto publicado es el mismo que el smoke prueba.

## Slices

- global_gate: lint

### S1 — Helper compartido + pack consume el helper

- **Status**: pending
- **Files**: `tools/scripts/publish/workspace-deps.ts` (new),
  `tools/scripts/smoke/pack.script.ts`,
  `tools/scripts/publish/workspace-deps.spec.ts` (new)
- **Gate**: type
- acceptance:
  - "API única: `resolve(pkgDir, versionPlan) → rewrittenPkgJson`, idempotente, con restore en `finally`"
  - "`pack.script.ts` ya no contiene su copia; consume el helper compartido"
  - "Tests para versión mayor, ausencia de `workspace:*` y errores de I/O"

### S2 — `publishAll` con tarballs verificados

- **Status**: pending
- **Files**: `tools/scripts/release/release.script.ts`,
  `tools/scripts/release/publish-tarballs.ts` (new)
- **Gate**: type
- acceptance:
  - "`publishAll` refactorizado: 1) genera tarballs con rewrite, 2) los inspecciona, 3) publica los tarballs"
  - "Si `--tool=npm` se invoca sin tarballs verificados, exit 2 con mensaje explícito"
  - "Si `--tool=bun`, sigue usando `bun publish` directamente (comportamiento actual)"

### S3 — Test e2e: install + boot del tarball reescrito

- **Status**: pending
- **Files**: `tools/scripts/smoke/publish-tarballs.script.ts` (new)
- **Gate**: e2e
- acceptance:
  - "Crea `mkdtemp`, `npm install ./tgz`, ejecuta el bin CLI"
  - "Verifica que el `package.json` del tarball NO contiene `workspace:*`"
  - "Si falla → exit no-cero, gate bloquea release"

## acceptance

- Helper exportado y consumido por `pack` y `release`.
- `release --tool=npm --publish` nunca publica directo desde el directorio
  fuente sin verificar el tarball.
- Test e2e que reproduce el caso `npm install` real.
- `bun run validate` verde.

## notes

- Cita textual del bug (a00070): "El driver documenta que npm no realiza la
  reescritura necesaria, pero `publishAll` se limita a ejecutar `npm publish`
  en cada directorio."
- Worktree de desarrollo: `agent/copilot-audit-fixes` (branch desde
  `develop@89d9a490`).
- Coordinación con el equipo de release: este slice **bloquea** el release
  automático con `--tool=npm` hasta que el helper esté en verde.

### next actions

1. Reclamar S1 — helper compartido + tests.
2. Reclamar S2 — refactor `publishAll`.
3. Reclamar S3 — e2e gate.
4. Pair review con un agente distinto antes de merge.
5. Tras merge: rotar `NPM_TOKEN` si hay duda sobre exposición (recomendación
   del informe externo §8 Fase 0).
