---
id: x00152
kind: fix
title: "REL-001 · Publicar exactamente los tarballs verificados (rewrite workspace:* compartido)"
status: done
type: proposal
track: release+supply-chain
date: 2026-07-25
closed-by: copilot-minimax-m3
closed-evidence:
  - S1: 7cbb8cfb feat(x00152): REL-001 S1 shared workspace-deps rewrite helper
  - S2: 9416ae14 feat(x00152): REL-001 S2 publishTarballs with verified tarballs
  - S3: dd10e992 test(x00152): REL-001 S3 e2e install + boot smoke for verified tarballs
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

- **Status**: done
- **Files**: `tools/scripts/publish/workspace-deps.ts` (new),
  `tools/scripts/smoke/pack.script.ts`,
  `tools/scripts/publish/workspace-deps.spec.ts` (new)
- **Gate**: type
- implementation:
  - `workspace-deps.ts` exposes `rewriteWorkspaceDeps`, `findWorkspaceConsumers`, `packRewrittenTarball`.
  - All three are idempotent and restore-on-`finally` (atomic temp-file + rename).
  - `pack.script.ts` no longer contains its inline rewrite; it consumes the helper.
  - 5 cases cover version-major, no-workspace, io-error, idempotence, workspace-consumer-finder.
- acceptance:
  - "API única: `resolve(pkgDir, versionPlan) → rewrittenPkgJson`, idempotente, con restore en `finally`"
  - "`pack.script.ts` ya no contiene su copia; consume el helper compartido"
  - "Tests para versión mayor, ausencia de `workspace:*` y errores de I/O"

### S2 — `publishAll` con tarballs verificados

- **Status**: done
- **Files**: `tools/scripts/release/release.script.ts`,
  `tools/scripts/release/publish-tarballs.ts` (new),
  `tools/scripts/release/publish-tarballs.spec.ts` (new)
- **Gate**: type
- implementation:
  - `publish-tarballs.ts` exposes `publishTarballs` and `assertTarballsProvided`.
  - The npm branch of `release.script.ts` calls `assertTarballsProvided`; exit 2 with explicit message on failure.
  - The npm branch generates tarballs via `packRewrittenTarball`, inspects them, then publishes the verified tarballs.
  - The bun branch keeps the current `bun publish` direct path.
  - 3 tests cover the npm-missing-tarballs guard, bun no-op, and `npm publish` argv.
- acceptance:
  - "`publishAll` refactorizado: 1) genera tarballs con rewrite, 2) los inspecciona, 3) publica los tarballs"
  - "Si `--tool=npm` se invoca sin tarballs verificados, exit 2 con mensaje explícito"
  - "Si `--tool=bun`, sigue usando `bun publish` directamente (comportamiento actual)"

### S3 — Test e2e: install + boot del tarball reescrito

- **Status**: done
- **Files**: `tools/scripts/smoke/publish-tarballs.script.ts` (new)
- **Gate**: e2e
- implementation:
  - `publish-tarballs.script.ts` creates a `mkdtemp`, packs `packages/cli` with `packRewrittenTarball`, runs `npm install ./<tgz>`, asserts the installed `package.json` has no `workspace:*`, then runs the CLI's `--help` checking for `Usage:`.
  - Cleans up the temp dir after the run.
  - Network/registry failure → exits 2 with explicit message; other failures → exit non-zero, gates release.
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
