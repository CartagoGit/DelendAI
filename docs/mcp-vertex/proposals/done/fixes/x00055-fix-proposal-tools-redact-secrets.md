---
id: x00055
status: done
type: proposal
track: plugins/proposals+security
date: 2026-06-27
kind: fix
title: `proposal_edit.value` and `proposal_review.note` are written to the proposal file without going through `redactSecrets` — reviewers and editors can persist secrets into the repo
runner: copilot
model: minimax-m3
scope: security+plugin-tools
related:
    - a00032 # audit that originally surfaced M23 (proposal_create must redact secrets before persisting)
ownership:
    - { agent: implementation_runner, task: 'S1: in `plugins/proposals/src/lib/tools/mutate-tools.ts`, run `args.value` through `redactSecrets` before `writeFileAtomic`. The handler signature already returns `{ ok, ... }`; add a `redactedSecrets: number` field to the response and surface it in the outputSchema (mirror the `proposal_create` pattern at `authoring.tool.ts:227`).' }
    - { agent: implementation_runner, task: 'S2: in `plugins/proposals/src/lib/tools/authoring.tool.ts` (the `proposal_review` handler at line ~480), redact `args.note` before passing it into `reviewTransition` and onward into the persisted review-log line. `renderReviewLines` concatenates the note verbatim into a markdown bullet — the redaction must happen at the entry point so the persisted markdown is sanitised.' }
    - { agent: implementation_runner, task: 'S3: add a regression test for each tool that pastes a `sk_test_*` / `api_key = "..."` / `Bearer <token>`-style value into the user text and asserts (a) the on-disk markdown does NOT contain the secret, (b) the tool response includes a `redactedSecrets: number` field with value > 0. Mirror the existing test for `proposal_create` at `authoring.spec.ts:152-165`.' }
globalGate: validate
acceptance:
    - { command: bun run typecheck,         expect: exit0 }
    - { command: bun run test,              expect: exit0 }
    - { command: bun run lint:tools,        expect: exit0 }
    - { command: bun run validate,          expect: exit0 }
    - { command: grep -rn "redactSecrets" plugins/proposals/src/lib/tools/ | wc -l, expect: ">= 5 (loop-detector handoff, proposal_create body, proposal_edit value, proposal_review note, the redaction module itself)" }
---

# x00055 — `proposal_edit.value`, `proposal_add_slice.{title,acceptanceCriteria}` and `proposal_review.note` skip `redactSecrets`

## goal

AGENTS.md hard rule:

> "Secrets never get persisted. Durable stores (memory, proposals)
> run user text through `redactSecrets` before writing."

`proposal_create` already honours the rule — the body it persists
is `redactSecrets(body)` (see `authoring.tool.ts:227` and the
existing regression test at `authoring.spec.ts:152-165`). **Three
peer tools do not**:

- **`proposal_edit`** (`mutate-tools.ts:154`) — receives a
  `value: string | string[]` from the user, hands it to
  `renderSectionBody`, and persists via `writeFileAtomic` with no
  redaction. A user who pastes a Stripe key, a GitHub PAT, or a
  Bearer token into a `goal:` / `why:` / `acceptance:` section
  commits the secret into the proposal file and pushes it with
  the rest of the diff.
- **`proposal_add_slice`** (`mutate-tools.ts:355`) — receives a
  slice object with `title: string` and `acceptanceCriteria: string[]`
  from the user, threads them through `renderNewSlice`, and
  persists via `writeFileAtomic` with no redaction. A user who
  titles a slice "Plug api_key = `sk_live_…` into the widget"
  commits the secret into the proposal file.
- **`proposal_review`** (`authoring.tool.ts:480`) — receives
  `note: string` from the reviewer, threads it through
  `reviewTransition(state, action, agent, note)`, and finally
  concatenates it into a `- review-log: …` markdown bullet
  (`renderReviewLines` at `proposal-review.ts:156-167`). Same
  pattern: a reviewer writing "I see a leaked `sk_live_…` in
  src/x.ts" persists the secret into the proposal file.

All three are the same family of bug as x00051–x00054: an AGENTS.md
hard rule was assumed to be enforced at the **call site of
persistence**, but only the tool that *creates* the file
(`proposal_create`) actually invokes `redactSecrets`. The peer
tools that *mutate* or *append* to the same file rely on a
**shared invariant** that is not actually shared.

## why

This is the security half of the same "implicit invariante" pattern
that x00051–x00054 hunted on the **path** axis. The fix is
mechanical: the two handlers already import the rest of
`@mcp-vertex/core/public`; adding `redactSecrets` to the import
list and threading the result through the existing
`writeFileAtomic` call is the minimum invasive change. The
output schemas also need a `redactedSecrets: number` field so a
caller can tell that the redaction actually ran (otherwise a
silent zero on `redactSecrets` is indistinguishable from "no
secrets were present" — same observability gap that `proposal_create`
already closes).

## non-goals

- **No new redaction rules.** The existing `redactSecrets` patterns
  (Stripe keys, AWS keys, GitHub PATs, Bearer tokens, generic
  `api_key = "..."` / `password = "..."` forms) are enough for the
  regression. If a new secret shape needs coverage, that is its
  own proposal in `redact`.
- **No change to `renderReviewLines`'s output shape.** The function
  still emits `- review-log: <verdict> by <agent> — <note>`; the
  fix is that `<note>` is already redacted by the time it gets
  here. Public surface of the helper stays identical.
- **No change to the `proposal_transition` tool's other fields.**
  `proposal_edit` accepts `value` and the fix only touches that
  field. `field: enum` is metadata, not user text.
- **No new redaction rules** beyond `proposal_add_slice`. The
  `sliceId` field is metadata (a programmatic id), not user text;
  the `files: string[]` field is a list of workspace-relative
  paths that go through `resolveWorkspaceContained` upstream and
  are not candidates for secret redaction. `title` and
  `acceptanceCriteria` *are* redacted (S2 in the slices).

## slices

### S1 — `proposal_edit` redacts `value`

File: `plugins/proposals/src/lib/tools/mutate-tools.ts`.

1. Import `redactSecrets` from `@mcp-vertex/core/public`
   (already imported in sibling tools).
2. Before `renderSectionBody(args.value)`, run each string
   element through `redactSecrets`:
   - `string` → `{ text: redactSecrets(value).text, redactions: redactSecrets(value).redactions }`
   - `string[]` → map each, sum the `redactions` counts.
3. Persist the redacted text via `renderSectionBody` (unchanged).
4. Add `redactedSecrets: number` to the `outputSchema` of
   `proposal_edit` and to the success response. A zero value is
   valid (no secrets were present); the field exists so the
   caller can distinguish "I checked" from "the redaction did
   not run".

### S2 — `proposal_review` redacts `note`

File: `plugins/proposals/src/lib/tools/authoring.tool.ts`
(the `proposal_review` handler around line 480).

1. Import `redactSecrets` (already used at line 7 of the same
   file for `proposal_create`'s body).
2. Right after `args.note ?? ''` is materialised, run it through
   `redactSecrets`. Use the redacted text for both:
   - the `reviewTransition(state, action, agent, redactedNote)` call,
   - the `args.note` field echoed back in any error responses.
3. The `rounds[]` array inside the state still receives the
   **already-redacted** note, so `renderReviewLines` produces
   sa2b — `proposal_add_slice` redacts `title` and `acceptanceCriteria`

File: `plugins/proposals/src/lib/tools/mutate-tools.ts`
(the `proposal_add_slice` handler around line 386).

1. Import `redactSecrets` (added in S1 above; same file).
2. Before `renderNewSlice(args.slice)`, run the user-supplied
   `title` and each `acceptanceCriteria` entry through
   `redactSecrets`:
   - `title: string` → `{ text: redactSecrets(title).text, redactions: redactSecrets(title).redactions }`
   - `acceptanceCriteria: string[]` → map each, sum the
     `redactions` counts.
3. Persist the redacted slice via `renderNewSlice(redactedSlice)`.
4. Add `redactedSecrets: number` to the `outputSchema` of
   `proposal_add_slice` and to the success response. The
   `withFileMutex` callback now returns `{ ok, redactionsCount }`
   so the outer `toolOk` can surface the count.

### Snitised bullets.
4. Add `redactedSecrets: number` to the success response of
   `action=submit`, `action=request_changes`, and
   `action=approve`. `action=status` is read-only and does not
   return this field.

### S3 — regression tests

Two new tests, mirroring the existing `proposal_create` test at
`authoring.spec.ts:152-165`:

- `mutate-tools.spec.ts > proposal_edit redacts secrets pasted into
  the value before persisting`:
  - call `proposals_edit` with a `goal` value of
    `Use api_key = "s3cr3tValue123" to call the service`
  - read the proposal file from disk
  - assert the file does **not** contain `s3cr3tValue123`
  - assert the file **does** contain `[REDACTED]`
  - assert the response includes `redactedSecrets > 0`
- `authoring.spec.ts > proposal_review redacts secrets pasted
  into the reviewer note before persisting`:
  - call `proposals_proposal_review` with
    `action: 'request_changes', note: 'I see a leaked
    sk_live_abcdef0123456789 in src/x.ts'`
  - read the proposal file from disk
  - assert the file does **not** contain `sk_live_abcdef0123456789`
  - assert the file **does** contain `[REDACTED]`
  - assert the response includes `redactedSecrets > 0`
- `mutate-tools.spec.ts > proposal_add_slice redacts secrets in
  slice title and acceptanceCriteria`:
  - call `proposals_add_slice` with a slice whose `title`
    contains `api_key = "..."` and `acceptanceCriteria` contains
    a `Bearer` token.
  - read the proposal file from disk.
  - assert both secrets are absent, `[REDACTED]` is present.
  - assert the response includes `redactedSecrets >= 2`.
- `mutate-tools.spec.ts > proposal_edit redacts secrets in
  string[] values, summing the counts`:
  - call `proposals_edit` with `field: 'nonGoals', value:
    [<string with api_key>, <string with sk_test_…>]`.
  - assert the response includes `redactedSecrets >= 2`.

## acceptance criteria

- `bun run validate` is green.
- The new tests pass (4 in total: 1 for `proposal_edit` value,
  1 for `proposal_edit` string[], 1 for `proposal_add_slice`,
  1 for `proposal_review`).
- A `grep -rn "redactSecrets" plugins/proposals/src/lib/tools/`
  returns at least 5 hits: the existing `proposal_create` +
  new `proposal_edit` + new `proposal_add_slice` + new
  `proposal_review` + the redaction module's own re-export
  (5 hits in `mutate-tools.ts` and `authoring.tool.ts` plus the
  import site in `proposal_review.ts`).
- Manual smoke: open a real proposal, paste
  `sk_live_abcdef0123456789` into a reviewer note, `bun run
  sync_proposals` and `git diff` — the on-disk file contains
  `[REDACTED]`, not the secret.

## risks

- **False positives in `redactSecrets`.** A user that *intends* to
  document a secret format (e.g. "the API uses keys of shape
  `sk_live_xxxx`") will see the example redacted. That is the
  intended trade-off: a false positive in user-facing prose
  (`[REDACTED]` in a docs example) is much cheaper than a false
  negative in a persisted file (a real key in git history that
  needs `git-filter-repo` to clean up).
- **`proposal_review`'s `status` action is read-only** and returns
  no new fields. The `redactedSecrets` field is only present on
  the three write actions; hosts that consume the status action's
  output see no schema change.
- **Backwards compatibility for `outputSchema`.** The
  `proposal_edit` and `proposal_review` output schemas currently
  declare an exact shape; adding a new optional field is a
  non-breaking additive change. The tool surface in
  `apps/web/src/i18n/langs/*.ts` does not pin these schemas
  field-by-field, so no i18n update is required.
