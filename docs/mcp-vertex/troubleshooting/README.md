# Troubleshooting — `@mcp-vertex/core`

Index of the troubleshooting documents. Each entry is a one-page playbook
for a specific failure mode; they are alphabetically ordered by filename
to keep diffs stable.

| # | Document | Failure mode |
|---|----------|--------------|
| 1 | [agent-slots-enum-rejected.md](agent-slots-enum-rejected.md) | Agent scaffolding fails when the slot enum is rejected by the runtime. |
| 2 | [auto-work-idle.md](auto-work-idle.md) | `proposals_auto_work` returns `stop: true` and the orchestrator stalls. |
| 3 | [docsdir-misconfig.md](docsdir-misconfig.md) | Docs plugin picks the wrong `docs/` directory after a project move. |
| 4 | [npm-token-expired.md](npm-token-expired.md) | Release fails because the npm provenance / publish token has expired. |
| 5 | [output-validation-failure.md](output-validation-failure.md) | A tool's runtime output does not match its declared `outputSchema`. |
| 6 | [web-base-path.md](web-base-path.md) | The Astro site is mounted under a sub-path and assets 404. |

## Adding a new troubleshooting document

1. Drop the new `.md` in this folder following the existing one-page
   format (symptom → root cause → fix → regression test).
2. Update this index with a new row (link the filename, one-sentence
   summary in the "Failure mode" column).
3. Run `bun run lint:proposals` and `bun run lint:setup` to keep the
   proposal/preset gates green.
