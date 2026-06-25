# `retired/issues/` — ingested GitHub issue scaffolds

Every GitHub issue that the `@mcp-vertex/issues` plugin analyses leaves a
durable scaffold file here — **regardless of outcome**. The analysis *is*
the artifact: whether an issue becomes a proposal or is dismissed, the
record of "we looked at this and decided X" lives in one file you can
`cat` offline or quote back on GitHub.

This directory is part of the `proposals` plugin's managed namespace
(`<docsDir>/proposals/**`). The `issues` plugin declares
`dependsOn: ['proposals']` precisely so these files sit next to the
proposals they produce, with a single source of truth linking them.

## File naming

```
github#<number>-<slug>.md
```

- `<number>` — the GitHub issue number (globally unique per repo).
- `<slug>` — the issue title, lowercased, ASCII-folded, hyphenated.
- On a slug collision (two different issues, same slug), a deterministic
  4-char suffix derived from `sha256(number)` is appended:
  `github#<number>-<slug>-<hash4>.md`. Retries are stable — the same
  issue always resolves to the same file name.

## Lifecycle

```
issues_ingest   →  status: ingested,  resolution: pending
issues_analyze  →  status: analyzed,  resolution: pending   (draft only)
issues_resolve  →  resolution: promoted | promoted-multiple | dismissed
```

- **`issues_ingest`** writes the scaffold (idempotent; `force: true` to
  overwrite). The original issue body + a comments snapshot are embedded
  so the thread is recoverable offline.
- **`issues_analyze`** runs the *mechanical* pre-analysis (label
  heuristics, body length, repo cross-references) and returns a draft
  `{ kind, confidence, rationale, bodyMarkdown }`. It does **not** create
  a proposal — the host's LLM owns that decision.
- **`issues_resolve`** records the outcome in frontmatter. Promotion to a
  proposal is a separate `proposals_create_proposal` call the host makes;
  `issues_resolve` then links the resulting id(s) in `proposals`.

| `resolution`         | meaning                                          |
|----------------------|--------------------------------------------------|
| `pending`            | ingested/analyzed, not yet decided               |
| `promoted`           | one proposal was created from this issue         |
| `promoted-multiple`  | several proposals were carved out                |
| `dismissed`          | analysed, but no proposal warranted (needs `dismiss_reason`) |

## Frontmatter schema

The well-known keys on every scaffold (see
`plugins/issues/src/lib/contracts/issue.types.ts` for the authoritative
type `IIssueScaffoldFrontmatter`):

```yaml
source: github              # always 'github' (room for other sources later)
source_id: 123              # the GitHub issue number
source_url: https://github.com/<owner>/<repo>/issues/123
source_author: octocat
ingested_at: 2026-06-22T10:00:00.000Z   # ISO timestamp of first ingest
status: ingested            # 'ingested' | 'analyzed'
resolution: pending         # 'pending' | 'promoted' | 'promoted-multiple' | 'dismissed'
proposals: []               # proposal ids this issue was promoted into
dismiss_reason: ''          # required only when resolution: dismissed
comments: []                # redacted snapshot of the issue's comments
```

## Security

All user-authored text (issue body and every comment body) is run through
the core `redactSecrets` primitive **before** being written here, so a
token or credential pasted into an issue never survives into a durable
file on disk — the same contract as `plugins/memory`.

## Not a proposal folder

These files are issue *records*, not proposals. They are deliberately not
under `ready/` or `done/`: the analysis is the outcome, independent of
whether it promoted to a proposal. The proposal scaffold linter does not
treat them as proposals.
