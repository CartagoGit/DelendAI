---
id: f00537
title: "Archify plugin: architecture diagrams as a projection of the structures the runtime already reads"
kind: feat
status: ready
type: proposal
track: surface
date: 2026-09-11
tags:
    - plugin
    - architecture
    - diagrams
    - drift
    - external-tool
---

# f00537 — Archify plugin: architecture diagrams as a projection of the structures the runtime already reads

## goal

Give delendai a first-party plugin that renders its architecture — and a
consumer's — through [Archify](https://github.com/tt-a1i/archify), from
the typed structures delendai already owns, so a diagram cannot disagree
with the code it claims to describe.

## why

Every architecture diagram this project could publish today would be a
drawing: authored once, true briefly, and stale without anything
noticing. That is the same failure class as ADR 0019 declaring `develop`
unprotected while the forge enforced something else, and as
`ci-complete` being required by a branch while no workflow produced it.
The repository's answer to that class is already settled — one canonical
structure, everything else a projection of it, and a `--check` mode that
fails when a committed projection drifts.

A diagram has never been held to that rule because nothing could hold it.

Archify changes what is possible, and it is worth being precise about
why it fits rather than praising it:

1. **It compiles, it does not draw.** Agents author a typed JSON IR
   against published schemas; `bin/archify.mjs` deterministically
   compiles that IR into HTML/SVG. The IR is the artefact; the picture
   is its projection. That is the shape delendai already uses for
   `.github/settings.yml`, `.github/branch-protection.ts` and the host
   hints.
2. **It refuses.** `validate <type> <candidate.json> --quality showcase
   --json` returns a receipt of nine artefact checks, and its own skill
   contract states that *"a non-zero exit can never be described as
   success"* and that a failed delivery must not be reported against the
   previous good artefact. That is this repository's tri-state verdict
   rule, written by somebody else, in their own words.
3. **It diffs two validated snapshots.** Before / Delta / After over
   added, removed, changed, moved and rerouted facts. A pull request can
   therefore answer *"what did this slice change about the
   architecture?"* with a computed answer rather than a reviewer's
   recollection.

And delendai already holds the inputs. Plugin manifests carry
`dependencies` and `capabilities`; `dependency-graph.service.ts` already
builds the graph, orders it topologically and detects cycles;
`forge-governance/build-desired-state.ts` is a single derivation of the
branch model; `development-policy` resolves the workspace's own
integration shape. None of that was written for diagrams, which is
exactly why a diagram built from it is evidence instead of illustration.

## non-goals

- **Not a diagram editor.** If the picture is wrong, the structure is
  wrong; the repair belongs upstream.
- **Not a second source of architectural truth.** Nothing in this plugin
  may hold a fact that is not already derivable from the workspace.
- **Not a vendored copy.** Archify is an external tool with its own
  release cadence; it is invoked through the existing external-tool seam
  and its absence is `NOT_EXECUTABLE`, never a silent pass.

## slices

### S1 — Project the graph delendai already has into Archify IR

- **Status**: pending
- **Files**: [`plugins/archify/src/lib/ir/from-dependency-graph.ts`, `plugins/archify/tests/src/lib/ir/from-dependency-graph.spec.ts`]

A pure function from `IDependencyGraphSnapshot` to an `architecture` IR
document. No filesystem, no rendering, no Archify invocation — the
projection is the part that must be testable without the tool installed.

Cycles and missing dependencies are already classified by the graph, and
they travel into the IR as facts rather than being drawn as ordinary
edges: a diagram that renders a dependency cycle as a pretty loop is
worse than one that refuses.

- **Gate**: `npx vitest run plugins/archify/tests/src/lib/ir`
- **Expect**: the same graph produces the same IR byte-for-byte, and a
  graph with a cycle produces an IR that names it.

### S2 — Invoke Archify through the external-tool seam, with its receipt

- **Status**: pending
- **Files**: [`plugins/archify/src/lib/render/render-diagram.ts`, `plugins/archify/src/lib/render/render-diagram.interface.ts`]

`validate` then `deliver`, both through `runExternalTool`, both
returning the parsed receipt. A missing Archify is `NOT_EXECUTABLE` with
the install command in the message; a failed validation returns the
diagnostics untouched — `subject`, `evidence`, `supportedFixes` — because
they are more useful than anything this plugin could say about them.

The nine-check showcase receipt is the pass condition. Four checks is
basic validation and must never be reported as acceptance, which is the
tool's own rule and coincides with ours.

- **Gate**: `npx vitest run plugins/archify/tests/src/lib/render`
- **Expect**: absent binary → `NOT_EXECUTABLE`; non-zero exit → failure
  carrying the diagnostics; four-check receipt → not accepted.

### S3 — A tool that renders the current workspace

- **Status**: pending
- **Files**: [`plugins/archify/src/lib/tools/architecture-diagram.tool.ts`, `plugins/archify/src/index.ts`]

`architecture_diagram` over the resolved workspace: build the graph,
project it, validate, deliver, return the artefact path. Deny-by-default
permissions, one declared write path, no network.

- **Gate**: `npx vitest run plugins/archify/tests/src/lib/tools`
- **Expect**: the tool writes exactly one artefact and reports its path.

### S4 — Drift: the committed diagram is a projection like any other

- **Status**: pending
- **Files**: [`tools/scripts/lint/architecture-diagram-drift.script.ts`]

`--check` regenerates the IR and compares it with the committed one. The
IR is what is compared, never the HTML: the rendered file carries
timestamps and layout solver output, and comparing it would produce
drift that means nothing while hiding drift that means something.

- **Gate**: `bun tools/scripts/lint/architecture-diagram-drift.script.ts --check`
- **Expect**: an unchanged workspace is clean; a new plugin dependency
  fails the check and names the edge.

### S5 — Before / Delta / After on a pull request

- **Status**: pending
- **Files**: [`.github/workflows/architecture-delta.yml`, `plugins/archify/src/lib/render/delta.ts`]

Render the base and head IRs, run Archify's delta, and post the result
as a comment: added, removed, changed, moved, rerouted. Advisory at
first — it reports, it does not block — because a delta gate that nobody
has calibrated would be a gate that teaches people to ignore gates.

- **Gate**: `bun tools/scripts/lint/workflow-runner-bootstrap.script.ts`
- **Expect**: a pull request that changes no dependency produces an
  empty delta.

## acceptance

- A diagram is reproducible from the workspace alone: delete the
  committed IR, regenerate, get the same bytes.
- Archify absent is `NOT_EXECUTABLE` in every path, never a pass.
- No fact appears in a diagram that is not derivable from a structure
  the runtime already reads.
- The drift check fails on a real architectural change and is silent on
  a cosmetic one.

## notes

- **Which graph is worth drawing first?** The plugin dependency graph is
  the one delendai owns most completely, but the *interesting* diagram
  for a consumer is probably their own codebase, which means the IR
  projection needs a second source. S1 deliberately commits only to the
  source we already have.
- **Where does the artefact live?** A committed HTML is large and
  regenerable; a committed IR is small and is the real artefact. The
  proposal assumes IR is committed and HTML is not, which makes the
  repository's diagram a build output rather than a document.
- **Update notices.** Archify's skill performs its own update check and
  is explicit that the notice is information and never consent. Anything
  this plugin surfaces must preserve that: delendai does not update a
  user's tools on their behalf.
