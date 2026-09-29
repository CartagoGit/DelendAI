---
id: x00758
title: "The release carries no new code-scanning alert"
kind: fix
status: review
type: proposal
track: security
date: 2026-09-29
priority: P0
related: []
last-transition-id: 6275ffbd-f1e8-44fb-a414-cefaa441d440
last-correlation-id: 6275ffbd-f1e8-44fb-a414-cefaa441d440
last-transition-from: in-progress
---

# x00758 — The release carries no new code-scanning alert

## goal

The promotion of `develop` into `main` introduces no CodeQL alert, and
`main`'s rule that every conversation is resolved does not block it.

## why

On 2026-09-29 the release pull request (#641) reported 35 new CodeQL
alerts in the code it brings to `main`: 29 high, 3 medium, 3 warnings.
GitHub posts each as a review conversation, and `main` requires every
conversation to be resolved, so the release could not merge, apart from
the risk itself. The previous release fixed its alerts before promoting
(#178); this one does the same, fixing each at its cause rather than
dismissing it.

## why this design

Each alert is fixed where its data enters, and a fix shared by several is
written once:

- **Prototype pollution** (CLI `--options-<plugin>=<k>=<v>`): both levels
  are prototype-less objects, set through one `setExtraOption`, which also
  drops `__proto__`, `prototype` and `constructor`.
- **Second-order command injection** (`git ls-remote` with a remote or ref
  from configuration): `--` before the positional arguments, so a name that
  looks like an option is never read as one.
- **Missing anchors**: the GitHub-remote test anchors the host
  (`evilgithub.com` no longer passes); the secret-name test is written as
  word checks, which is what it meant.
- **ReDoS**: the frontmatter key/value line captures the rest after the
  colon whole (callers trim it); trailing-separator and slash trims are
  loops.
- **Insecure temporary files**: `writeFileAtomic` creates its temporary
  exclusively (`wx`) and private (`0600`), then gives it the final file's
  mode before the rename; the browser plugin's own copy of that writer is
  replaced by the core one; CI artefacts are written `0600`.
- **File-system races**: `readTextIfPresent` and `readRegularFile`
  (`tools/scripts/lib`) read once, through the descriptor that was checked;
  the hooks hardener reads and rewrites through one descriptor; the git
  directory, loose refs and the spec walker read once.
- **Incomplete escaping**: the docs index escapes backslashes before pipes;
  the lint escaping a name for a RegExp escapes every metacharacter; the
  script-dependency resolver replaces every `*`; a trailer's name is what
  precedes the address.
- **Regex injection** (a false reading of `rule.match(path)` as
  `String.prototype.match`): the role-rule predicate is `matches`, as every
  other rule table in the repository already names it.
- **Stack-trace exposure** (dev server): the page gets a fixed message, the
  terminal the error.
- The rest: a useless initial value, and a check that now declares the
  context its type passes.

## non-goals

- Alerts that already existed on `main` before this release: a follow-up
  slice.

## Slices

- global_gate: none

### S1 — Fix the 35 alerts the release introduces

- **Status**: review
- **Gate**: `npx vitest run tools/scripts/lib/read-text-if-present.spec.ts packages/cli plugins/conventions`
- **Files**:
  - `packages/cli/src/lib/doctor/checks/stale-docs.check.ts`
  - `packages/cli/src/lib/parser.service.ts`
  - `packages/cli/src/lib/stdio-context.factory.ts`
  - `packages/core/src/lib/contracts/file-conventions.contract.ts`
  - `packages/core/src/lib/shared/atomic-write.ts`
  - `packages/core/src/lib/work-identity/resolve-work-agent.service.ts`
  - `packages/core/src/lib/work-units/publication-pull-request.service.ts`
  - `packages/core/src/lib/work-units/publication-target.service.ts`
  - `packages/core/src/lib/work-units/work-publish.service.ts`
  - `packages/core/tests/src/lib/workspace-migration/legacy-migration-manager.spec.ts`
  - `packages/proposals-sqlite/src/lib/frontmatter-loose.helper.ts`
  - `plugins/browser/src/lib/tools/browser-inspect.tool.ts`
  - `plugins/commit-policy/src/lib/triggers/slice-listener.ts`
  - `plugins/conventions/src/lib/profiles/go.profile.ts`
  - `plugins/conventions/src/lib/profiles/profile.contract.ts`
  - `plugins/conventions/src/lib/profiles/python.profile.ts`
  - `plugins/conventions/src/lib/profiles/rust.profile.ts`
  - `plugins/conventions/src/lib/tools/explain-path.tool.ts`
  - `plugins/proposals/src/lib/services/review-attribution.ts`
  - `plugins/proposals/src/lib/services/review-claims.service.ts`
  - `plugins/proposals/src/lib/tools/db-reconcile.tool.ts`
  - `plugins/proposals/tests/src/lib/tools/db-reconcile.tool.spec.ts`
  - `tools/scripts/ci/affected.script.ts`
  - `tools/scripts/ci/script-dependencies.ts`
  - `tools/scripts/dev/dev.script.ts`
  - `tools/scripts/dev/api/real-data.ts`
  - `packages/core/tests/src/lib/plugin-drift-budget.spec.ts`
  - `tools/scripts/docs/generate-docs-index.script.ts`
  - `tools/scripts/forge/advance-queue.script.ts`
  - `tools/scripts/forge/certify-integration.script.ts`
  - `tools/scripts/git/harden-git-hooks.script.ts`
  - `tools/scripts/git/hydration-lock.ts`
  - `tools/scripts/git/maintain-ref-namespace.script.ts`
  - `tools/scripts/lib/read-text-if-present.spec.ts`
  - `tools/scripts/lib/read-text-if-present.ts`
  - `tools/scripts/lint/detail-levels-coverage.script.ts`
  - `tools/scripts/lint/file-conventions.script.spec.ts`
  - `tools/scripts/migrate/rebrand-propagate.script.ts`
- shipped-in: `f5a6c17ebe6c`

After the first merge the release's CodeQL still reported three: the
directory `writeFileAtomic` opens to fsync it (now opened `O_RDONLY`, never
created), and two dev-server responses that carried error text (the
bundle failure and the dashboard's errors now tell the page where to look,
and the terminal gets the error). Moving the loose-ref read also changed a
line `plugin-drift-budget` allowlists by text; its entry names the new
line.

## dependency graph

None.

## acceptance

- The release pull request's CodeQL check reports no new alert.
- Every suite the changed files belong to passes.
