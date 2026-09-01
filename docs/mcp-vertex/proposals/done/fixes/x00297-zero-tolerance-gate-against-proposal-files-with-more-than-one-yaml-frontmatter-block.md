---
id: x00297
title: "Zero-tolerance gate against proposal files with more than one YAML frontmatter block"
kind: fix
status: done
type: fix
track: governance
date: 2026-08-28
priority: P1
---

# x00297 — single-frontmatter-block gate

## Goal

Guarantee that no proposal `.md` file under `docs/mcp-vertex/proposals/`
(outside the frozen `legacy/` archive) ever contains more than one
YAML frontmatter block, by adding a plain zero-tolerance lint that
fails CI the moment one appears, and by repairing the one real instance
found in this repo.

## Why

Every proposal lint in this repo reads frontmatter through
`extractYamlBlock` (`plugins/proposals/src/lib/proposals/frontmatter-parser.ts`),
which matches only the **first** `---...---` pair in the file
(`raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)`). Anything concatenated
after that first block — including a second, stale copy of the entire
document with its own frontmatter — is invisible to `lint:proposals`,
`proposal-folder-drift`, `closed-frozen-guard`, and every tool that
renders or edits the document. A file in this state reports clean.

A scan of every `id:`-shaped line in the proposals tree
(`for f in $(find docs/mcp-vertex/proposals -name '*.md' -not -path
'*/legacy/*'); do c=$(grep -c '^id: [a-z][0-9]' "$f"); [ "$c" -gt 1 ]
&& echo "$c $f"; done`) surfaced six candidates. Investigating each
against `git log --follow -p` showed the real picture is narrower and
more specific than the raw grep count suggested:

- **One genuine corruption**:
  `done/feats/f00067a-provider-schema-catalog-surface-f00067-s1-residual.md`.
  `git show b359dcf9` — the commit that introduced it — shows the exact
  mechanism: an edit meant to replace one truncated acceptance-bullet
  sentence (`...regex \`^[a-z][a-z0-9-]+$\`), ...`) instead spliced an
  entire second copy of the document — frontmatter included — into the
  middle of that sentence, because the match anchor used by the editing
  tool was ambiguous. The injected `---` landed fused onto the tail of
  the truncated line rather than starting its own line, which is why a
  strict "does the file start a fresh `---` block on its own line"
  check would still miss it; the fix in this slice matches on the
  frontmatter `id:` root key instead, which both halves reliably have.
  The pristine pre-corruption blob (`git cat-file -p 37661ed5`) confirms
  nothing else in the document changed — S1/S2/S3 all legitimately went
  `pending` → `done` across later, unrelated commits.
- **Five false positives**: `a00043`, `a00044`, `a00072`, `c00011`,
  `c00075` all contain a *second* `id:`-shaped line, but every one of
  them sits inside a fenced `yaml`/`markdown` code block that quotes
  another proposal's frontmatter as documented evidence (audits
  routinely reproduce a broken file's header verbatim to show a finding;
  `c00075` quotes the frontmatter shape a paused proposal is required to
  have). None of these five files actually have two frontmatter blocks;
  `extractYamlBlock` already parses them correctly, and a fence-blind
  scan (the raw `grep -c` above, and the naive "count `---` lines"
  design this slice explicitly avoids) cannot tell the difference. This
  is itself worth recording: the repo's own frontmatter/proposal
  linters have no fence-awareness anywhere, and a lint built without it
  would have permanently blocked five clean, correctly-authored files.

## Why this design

A ratchet-with-baseline (the `types-in-contracts.script.ts` /
`effect-boundaries.script.ts` shape used elsewhere in this repo) is the
wrong tool here: after repairing the one real instance, the correct
count is zero, and any future occurrence is unambiguously a fresh
regression, never inherited debt to grandfather. A plain pass/fail gate
mirroring the simplest existing proposal lint
(`proposal-folder-drift.script.ts` — one pure detection call, one
`console.log`, exit 0/1) fits the shape of the problem exactly.

For detection, the naive approach — count `---` lines, or count lines
starting with `id:` — was tried first and immediately produced the five
false positives documented above. The chosen design instead:

1. Tracks fenced-code-block state (triple-backtick and `~~~` markers, toggled per marker) and
   skips every line inside a fence, the same fence-awareness gap the
   investigation above found missing repo-wide.
2. Matches only lines shaped like a real frontmatter `id:` root key
   (`^id:\s*[a-z]\d{1,6}[a-z]?\s*$`, case-insensitive) rather than any
   line starting with `id:` — this is what keeps `id: 'round_context'`
   (a tool-definition field quoted in a fenced sample) and `id: <id>`
   (a template placeholder) from ever being candidates, fence-awareness
   notwithstanding, since a defense-in-depth match on shape costs
   nothing and a future fenceless false positive of that kind is still
   plausible.
3. Counts occurrences of that line shape outside fences: more than one
   means more than one frontmatter block, because that is the one line
   every real frontmatter block in this repo's convention has and nothing
   else in a well-formed document coincidentally reproduces.

## Non-goals

- Not a general Markdown/YAML validator — it does not parse the
  frontmatter contents, only counts where blocks start.
- Not extended to `legacy/` — the frozen archive already has its own
  drift model (`closed-frozen-guard.script.ts`, content-hash based) and
  is explicitly out of scope for this gate, matching the reproduction
  scan's own exclusion.
- Not an AST-based Markdown/fence parser — line-oriented fence toggling
  (same trade-off every sibling ratchet in this repo makes) is
  sufficient for the shapes actually seen in this repo; an unbalanced
  or unusually-nested fence could in principle defeat it, same known
  ceiling as every other regex-based lint here.
- Does not touch the five false-positive files — they are correctly
  formed and were left untouched; only `f00067a` was edited.

## Architecture

- `tools/scripts/lint/single-frontmatter.script.ts` (new): exports two
  pure functions — `findFrontmatterIdLines(markdown): readonly number[]`
  (fence-aware line scan) and `collectProposalMarkdownFiles(dir)` /
  `detectMultipleFrontmatter(dir)` (filesystem walk, skips any path with
  a `legacy` segment) — plus a CLI entry mirroring
  `proposal-folder-drift.script.ts`'s shape: one `console.log` on
  success, one `console.error` block listing every violating file and
  its `id:` line numbers on failure, exit 0/1.
- `tools/scripts/lint/single-frontmatter.script.spec.ts` (new): pins the
  clean-file, two-block, and fenced-example-must-not-false-positive
  shapes described above as fixtures, plus the exact f00067a corruption
  shape (second `---` fused onto an unrelated line) in miniature.
- `package.json`: one new `lint:single-frontmatter` script entry.
- `.github/workflows/ci.yml`: one new `bun run lint:single-frontmatter`
  line in the existing "Run governance and proposal lints" step,
  alongside `lint:proposal-cited-commits` and its siblings.

## Slices

### S1 — detector + CLI

- **Status**: done
- **Files**: `tools/scripts/lint/single-frontmatter.script.ts`
- **Gate**: `bun tools/scripts/lint/single-frontmatter.script.ts` (exits 0, zero violations across the live tree)

### S2 — spec (clean / two-block / fenced-example / f00067a-shape fixtures)

- **Status**: done
- **Files**: `tools/scripts/lint/single-frontmatter.script.spec.ts`
- **Gate**: `bunx vitest run --project tools -- tools/scripts/lint/single-frontmatter.script.spec.ts`

### S3 — repair the one real corruption + register the gate

- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/done/feats/f00067a-provider-schema-catalog-surface-f00067-s1-residual.md`, `package.json`, `.github/workflows/ci.yml`
- **Gate**: `bun run lint:single-frontmatter` exits 0; `bun tools/scripts/lint/proposal-folder-drift.script.ts` still reports no drift for f00067a

## Dependency graph

```
S1 ──► S2 ──► S3
```

## Acceptance

1. A proposal file with a single frontmatter block reports zero
   violations, regardless of whether its body contains a fenced
   `yaml`/`markdown` block quoting another proposal's frontmatter as
   an example — the five files that raised false positives under the
   naive scan (`a00043`, `a00044`, `a00072`, `c00011`, `c00075`) each
   pass with exactly one `id:` line detected.
2. A file with a genuine second frontmatter block — whether the second
   `---` starts a clean line or is fused onto the tail of an unrelated
   line (the real f00067a shape) — is reported as a violation, with
   both `id:` line numbers surfaced.
3. `legacy/` is excluded from the scan entirely.
4. `f00067a-provider-schema-catalog-surface-f00067-s1-residual.md` has
   exactly one frontmatter block after this slice, its body content is
   otherwise byte-identical to the pristine pre-corruption version
   (`git cat-file -p 37661ed5`) except for the three legitimate
   `pending` → `done` slice-status transitions that happened in later,
   unrelated commits, and `bun tools/scripts/lint/proposal-folder-drift.script.ts`
   still reports no drift for it.
5. `bun run lint:single-frontmatter` exits 0 against the live tree.
6. `bunx vitest run --project tools` stays green with the new spec
   included.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Line-oriented fence toggling can be defeated by an unbalanced or unusually-nested fence marker | Same known ceiling as every other regex-based lint in this repo (`types-in-contracts`, `effect-boundaries`); a malformed fence is itself a separate, pre-existing Markdown-hygiene problem this gate does not claim to solve |
| The `id:` line-shape regex could in principle miss a future frontmatter convention (a longer prefix, a different digit width) | The regex mirrors the exact id shapes already in use across the whole proposals tree (`[a-z]\d{1,6}[a-z]?`), verified against all 469 non-legacy proposal files with zero unexpected misses or hits during this slice's investigation |
| A future genuinely legitimate reason to quote a full frontmatter block unfenced in a proposal body (not inside \`\`\`) would trip this gate | No such case exists today; if one arises, the fix is to fence the example — this repo already relies on fences to distinguish quoted examples from live content everywhere else |

## Notes

- The investigation for this slice is also the reason the fence-blindness
  gap in the repo's own linters (`extractYamlBlock` and the naive
  `grep`-style scans agents reach for) is worth naming explicitly: it
  produced five false positives here, and the same blindness could
  produce false negatives elsewhere if a real second frontmatter block
  ever happened to land inside what looks like a fence. This gate is
  deliberately narrower (matches on `id:` shape, not on `---` count) so
  that it is not itself vulnerable to the same class of mistake.
- `git show b359dcf9 -- docs/mcp-vertex/proposals/ready/f00067a-provider-schema-catalog-surface-f00067-s1-residual.md`
  reproduces the exact splice that corrupted the file, for anyone
  auditing the repair.
