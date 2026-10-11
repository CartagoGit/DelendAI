# Workflow run evidence

Proposals that move to `review` or `done` in CI must already carry explicit
frontmatter evidence tying the proposal to the workflow runs that validated the
commit.

## Collecting evidence

Run:

```bash
bun run collect-evidence <proposalId>
```

The script reads the current `HEAD`, queries `gh run list --commit <sha>`, and
writes an `evidence:` block into the target proposal frontmatter.

## Required shape

The frontmatter block must contain:

- `commit`
- `collected-at`
- `ci-runs` with at least one run entry

Example:

```yaml
evidence:
  commit: "abc123"
  collected-at: "2026-08-25T12:00:00.000Z"
  ci-runs:
    - name: "CI"
      status: "success"
      runId: "101"
      logUrl: "https://github.com/owner/repo/actions/runs/101"
```

## Enforcement

- Local development can still move a proposal to `review` with fresh
  `validateEvidence` only.
- CI transitions to `review` or `done` fail unless that `evidence:` block is
  present.
- `force: true` remains the explicit audited bypass for emergency cases.
