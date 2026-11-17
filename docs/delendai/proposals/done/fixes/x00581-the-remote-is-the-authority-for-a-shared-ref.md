---
id: x00581
title: "The remote is the authority for a shared ref"
kind: fix
status: done
type: proposal
track: trust
date: 2026-09-20
tags:
    - work-refs
    - safety
shipped-in:
  - "134db4f39"
last-transition-id: 4c86556b-2719-4404-bffa-f29d10165fae
last-correlation-id: 4c86556b-2719-4404-bffa-f29d10165fae
last-transition-from: review
---

# x00581 — The remote is the authority for a shared ref

## goal

No ref is judged, renamed or deleted on a reading the forge has already
moved past.

## why

`refsUnder` gathers local and remote refs by logical name and keeps the
**first** sha it sees. `for-each-ref` lists `refs/heads/` before
`refs/remotes/`, so the local copy always won — including when it was
behind.

A local copy is a cache of the last fetch. A shared ref is whatever the
forge says it is. Judging one by the other has two failure paths, and
both end in work nobody can reach:

- `isSpent` decides against the stale sha, concludes the work is already
  integrated, and **deletes a remote ref carrying commits the local copy
  never had**.
- `rename` publishes the stale commit under the new name, verifies *that*
  commit correctly — x00564 added exactly that proof — and then deletes
  the original, which held newer work. The proof was of the wrong thing:
  it confirmed the destination and never asked whether the source had
  moved.

Neither has been observed happening here; both are reachable by reading
the code, which is the point at which they should be closed.

## non-goals

- Fetching on every pass. The pass already runs after a fetch; this
  changes which of the two readings it believes.
- Blocking on a ref that has moved. It is simply not touched this time,
  and the next pass judges what is now there.

## architecture

`refsUnder` prefers the remote sha when the two disagree, with the
reasoning recorded where the next reader will look.

`reap` takes the sha the judgement was made against, and re-reads the
forge before deleting: if the ref has moved since, it deletes nothing and
answers false. `rename` passes the source sha through, so the original
name goes only when the forge still has it at the commit that was moved.

## slices

### S1 — a ref is deleted only at the commit it was judged at

- **Status**: done
- **Files**: [`tools/scripts/git/maintain-ref-namespace.script.ts`, `tools/scripts/git/maintain-ref-namespace.script.spec.ts`]
- **Gate**: `npx vitest run tools/scripts/git/maintain-ref-namespace.script.spec.ts`
- review-state: done
- review-implementer: claude-opus-5
- review-reviewer: glm-5.3-max
- review-log: approved by glm-5.3-max — Revisé la entrega real 13eff3e11 (merge #316 = 134db4f39; el candidato de la cola, a4ed012d8, era un merge de alineación de develop sin contenido del slice). refsUnder ahora prefiere el sha REMOTO para cada ref lógico (la copia local es caché del último fetch), y reap verifica contra el sha esperado antes de borrar: si el forge avanzó, no borra nada y responde false; el rename solo elimina el original si el forge aún lo tiene en el sha movido. Evita borrar refs remotas con commits que la copia local nunca tuvo, y publicar/sha obsoletos bajo el nombre nuevo. Acceptance cubierta: refsUnder reporta el sha remoto con la local detrás; reap con sha movido no borra; ambos tests fallaban contra la implementación previa. Gate: 16/16 tests del spec en el worktree del batch (vitest). changedSince: sin commits posteriores que toquen el script. Sin cambios fuera de alcance.
- review-attribution: claude-opus-5 from commit 134db4f39241 names refs/heads/delendai/wip/claude-opus-5/x00581-S1-g1/the-remote-is-the-authority-for-a-shared-ref (134db4f3924180a968b7b49cb05a2d6d2ee2c3f9), opened by glm-5.3-max
## acceptance

- With a local branch behind its remote, `refsUnder` reports the remote
  sha.
- A reap asked for a commit the forge has moved past deletes nothing and
  answers false; the ref is still on the forge afterwards.
- Both tests **fail against the previous implementation**.

## risks and mitigations

- **A ref that keeps moving is never maintained.** It is also never lost,
  and a ref moving on every pass is live work, which this pass is not
  for.
