---
name: read-stderr-storm
description: >
  How an agent consumes its own stderr through the StormDetector +
  commit_policy_storms tool, files a `kind: repair` proposal, and
  applies the fix slice. Use whenever the operator says "check the
  logs", "why is this code repeating", or after a slice returns ERR.
invokes:
  - commit_policy_storms
  - delendai_overview
  - proposals_list
  - proposals_get
---

# Read stderr → file repair proposal → apply slice

## When to invoke

Invoke this skill when:

- The user says "check the logs" or "why is X repeating".
- A slice just returned `ERR` and the operator wants to know if
  the same code has been firing repeatedly.
- The host boot hook filed a `kind: repair` proposal under
  `docs/delendai/proposals/ready/repairs/` and you want to
  verify it is correct before claiming it.
- `commit-policy` started emitting WARN lines you do not
  understand — the structured snapshot will replace the wall of
  noise with a single tool call.

## Step 1 — Read the snapshot

Call `commit_policy_storms`. The tool returns:

```ts
{
  storms: [{
    code: 'WORKSPACE_HAS_NO_FILES',
    trigger: 'slice',
    count: 47,
    windowSeconds: 30,
    sampleProposalIds: ['x00168', 'x00169', 'x00183', ...],
    firstSeenAt: '...',
    lastSeenAt: '...',
    suggestedFix: 'resolve-scope.ts: files is empty after the stage step.',
    exceedsThreshold: true,
  }],
  totalEventsInWindow: 1847,
  windowSeconds: 30,
  threshold: 5,
}
```

`storms` is sorted by `count` desc. The first storm is the most
urgent one. Read its `suggestedFix` first — it points to the
source file most likely responsible for the noise.

## Step 2 — Cross-reference the implicated proposals

For each `proposalId` in `sampleProposalIds`:

1. Read the proposal body via `proposals_get`.
2. Find the slice that was firing — the proposal body has a
   `Slices:` table. Look for slices with `status: in-progress` or
   `status: done`.
3. Note the slice's `Files:` block — those are the paths the
   agent declared. They tell you what the slice thought it was
   committing.

## Step 3 — Diagnose

Apply the diagnosis formula:

- If `code === 'WORKSPACE_HAS_NO_FILES'`: read the file in
  `suggestedFix`. The bug is usually in the resolver that
  filters `files` by `workspaceDirty` (it should not — the stage
  step does its own filter).
- If `code === 'CAUSALITY_VIOLATION'`: read engine.ts. The
  `scope.files` set does not include the staged paths.
- If `code === 'CROSS_AGENT_CONTAMINATION'`: read commit-driver.
  The stage step is taking foreign paths. The fix is usually
  to tighten the `enforceSubset` check.

The `suggestedFix` field is intentionally short — one line, one
file, one sentence. If you need a deeper explanation, read the
referenced file with `read_file` and grep for the failure mode.

## Step 4 — File a repair proposal

If no proposal was filed automatically (the host boot hook only
files when `count >= threshold`), file one by hand:

1. Read `plugins/proposals/src/lib/auto-work/repair-mode.ts`
   to understand the `kind: repair` body shape.
2. Construct the proposal: `kind: repair`, `auto_generated: true`
   in the frontmatter, `Files:` set to the source file from
   `suggestedFix`, `Slices: [{id: S1, title: 'Fix <code>'}]`.
3. Write it under
   `docs/delendai/proposals/ready/repairs/x00NNN-fix-<code>-<date>.md`
   where `00NNN` is the proposal registry's next free id.

If a proposal already exists under that path (from a previous
boot hook run), do NOT overwrite it. Read it instead, decide if
the fix it proposes is correct, and either claim it (`proposals_
transition {to: in-progress}`) or close it as `superseded` and
file a better one.

## Step 5 — Apply the slice

Use the existing `commit-policy` workflow:

1. `proposals_transition {to: in-progress}` on the repair proposal.
2. Apply the fix to the source file. The slice is single-purpose
   — only modify the file in `Files:`. The resolver will reject
   anything else.
3. `bun run validate` to confirm the fix does not regress the
   rest of the suite.
4. `commit-policy` will fire the slice automatically when the
   file changes are dirty. Alternatively, call
   `commit_policy_run` to force the commit.

## Step 6 — Verify the storm dies

Call `commit_policy_storms` again. The storm should be gone (the
sliding window evicts it within 30s, and no new events for that
`code` will be emitted because the bug is fixed).

If a different `code` is now the top storm, repeat from step 1.
The loop is closed.

## Anti-patterns

- **Do NOT** read the raw stderr. The structured snapshot is
  always cheaper and more reliable.
- **Do NOT** modify multiple files in a single repair slice. The
  resolver will reject anything that does not match `Files:`.
- **Do NOT** delete the on-disk StormLog files
  (`<pluginCacheDir>/storms/*.json`) — they are the agent's
  memory across restarts.
- **Do NOT** raise the storm `threshold` to silence a storm you
  do not understand. The threshold is for the operator's signal,
  not for tuning away the bug.