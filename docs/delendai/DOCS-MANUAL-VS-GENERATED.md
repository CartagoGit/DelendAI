# Documentation manual vs generated — d00011

> Track H of [q00006](proposals/in-progress/plans/q00006-plan-hardening-post-auditoria-chatgpt-sol-cuarta-pasada.md).
> Owner: every contributor (human or agent) who edits `docs/delendai/**`.

The audit caught drift: counts like "48 plugins" vs "50 plugins"
in two docs of the same repo, test totals that no one
remembers updating, and tables that lag behind the code by a
few weeks because nobody knows who owns them. This document
codifies the rule that prevents the drift: **machine-readable
data is generated, judgment-call prose is manual, and the
boundary between the two is marked by
`<!-- delendai:begin/end -->` comment blocks.**

---

## Philosophy

> One source of truth per machine-readable datum. (R3.2)

The repository has a single, opinionated policy:

- **Generated** — every fact whose value the repo can produce
  on demand. Numbers, inventories, capability matrices, plugin
  listings, token budgets, AGENT.md summaries, hotspot tables.
- **Manual** — every fact that requires human or agent judgment.
  Why a feature exists, when it should be used, what the
  trade-offs are, narrative for downstream readers.
- **Hybrid** — a manual prose section that contains one (and
  only one) generated block. The block is delimited by
  `<!-- delendai:begin ... -->` / `<!-- delendai:end ... -->`
  markers; the regenerator rewrites only the block.

A drift-check job runs in CI: when an agent regenerates a
block but forgets to commit it, the job fails on the next run.
This is the same pattern used by the schema validators in
[d00009](docs/delendai/security/capability-matrix.md) and
the token-budget dashboard — proven, low-overhead, and easy to
extend.

---

## What is MANUAL

| Path                                             | Why                                                                            |
| ------------------------------------------------ | ------------------------------------------------------------------------------ |
| `docs/delendai/AGENT-BOOTSTRAP.md`               | Agent-facing rules; subject to opinion and iteration.                          |
| `docs/delendai/ARCHITECTURE.md`                  | Layered narrative; explainer for newcomers.                                    |
| `docs/delendai/VISION-AND-OPERATING-MODEL.md`    | Strategic positioning; updated by the roadmap owner.                           |
| `docs/delendai/decisions/**` (ADRs)              | Decisions and their rationale; forever frozen after adoption.                  |
| `proposals/**/Goal.md`, `Why.md`, `Non-goals.md` | Editorial sections of a proposal; written by the proposer.                     |
| `CHANGELOG.md` (entries, not the header)         | Curated changelog prose; auto-generation is a P2.                              |
| `README.md` (root, packages, plugins)            | Narrative tone varies per audience; generated variants are a future direction. |

Manual prose MAY contain a generated block (see "Hybrid"
below). It MAY NOT contain raw numbers or counts in
non-block sections.

## What is GENERATED

| Path / block                                          | Producer                                   |
| ----------------------------------------------------- | ------------------------------------------ |
| `<docs>.md` Quantitative facts block (`<!-- ... -->`) | [c00140] `gen:quantitative`                |
| `<plugin>/AGENT.md`, `<package>/AGENT.md`             | [f00190] `gen:agent-md`                    |
| `docs/delendai/security/capability-matrix.md`         | [d00009] `gen:capability-matrix`           |
| `docs/delendai/TOKEN-BUDGETS.md`                      | `gen:token-budget-dashboard`               |
| `docs/delendai/generated/plugin-manifests.*`          | `gen:from-manifests`                       |
| `docs/delendai/plugins/auto-generated/*.md`           | `gen:plugin-docs`                          |
| `apps/web/public/logos/*`, `apps/web/src/data/**`     | `gen:sync-public-api` / `gen:capabilities` |
| `delendai://code-map` (in-memory)                     | [d00010] `buildCodeMap`                    |

Generated files may be entirely regenerated without review
when the underlying source changes. They are the single source
of truth for the corresponding machine-readable datum.

## What is HYBRID

A `.md` file that mixes editorial prose with a generated
block. The block is delimited by:

````markdown
<!-- delendai:begin <block-id> -->
... generated content ...
<!-- delendai:end <block-id> -->
````

The regenerator:
1. searches for the begin/end markers around `<block-id>`;
2. if found, replaces the body;
3. if not found, appends a new section at the end of the file
   with a sensible heading (e.g. `## Quantitative facts`);
4. never touches prose outside the matched range.

This makes regeneration safe — every Markdown file can be
re-evaluated against the current repo state without disturbing
any prose the team has hand-edited. Block-ids are lowercase
kebab-case (`quantitative`, `capability-matrix`,
`token-budgets`, `agent-md`).

---

## Rules of gold

1. **If a value can be derived from the repo state, it MUST be
   generated.** Hand-writing such a value is forbidden — use the
   generator instead.
2. **If a value requires judgment (why, when, trade-offs,
   audience), it MUST be manual.** Don't try to automate
   "rationale"; the result is always worse than the human wrote.
3. **If a value changes on every commit, it MUST be generated,
   no exceptions.** Counts, sizes, scores, freshness dates —
   never inline these in prose.
4. **If a generator exists, the prose around it MUST be
   reduced.** "There are 51 plugins in this repo" is fine inside
   a generated block; outside one, it is forbidden.
5. **A regenerated block MUST be invisible to a reader.** The
   block uses a fenced code block, the prose around it stands
   on its own. The reader doesn't need to know the block is
   regenerable.
6. **A drift check MUST exist for every generator.** CI fails
   when a generator runs and produces a different output from
   the committed artefact. The drift check itself is a
   one-liner that calls the same generator in `--check` mode.
7. **A fix on drift MUST NOT silently rewrite the prose.** A
   regenerated block replaces only the marker-delimited range.
   The drift check must NOT promote "fix everything" to a
   silent rewrite.

---

## Bidirectional references

The lints and scripts point at this document; this document
points back. That is intentional: a maintainer who lands on
any one of them should be able to navigate the convention in
both directions.

- `tools/scripts/gen/quantitative.script.ts` → [c00140]
  emits the `quantitative` block documented here.
- `tools/scripts/gen/agent-md.script.ts` → [f00190]
  emits the per-scope `AGENT.md` files described here.
- `tools/scripts/lint/check-quantitative.script.ts` →
  enforces the "block must match" rule for `quantitative`.
- `tools/scripts/lint/check-agent-md.script.ts` →
  enforces the same rule for `agent-md`.
- `packages/core/src/lib/code-map/resource.ts` →
  references [d00010] for the `delendai://code-map` resource
  contract.

---

## When in doubt

Ask the same question an LLM-hosted CI bot would ask:

> "Is this value the repo state on this commit, or a judgment
> call about the repo state?"

If the former — generate it.
If the latter — write it manually.
If both — write the judgment call manually, link to the
generator for the data.

If a generator does not exist yet, open a `chore` proposal
referencing this document and the corresponding Track H
daughter.
