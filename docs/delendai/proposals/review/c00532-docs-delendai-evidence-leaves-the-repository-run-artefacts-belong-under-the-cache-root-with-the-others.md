---
id: c00532
title: "docs/delendai/evidence leaves the repository: run artefacts belong under the cache root with the others"
kind: chore
status: review
type: proposal
track: hygiene
date: 2026-10-20
last-transition-id: cea38021-0b00-4e6d-827b-75f00850e6a8
last-correlation-id: cea38021-0b00-4e6d-827b-75f00850e6a8
last-transition-from: in-progress
last-transition-at: 2026-10-22T07:33:49.305Z
shipped-in:
  - "b1397d6c8d76ce7fed8334b9da56e4542a190770"
---

# c00532 — docs/delendai/evidence leaves the repository: run artefacts belong under the cache root with the others

## goal

The five versioned files under `docs/delendai/evidence/` are artefacts of one run of a 2026-08 build, committed to the repository because the directory existed and nothing objected. They stop being in the repository. Where delendai keeps run artefacts is the cache root, and the evidence store already lives there — so this slice deletes what is committed, removes the path from the places that still know it, and leaves a rule that keeps run output out of version control even when the writer has no idea where the cache is.

## why

**What is actually in there is five stale text files.** `docs/delendai/evidence/` holds exactly five files, all from the same run:

```
q00009-startup-report-compact.txt    651 B
q00009-startup-report-full.txt      2.0 kB
q00009-startup-report-high.txt      1.5 kB
q00009-startup-report-medium.txt    1.3 kB
q00009-startup-report-off.txt         0 B
```

All five are committed (`git ls-files docs/delendai/evidence` returns all five), all five date from 14–26 August, and together they are 20 kB.

**They are already wrong, and were wrong when committed.** The content says:

```
MCP-Vertex ready
version        0.18.0
workspace      /workspace/my-project
preset         swarm
surface        managed
```

The product was called MCP-Vertex when these were written; `b00239` renamed it to DelendAI and landed in `done/`. The version is `0.18.0` against a project now well past it. The workspace is `/workspace/my-project` — a path that does not exist here. The numbers in the compact report (`plugins 51 loaded`, `tools 199 available · 6 exposed`, `native equiv. ~51,168/request`) are a snapshot of a surface that has changed many times since. `q00009-startup-report-off.txt` is **zero bytes** and is committed as a zero-byte file.

So the directory is not a record of anything: it is a frozen, mislabelled, partly empty claim about a system that no longer exists, sitting where a reader expects current documentation.

**Nothing reads them.** Searching the repository for the filenames finds no consumer — `startup-report` matches only the live `packages/core/src/lib/startup-report/` module, its lint baseline entries, and an unrelated VS Code output-channel test (`extensions/vscode/src/test/smoke.spec.ts:527`). No tool, gate, doc or page reads `docs/delendai/evidence/*.txt`.

**The correct destination already exists and is wired.** The evidence store is already under the cache root: `evidenceRootAbs: join(cacheDirContained.abs, 'evidence')` (`packages/core/src/lib/cli/assemble.ts:526`), declared as *"Runtime evidence store under `<cacheDir>/evidence"* (`:217`). `.cache/` is gitignored (`.gitignore:55`). The migration that imported the old flat layout into SQLite — `evidence-migrate.ts:1-30` — exists because that cache root held *"25.533 JSON files / 185 MB on 2026-09-08"* and the non-goals forbade deleting that history before importing it. The system's own answer to "where do run artefacts go" is already written down; this proposal makes the repository match it.

**Three places still carry the path, and one is a generated gate input.** `tools/scripts/ci/zone-reads.generated.json:105,1477` lists `docs/delendai/evidence` — a generated zone map, so it has a generator and a check. `tools/scripts/migrate/rebrand-propagate.script.ts:206` lists `docs/delendai/evidence/` as a rebrand path to rewrite — a migration that would rewrite files which should not exist. `packages/core/src/lib/workspace-migration/migrators/stray-member-cache.constant.ts:21` lists `'evidence'` as a cache member. Removing the directory without updating these leaves three tools pointing at a path with nothing behind it.

**There is already a lint for this class of problem.** `tools/scripts/lint/check-stray-cache-files.script.ts:63` already carries `'evidence'` in its list. The gate exists; these five files are what happens when a writer has no configured cache directory and falls back to writing inside the repository. The durable fix is the rule, not only the deletion.

The cost of leaving this is small but it is the kind of small that compounds: a stale artefact in a documentation directory reads as a specification, `b00239`'s rebrand will eventually rewrite its "MCP-Vertex" strings to "DelendAI" and thereby make a 2026-08 artefact look like current documentation of today's product, and the next audit of this repository will spend a finding on it.

**Why this design.** Deletion, path removal and a lint extension, in that order. The three belong together because each alone leaves a hole: deleting the files leaves three tools pointing at nothing; removing the paths leaves the writer free to create the directory again; adding the lint alone leaves the stale files committed.

The deletion is a plain `git rm` of five files with no consumer, no migration and no history to preserve — none of them is evidence of anything that `evidence-migrate.ts` had to worry about, because those were 25 533 JSON event files under the *cache*, not five text reports under `docs/`. Nothing is archived. Archiving a mislabelled snapshot of a renamed product would preserve the confusion it is being removed for.

The lint is the part that outlives this slice. A stray-cache-files check that only fires when the offending files are already present is a description, not a rule. The extension is that a *run artefact written inside the repository* is refused at write time — the directory may be legitimate, but an artefact landing in `docs/` is the signal, and the remedy is a configured cache root. That is the general rule the owner asked for, expressed where the repo can enforce it.

The generated `zone-reads.generated.json` is regenerated by its own generator rather than hand-edited, and the rebrand path list loses the entry outright: a migration should rewrite what exists, and keeping a rewrite rule for a directory that must not exist is how the directory comes back.

**Re-analysis before working any slice.** Written from a reading of the repository on 2026-10-20. The facts here are cheap to re-check and they drift — someone may have re-run a startup report into the directory, or the writer may have been fixed since. `git ls-files docs/delendai/evidence` may list more than the five files, or none if the directory was already removed; `grep -rn "docs/delendai/evidence" --include=*.ts --include=*.json` may now match more than the three places named above; `zone-reads.generated.json:105,1477` are line numbers as of this reading, so the generator has to be found before trusting them; `check-stray-cache-files.script.ts:63` may already carry `'evidence'` and have grown a run-artefact rule, which would make S4 partly done. Falsifiers: `git ls-files docs/delendai/evidence`; `grep -rn "q00009-startup-report" --include=*.ts --include=*.json .`; `wc -c docs/delendai/evidence/q00009-startup-report-off.txt`; `grep -n "evidenceRootAbs" packages/core/src/lib/cli/assemble.ts`; `grep -n "^.cache" .gitignore`.

## non-goals

- Moving these five files anywhere. They are stale, mislabelled and unread; relocating them preserves a problem rather than solving it.
- Touching `.cache/delendai/evidence/` or the SQLite evidence store (`packages/core/src/lib/evidence/`). That is the correct location and is out of scope.
- Changing what the startup report contains, how it is rendered, or where a *correct* report is written.
- Removing `check-stray-cache-files.script.ts` or loosening it. The lint is extended.
- Renaming or restructuring the startup-report subsystem.
- Cleaning any other stale artefact in the repository. This slice is the `evidence` directory; a wider sweep is a separate finding with its own evidence.

## slices

- global_gate: type

### S1 — The committed artefacts leave version control
- **Status**: done
- **Files**:
  - `tools/scripts/lint/check-stray-cache-files.script.ts` — refuses the five startup reports removed in 9b28c114f (`docs/delendai/evidence/q00009-startup-report-{compact,full,high,medium,off}.txt`) if any comes back
- **Gate**: none
- acceptance:
  - "All five files are removed from version control and from the working tree; `git ls-files docs/delendai/evidence` returns nothing and the directory does not exist."
  - "Nothing is archived and nothing is relocated: after the slice, no copy of these five files exists in the repository."
  - "`bun run typecheck` and `bun run test` pass."
- shipped-in: `7fde14ebe2b6`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at b1397d6c8d76, validate exit 0, tests 17342/17349; acceptance 3/3: (1) Commit 9b28c114fe0558850dc0556fdf4b7bcd84716529 (fix(c00532): remove the committed run artefacts and the paths that knew them) deletes the five files as D entr… (2) Nothing is archived and nothing is relocated: `git ls-files --all -- 'docs/delendai/evidence/q00009-startup-report-*.txt'` returns nothing, so no copy of these… (3) `bun run typecheck` exits 0 (TYPECHECK_EXIT=0; '[typecheck:tools] no new tools/ errors (0 baselined across 0 file(s))') and `bun run test` exits 0 (TEST_EXIT=0… — Gate is `none`. Evidence is the tree plus the two gates the criterion names: `bun run typecheck` exit 0 and `bun run test` exit 0 (2162 files / 17342 tests passed) in this worktree; `git ls-files docs/delendai/evidence` empty and the directory absent; the delivered merge tree carries no such path; no copy of the five files on any ref or on disk. Delivery commit 9b28c114fe0558850dc0556fdf4b7bcd84716529 (the slice commit; it reached develop through merge b1397d6c8d76ce7fed8334b9da56e4542a190770).

### S2 — Every path that knew the directory is corrected
- **Status**: done
- **Files**: `tools/scripts/migrate/rebrand-propagate.script.ts`, `packages/core/src/lib/workspace-migration/migrators/stray-member-cache.constant.ts`, `tools/scripts/migrate/evidence-paths.spec.ts`, `packages/core/tests/src/lib/workspace-migration/migrators/stray-member-cache.migrator.spec.ts`
- **Gate**: none
- acceptance:
  - "`rebrand-propagate.script.ts:206` no longer lists `docs/delendai/evidence/` — a rebrand rewrite rule for a directory that must not exist is how the directory comes back."
  - "`stray-member-cache.constant.ts:21` keeps `'evidence'` **only** if it refers to the cache root, matching `assemble.ts:526`; a comment states which root it names. If the constant describes the `docs/` path, the entry is removed instead."
  - "A spec asserts neither constant mentions the `docs/` path."
- shipped-in: `7fde14ebe2b6`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S3 — The generated zone map stops describing a directory that no longer exists
- **Status**: done
- **Files**: `tools/scripts/ci/zone-reads.generated.json`, `tools/scripts/ci/zone-reads.script.ts`, `tools/scripts/ci/zone-reads.script.spec.ts`
- **Gate**: none
- acceptance:
  - "`docs/delendai/evidence` no longer appears at `zone-reads.generated.json:105` or `:1477`."
  - "The file is regenerated by its own generator rather than hand-edited (`zone-reads.script.ts --prune`, which rebuilds the committed map from itself through the generator's existing keep-what-exists rule, without re-recording every zone), and the generator's output is committed in the same slice."
  - "The generator, run on a clean tree, reproduces the committed file byte-for-byte — it now formats its own output the way the format gate holds the file — so the next run does not produce a diff nobody can explain."
- shipped-in: `7fde14ebe2b6`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at b1397d6c8d76, validate exit 0, tests 28/28; acceptance 3/3: (1) docs/delendai/evidence no longer appears in tools/scripts/ci/zone-reads.generated.json at all: grep for it returns nothing, so the entries the criterion names … (2) The committed map is the generator's own output, not a hand edit: `bun tools/scripts/ci/zone-reads.script.ts --prune` rebuilds the committed map from the exist… (3) Run on a clean tree the generator reproduces the committed file byte-for-byte: the same `--prune` run above leaves `git diff tools/scripts/ci/zone-reads.genera… — Gate is `none`. Evidence is the generator itself: `bun tools/scripts/ci/zone-reads.script.ts --prune` exit 0 and byte-for-byte equal to the committed map (git diff on it empty), with no docs/delendai/evidence entry left in it. Delivery commit 7fde14ebe2b6247d0696008a2b7d0f834b74e367, merged as b1397d6c8d76. The slice's own spec file tools/scripts/ci/zone-reads.script.spec.ts passes as part of the 28/28 vitest run over the two c00532 spec files.

### S4 — A run artefact written inside the repository is refused, and the cache root is where they go
- **Status**: done
- **Files**: `tools/scripts/lint/check-stray-cache-files.script.ts`, `tools/scripts/lint/check-stray-cache-files.script.spec.ts`, `docs/delendai/ADOPTER-SURFACE-MODE.md`
- **Gate**: none
- acceptance:
  - "The lint refuses a run artefact committed under `docs/` — a tracked file inside a directory named for a cache-root run-artefact member (`evidence`, `results`, `reports`, `telemetry`, `verify`, `handoff`) — naming the file, the writer that produces that member and the cache root it should have used, resolved from `DEFAULT_CORE_PATHS.cacheDir`, the same value `assemble.ts` derives its evidence root from. It fails when git lists no tracked file, so it cannot pass having measured nothing."
  - "The existing `'evidence'` entry (`:63`) keeps its current behaviour; the extension adds a rule and does not loosen one."
  - "A spec drives the lint over a fixture with a stray artefact under `docs/` and one under the cache root, and asserts the first fails and the second passes."
  - "A spec drives the lint over a repository with no stray artefacts and asserts it is green, so the rule cannot fail closed on a clean tree."
  - "`bun run lint:no-silent-gates` is green — a new refusal rule that emits nothing when it fires is the failure mode this repo's own gate exists to catch."
- shipped-in: `7fde14ebe2b6`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at b1397d6c8d76, validate exit 0, tests 28/28; acceptance 5/5: (1) check-stray-cache-files.script.ts adds the rule: RUN_ARTEFACT_MEMBERS maps the six members (evidence, results, reports, telemetry, verify, handoff) to the writ… (2) The existing 'evidence' entry keeps its behaviour: SANCTIONED_TOP_LEVEL still carries 'evidence' with the same comment and the same position in the list (it is… (3) The delivered spec 'refuses a run artefact under docs/ and names its writer and cache root' drives runArtefactsInRepo over a fixture holding docs/delendai/evid… (4) The delivered spec 'is green over a tree with no run artefact: source and plugin docs alike' drives the same function over packages/core/src/lib/evidence/evide… (5) `bun run lint:no-silent-gates` is green: it reports that 138 gate script(s) in the validate:run chain all report on their failure path and exits 0. The new rul… — Gate is `none`. Evidence is the lint and its spec: `bun tools/scripts/lint/check-stray-cache-files.script.ts` exit 0 (it reports '✓ check-run-artefacts: none of 9076 tracked files is a run artefact under docs/'), `bun run lint:no-silent-gates` exit 0, and the delivered spec file 28/28 under vitest together with the zone-reads spec. The lint is chained into validate:run (package.json: 'bun run lint:stray-cache-files'). The slice's third file, docs/delendai/ADOPTER-SURFACE-MODE.md, drops the stale 'committed docs/delendai/evidence/ acceptance fixtures' sentence and points at the new refusal instead - coherent with the rule. Delivery commit 7fde14ebe2b6247d0696008a2b7d0f834b74e367, merged as b1397d6c8d76.

## acceptance

- All five files are removed from version control and from the working tree; `git ls-files docs/delendai/evidence` returns nothing and the directory does not exist.
- Nothing is archived and nothing is relocated: after the slice, no copy of these five files exists in the repository.
- `bun run typecheck` and `bun run test` pass.
- `rebrand-propagate.script.ts:206` no longer lists `docs/delendai/evidence/` — a rebrand rewrite rule for a directory that must not exist is how the directory comes back.
- `stray-member-cache.constant.ts:21` keeps `'evidence'` **only** if it refers to the cache root, matching `assemble.ts:526`; a comment states which root it names. If the constant describes the `docs/` path, the entry is removed instead.
- A spec asserts neither constant mentions the `docs/` path.
- `docs/delendai/evidence` no longer appears at `zone-reads.generated.json:105` or `:1477`.
- The file is regenerated by its own generator rather than hand-edited (`zone-reads.script.ts --prune`, which rebuilds the committed map from itself through the generator's existing keep-what-exists rule, without re-recording every zone), and the generator's output is committed in the same slice.
- The generator, run on a clean tree, reproduces the committed file byte-for-byte — it now formats its own output the way the format gate holds the file — so the next run does not produce a diff nobody can explain.
- The lint refuses a run artefact committed under `docs/` — a tracked file inside a directory named for a cache-root run-artefact member (`evidence`, `results`, `reports`, `telemetry`, `verify`, `handoff`) — naming the file, the writer that produces that member and the cache root it should have used, resolved from `DEFAULT_CORE_PATHS.cacheDir`, the same value `assemble.ts` derives its evidence root from. It fails when git lists no tracked file, so it cannot pass having measured nothing.
- The existing `'evidence'` entry (`:63`) keeps its current behaviour; the extension adds a rule and does not loosen one.
- A spec drives the lint over a fixture with a stray artefact under `docs/` and one under the cache root, and asserts the first fails and the second passes.
- A spec drives the lint over a repository with no stray artefacts and asserts it is green, so the rule cannot fail closed on a clean tree.
- `bun run lint:no-silent-gates` is green — a new refusal rule that emits nothing when it fires is the failure mode this repo's own gate exists to catch.
