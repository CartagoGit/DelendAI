# Plugin review: gitlab

Auditor: `gpt-6.1-sol` (Codex). Source snapshot: `514758e783620c8953079be4d71fceccacb3de8b`.

The plugin was reviewed individually across source, metadata, tools, and all eight test files. It exposes 11 read-only MCP tools by default and five opt-in mutation tools. Its focused suite passed 113 tests. Two local reproductions and one static transport trace found three P2 defects involving symlink containment, timeout scope, and artifact download limits.

## Complete signed review and evidence

[Read the complete Spanish reviewer source](../../evidence/reviewer-originals/plugin-integrations/fichas/gitlab.source.es.txt). It includes per-criterion assessment, evidence, reproduction commands, limitations, confidence, and proposed regressions.

- [Focused test output](../../evidence/gitlab/test-results.log)
- [Symlink escape reproduction](../../evidence/gitlab/repro-artifact-symlink.ts) · [result](../../evidence/gitlab/repro-artifact-symlink.log)
- [Response timeout reproduction](../../evidence/gitlab/repro-timeout-body.ts) · [result](../../evidence/gitlab/repro-timeout-body.log)

**Provisional score: 6.5/10.** The plugin has broad functionality and carefully separated opt-in writes, but the confirmed containment and timeout gaps, plus a download cap applied only after full buffering, lower confidence for untrusted workspaces and large responses. Real GitLab and host integration remain unverified.
