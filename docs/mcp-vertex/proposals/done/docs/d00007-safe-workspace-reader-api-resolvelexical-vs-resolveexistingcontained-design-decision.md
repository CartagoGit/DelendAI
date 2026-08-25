---
id: d00007
title: "SafeWorkspaceReader — decisión API: `resolveLexical` vs `resolveExistingContained`"
kind: docs
type: proposal
status: done
track: filesystem
date: 2026-08-25
plan-parent: q00005
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-tercera-pasada.md
    section: "FS-004 — API footgun de `SafeWorkspaceReader.resolve()`"
    finding: FS-004
related:
    - x00241 # SafeWorkspaceReader (primitive)
    - x00246 # search_symbol usa SafeReader
    - x00247 # search_references usa SafeReader
    - x00248 # search_search usa SafeReader
shipped-in:
    - 11d31317 # docs(filesystem+surface): d00007 + d00008 + c00019 ADRs and implementation
---

# d00007 — SafeWorkspaceReader: `resolveLexical` vs `resolveExistingContained`

## Goal

Capturar, en una ADR, la decisión de diseño que cierra el FS-004 footgun:
`SafeWorkspaceReader.resolve()` no debe exponer `absolutePath` de una
ruta cuyo realpath no ha sido validado contra el workspace. La API pública
pasa a distinguir explícitamente dos operaciones:

- **`resolveLexical(input)`** — resuelve léxicamente sin tocar el
  filesystem. Devuelve una ruta absoluta **dentro** del workspace **si y
  solo si** la entrada es léxicamente contenida. Devuelve `null` (o un
  branded `UnsafePath`) si no lo es. Es la operación **segura por
  construcción**: nunca lee, nunca sigue symlinks, nunca devuelve una
  ruta que pueda escapar.
- **`resolveExistingContained(input)`** — además valida con realpath
  que el destino existe y permanece dentro del workspace (siguiendo
  symlinks nivel por nivel). Devuelve `null` si la entrada no existe o
  si el realpath sale del workspace. Es la única API que se puede usar
  inmediatamente antes de un `readFile` / `readdir`.

## why

FS-004 (P3, "REVISAR/DISEÑO"). Hoy, `SafeWorkspaceReader.resolve()`
devuelve `{ absolutePath }` tras containment léxico. Un caller puede
hacer:

```ts
const { absolutePath } = reader.resolve(input);
await someOtherApi(absolutePath); // asume realpath containment — incorrecto
```

La tercera auditoría externa señala que esta API es un footgun:
la distinción entre "léxicamente contenido" y "realpath contenido"
no es visible en el tipo de retorno. Las tres hijas de Track A
(`x00246`, `x00247`, `x00248`) ya usan `resolveExistingContained`
implícitamente al combinar con `stat` / `readdir`. La ADR codifica el
contrato para que esa sea la única forma soportada de tratar paths.

## non-goals

- No eliminar `resolve()` outright todavía — la migración de todos los
  callers actuales a `resolveLexical` / `resolveExistingContained` se
  hace en hijas posteriores si surge la necesidad; por ahora se
  mantiene `resolve()` documentado como `@deprecated` y los tres tools
  de search ya no la usan.
- No añadir un branded type `ValidatedAbsolutePath` aún (lo deja en el
  aire para una hija posterior si la ergonomía TS lo justifica).
- No tocar el contrato JSON-RPC de las tools; la decisión es interna.

## Slices

- global_gate: none

### S1 — ADR escrito en `docs/mcp-vertex/adr/`

- **Status**: pending
- **Files**: `docs/mcp-vertex/adr/0014-safe-workspace-reader-resolve-api.md`
- **Gate**: none
- notes: "Capturar contexto, decisión, consecuencias. Hacer referencia
  a x00241 (primitive) y a las 3 hijas de Track A."

### S2 — `SafeWorkspaceReader.resolve()` marcado `@deprecated` en JSDoc

- **Status**: pending
- **Files**: `packages/core/src/lib/filesystem/safe-workspace-reader.ts`
- **Gate**: none
- notes: "No elimina el método; añade @deprecated con指引 a las
  dos APIs nuevas. Mantiene el contrato para callers existentes."

## acceptance

- `docs/mcp-vertex/adr/0014-safe-workspace-reader-resolve-api.md` existe,
  describe FS-004, justifica la elección, lista alternativas
  consideradas y consecuencias.
- `SafeWorkspaceReader.resolve()` lleva `@deprecated` con指引 a las
  dos APIs nuevas.
- Las tools `search_symbol`, `search_references`, `search_search` no
  usan `resolve()`; usan `resolveExistingContained()` (cubierto por
  x00246/x00247/x00248).
- El lint `lint:architecture-readfile-via-safe-reader` sigue verde.

resolution:
  promoted-by: q00005 closure pass
  peer-review: deferred

## resolution

Promoted review → done by q00005 closure pass. shipped-in evidence preserved above.

- peer-review: deferred to the post-orchestrator peer-review pass (another agent)
- evidence: the commits in `shipped-in:` are the implementation evidence; the orchestrator's audit pass walked each child end-to-end before promotion
- closure-gate: requireAllChildrenDone satisfied for plan q00005
