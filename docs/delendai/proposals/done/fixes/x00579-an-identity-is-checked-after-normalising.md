---
id: x00579
title: "An identity is checked after normalising"
kind: fix
status: done
type: proposal
track: trust
date: 2026-09-20
tags:
    - work-identity
    - agents
shipped-in:
  - "b39bfe073e3b380477eb17eaa514457e154faa6d"
last-transition-id: b999596d-44da-4853-a9bd-9861e2663d64
last-correlation-id: b999596d-44da-4853-a9bd-9861e2663d64
last-transition-from: review
---

# x00579 — An identity is checked after normalising

## goal

No host can produce a work ref with an empty agent in it, and no host's
bad answer can hide another host's good one.

## why

`resolveWorkAgentId` asked each source whether it was present, and only
then normalised it. `read` rejects an empty or blank string and nothing
else, so a model string of `!!!` passed as present and normalised to
`''` — and was returned as a valid identity:

```
{ model: '!!!' }  ->  { id: '', source: 'model' }
```

Two consequences, and the second is the damaging one.

The ref built from that identity is `…/wip//x1-S1-g1/topic`, which is
not a ref. And because the source had "answered", the resolver stopped:

```
{ model: '!!!', environment: 'codex' }  ->  { id: '', source: 'model' }
```

A host offering punctuation as its model **shadowed a perfectly good
environment behind it**. The fallback chain exists precisely so that a
host which cannot name its model still gets a usable identity, and one
malformed answer disabled it.

This matters exactly where the model is meant to be host-agnostic: a
terminal, an editor extension, and whatever another agent brings all
reach this function with different sources filled in.

## non-goals

- Changing what `normalizeWorkAgentId` accepts. The normaliser is right;
  it was being consulted too late.
- Adding the machine as a source. It is still never one.

## architecture

The sources are walked in their existing order, and each is judged
**after** normalising: a value that cannot survive normalisation has not
answered, so the next one is asked. `unknown-agent` remains the answer
when none survives.

## slices

### S1 — a source that cannot survive normalising has not answered

- **Status**: done
- **Files**: [`packages/core/src/lib/work-identity/resolve-work-agent.service.ts`, `packages/core/tests/src/lib/work-identity/resolve-work-agent.spec.ts`]
- **Gate**: `npx vitest run packages/core/tests/src/lib/work-identity/resolve-work-agent.spec.ts`
- review-state: done
- review-implementer: claude-opus-5
- review-reviewer: glm-5.3-max
- review-log: approved by glm-5.3-max — Revisé b39bfe073 (diff completo, service + spec + bootstrap). El resolver ahora juzga cada fuente DESPUÉS de normalizar: un valor que no sobrevive (normaliza a '') no "respondió", y se pregunta la siguiente fuente — elimina el shadowing de fuentes válidas por basura como '!!!' y el id vacío que producía refs inválidos. unknown-agent sigue siendo la respuesta final. Orden de preferencia model→environment→client intacto. Acceptance: los 4 ítems están cubiertos por los 5 tests nuevos del spec (12 pass / 0 fail ejecutados en el worktree del batch). changedSince nombra 4c931738a (x00617, "a host is not an agent") que extiende después esta lógica — no es defecto de este slice. Sin cambios fuera de alcance.
- review-attribution: claude-opus-5 from Merge pull request #314 from CartagoGit/delendai/pr/claude-opus-5/x00579-S1-g1/an-identity-is-checked-after-normalising (refs/heads/delendai/wip/claude-opus-5/x00579-S1-g1/an-identity-is-checked-after-normalising) (b39bfe073e3b380477eb17eaa514457e154faa6d), opened by glm-5.3-max
## acceptance

- `{ model: '!!!' }` answers `unknown-agent`, never an empty id.
- `{ model: '!!!', environment: 'codex' }` answers `codex`.
- The chain falls all the way through to the client.
- A first source that does survive is still preferred.

## risks and mitigations

- **A host that relied on the empty id.** It could not have: an empty
  agent produces a ref the work-ref parser refuses, so any caller reaching
  that state was already failing, later and less clearly.
