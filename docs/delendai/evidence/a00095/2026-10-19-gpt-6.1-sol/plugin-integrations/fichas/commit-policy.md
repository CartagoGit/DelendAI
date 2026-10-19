# Plugin review: commit-policy (in progress)

Auditor: `gpt-6.1-sol` (Codex). Source snapshot: `514758e783620c8953079be4d71fceccacb3de8b`.

This is an interim record. The plugin has 15,802 production TypeScript lines and a 75-file test suite; high-risk commit, push, branch protection, WIP persistence, and trigger paths have been reviewed, but the production source review is not complete. No final plugin score is assigned.

Four P2 findings are recorded so far. A failed remote branch-protection refresh clears the previously fetched protections; quoted porcelain paths fail to stage filenames containing spaces; the production `sharedDriver` omits `workspaceRoot`, disabling the shared Git write mutex and isolated index path; and two declared agent identities can persist the same WIP slice under two different work refs because persistence does not verify claim ownership. The first two use local synthetic/Git fixtures, the third uses a deterministic fake-runner interleaving, and the fourth uses the real WIP port in a temporary repository with auto-push disabled. None claims a real remote was changed or PRs were opened. The production source review remains incomplete, so the card and plugin score are still provisional.

## Interim evidence

[Partial reviewer analysis](../../evidence/reviewer-originals/plugin-integrations/fichas/commit-policy.source.es.txt) · [CP-01 reproduction](../../evidence/commit-policy/repro-refresh-failure.ts) · [CP-01 result](../../evidence/commit-policy/repro-refresh-failure.log) · [CP-02 reproduction](../../evidence/commit-policy/repro-porcelain-quoted-path.ts) · [CP-02 result](../../evidence/commit-policy/repro-porcelain-quoted-path.log) · [CP-03 reproduction](../../evidence/commit-policy/repro-register-missing-workspace-lock.ts) · [CP-03 result](../../evidence/commit-policy/repro-register-missing-workspace-lock.log) · [CP-04 reproduction](../../evidence/commit-policy/repro-wip-slice-owner-mismatch.ts) · [CP-04 result](../../evidence/commit-policy/repro-wip-slice-owner-mismatch.log) · [test suite](../../evidence/commit-policy/validation.log)

Do not treat this as a completed plugin review. Remaining source modules and host/provider behavior are still open.
