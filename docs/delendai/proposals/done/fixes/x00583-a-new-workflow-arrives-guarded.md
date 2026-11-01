---
id: x00583
title: "A new workflow arrives guarded"
kind: fix
status: done
type: proposal
track: trust
date: 2026-09-21
tags:
    - ci
    - workflows
shipped-in:
  - "7a4e8fb77"
last-transition-id: 90ae7cc9-41a3-46c5-80ec-ffd2488e431e
last-correlation-id: 90ae7cc9-41a3-46c5-80ec-ffd2488e431e
last-transition-from: review
---

# x00583 — A new workflow arrives guarded

## goal

A workflow added a year from now cannot repeat the failure that cost this
cycle a day, because the rule that catches it is checked rather than
remembered.

## why

x00578 found that `keep-the-queue-moving` merged candidates on a
one-commit clone, so every refresh reported `0 refreshed` and every
candidate was called "conflicted" — a message that sent a person to
resolve a disagreement that did not exist.

Nine workflow lints existed at the time. **None of them looked at this.**
Measured directly: a new workflow that checks out at the default depth
and then runs `git merge` and `git rev-list a..b` passes
`lint:workflow-yaml`, `lint:workflow-bootstrap`,
`lint:workflow-runner-bootstrap`, `lint:job-scope`,
`lint:workflow-command-duplication` and
`lint:no-duplicate-release-triggers` without a word.

So the answer to *"does a new workflow arrive guarded?"* was no, for
exactly the defect we had just spent a day on.

## non-goals

- Deepening every job. Most do not read history and should keep the fast
  clone.
- Becoming a call-graph analysis. One level of invocation is enough to
  answer "does this job reach a merge".

## architecture

`lint:workflow-history-depth` reads each job's text, and the source of
each repository script it invokes one level down — because the merge that
prompted this ran inside `forge:refresh`, not in the YAML. A rule that
would not have caught its own motivating example is not worth adding, so
that case is a test.

It knows two spellings, and the second matters more: scripts here do not
write `git merge` as text, they call `execFileSync('git', ['merge', …])`.
A text-only rule would have missed every real instance.

A job that reads history declares `fetch-depth: '0'`, or carries
`delendai:shallow-is-enough` with the reason. Commands that work at any
depth — `git status`, `git rev-parse HEAD`, a plain `git diff` — are
deliberately not listed: a rule that fires on every job is a rule that
gets turned off.

## notes

### what it found immediately

`ci.yml › lint-security` takes the default shallow clone and reaches
`candidate-delivers.script.ts`, which runs `git diff base...head`. A
second live instance of the same defect, in a different job, found by the
check on its first run. Fixed here.

## slices

### S1 — a job that reads history must ask for it

- **Status**: done
- **Files**: [`tools/scripts/lint/workflow-history-depth.script.ts`, `tools/scripts/lint/workflow-history-depth.constant.ts`, `tools/scripts/lint/workflow-history-depth.interface.ts`, `tools/scripts/lint/workflow-history-depth.script.spec.ts`, `.github/workflows/ci.yml`, `package.json`]
- **Gate**: `npx vitest run tools/scripts/lint/workflow-history-depth.script.spec.ts`
- review-state: done
- review-implementer: claude-opus-5
- review-reviewer: glm-5.3-max
- review-log: approved by glm-5.3-max — Revisé la entrega real 7a4e8fb77 (merge #318; los dos candidatos de la cola eran merges de alineación — 2309e3c6a de claude-opus-5 y d577ac95a de codex-astra-6 sin contenido del slice). Nuevo lint workflow-history-depth: todo job que ejecuta comandos hambrientos de historia (git merge, merge-base, diff de 2/3 puntos) debe declarar fetch-depth: '0' o un waiver escrito con motivo. El escaneo es por texto de los run: (shell, no YAML — decisión correcta y explícita). Detecta merges directos y a un nivel vía script invocado; los jobs de solo-lectura del tip no se mencionan. Acceptance cubierta por los 9 tests del spec (gate verde en el worktree del batch): merge sin depth rechazado, con fetch-depth aceptado, reach-through-script rechazado, waiver exigido y documentado, replay de keep-the-queue-moving reproduce el finding, y los 16 workflows actuales pasan. CI y package.json wire el lint. Sin cambios fuera de alcance.
- review-attribution: claude-opus-5 from commit 7a4e8fb778a0 names refs/heads/delendai/wip/claude-opus-5/x00583-S1-g1/a-new-workflow-arrives-guarded (7a4e8fb778a00d7fa9dc29aa986a8e65c8800d38), opened by glm-5.3-max
## acceptance

- A job that merges on the default clone is refused; the same job with
  `fetch-depth: '0'` is accepted.
- A job that reaches a merge through a script it invokes is refused.
- A waiver silences it, and has to be written down.
- A job that only reads the tip is never mentioned.
- Replaying `keep-the-queue-moving` without its depth reproduces the
  finding.
- All sixteen current workflows pass.

## risks and mitigations

- **A merge reached two levels down is missed.** One level covers every
  current case; deeper reachability would trade predictability for a
  case that has not occurred.
- **A false positive.** The waiver exists and requires a reason, which is
  cheaper than the failure it prevents.
