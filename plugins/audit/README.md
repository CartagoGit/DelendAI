# `@delendai/audit`

Multi-model audit plugin (l99, scope A). Standardizes the repo's audit
format and consolidates N audits into a single unified roadmap.
Planning and consolidation are local; `audit_run` is an explicit network
surface that uses only the providers and credentials supplied by the
host.

### Activation

```bash
delendai --plugins=audit
```

## Tools

### Audit types

All tools that generate or consolidate audits accept
`auditType: "valuation" | "plan"` and use `valuation` by default to
preserve compatibility:

- `valuation`: complete technical assessment of the project, with
  findings and remediation proposals (`kind: fix`).
- `plan`: execution-oriented exhaustive audit. The brief requires
  snapshot, scores, actionable findings, roadmap, target architecture,
  Definition of Done, and proposal template. When the `proposals`
  plugin is available, the scaffolder creates a parent plan
  (`type: plan`, `kind: plan`) with child fix proposals (`kind: fix`)
  linked via `contains.proposals`.

The contract is project-agnostic: the plugin does not assume the name,
structure, language, or taxonomy of the audited project. The layer
scopes, dimensions, paths, and specific rules are provided by the host
through its options.

### `audit_plan { scope? }` — returns the canonical brief

Generates the markdown that the agent copies/pastes into any model
(Antigravity, Claude Code, Copilot, Codex, …). Optional scope
(`full` | `core` | `plugins` | `web` | `security` | `tokens` |
`tests` | `docs`; default `full`) to focus the audit.

The brief includes:

- Frontmatter with date, reviewer, and methodology.
- 5-band rubric (🔴 FATAL · 🟠 VERY BAD · 🟡 IMPROVABLE · 🟢 OK · 🌟 VERY GOOD · 💎 PERFECT).
- Checklist of sections to inspect.
- Mandatory scoring table for 9 dimensions.

### `audit_consolidate { auditDir?, topActions? }` — consolidates N audits

Reads each `*.md` from `auditDir` (default
`docs/delendai/proposals/done/audits`), parses them with `parseAuditBody`,
deduplicates findings by **title + cited file**, averages scores per
dimension, and returns:

- `auditsFound`, `skipped` (audits that could not be parsed).
- `consensus`: array per dimension with each model's scores + the
  average rounded to 1 decimal.
- `findings`: deduplicated array with `worstSeverity`, `files`, `seenBy`.
- `topActions`: the 5 most urgent actions (consensus FATAL/VERY BAD).
- `markdown`: the master document in markdown, ready to commit.

## Why a plugin and not just docs

- The brief is **canonical**: it lives in `buildBrief()` and is exported
  as a string; any consumer (web, scripts, other plugins) re-emits it
  without divergence.
- Consolidation is **automatic and reproducible**: the same input
  produces the same output (no timestamps, no random ordering).
- The orchestrator can invoke `audit_consolidate` after each round
  without human intervention.

## Expected format of each individual audit

Every `.md` that a model writes must follow the canonical brief:

- `# 🔍 Exhaustive Audit — <title>`
- Frontmatter: `> Date | Reviewer | Methodology`
- `## 📊 Executive Summary`
- `## 🔴 FATAL`, `## 🟠 VERY BAD`, `## 🟡 IMPROVABLE`, `## 🟢 OK`, …
- Each finding: `### N. <title>` with `**File**: <path>`
- Final table: `| Dimension | Score | Comment |`

The parser is **permissive**: unknown sections are ignored, empty fields
do not break it. The brief format is the **recommended convention**
but the parser tolerates reasonable variants.

## Effects

`audit_plan` is pure and `audit_consolidate` reads local reports.
`audit_run` declares network and can write reports/proposals when so
requested and the `proposals` plugin is available. The response reports
any omitted writes; there is no silent mode to pretend it materialized.

## Configuration

```jsonc
// delendai.config.json
{
  "plugins": {
    "audit": { "options": { "topActions": 5, "autoScaffoldProposals": true } }
  }
}
```

It also accepts `auditDir`, `proposalsDir`, `dimensions`, `layers`,
`projectName`, `configFileName`, and `crossCuttingAdditions`; the
runtime schema is the authoritative source of types and limits.

## See also

- `docs/delendai/proposals/done/audits/` — the individual audit `.md`
  files that this plugin parses.

### `audit_run { scope, targets, ... }` — runs configured reviewers

Contacts the requested providers and therefore declares network effect.
Keys are supplied in the request/environment and never written to
reports. If the `proposals` plugin is loaded, it can materialize
proposals; otherwise, it explicitly returns that this step was omitted.

## Self-audit

`self_audit` composes `aggregateSelfAudit`, `rankFindings`, and,
when the caller grants consent, `fileProposalsFromBacklog` to turn
scanner findings into one ranked backlog and optionally file the top
items as proposal drafts for human review.

## Activate

```bash
delendai --plugins=audit
```

### Inputs

`self_audit { limit?, consent? }`

- `limit` caps how many ranked findings are returned and, when filing is
  enabled, how many proposal drafts can be created in one run.
- `consent` is required for proposal filing; omit it or pass `false`
  to keep the run read-only.

### Outputs

Returns the aggregated audit summary plus the ranked backlog. When
`consent: true`, the filing step also returns an `IFileProposalsResult`
payload with:

- `filed`, `skipped`, `ranAt`
- `drafts[]` with `absPath`, `proposalId`, `rank`, and the source
  `finding`

### Filing proposals

Proposal filing is consent-gated: drafts are only written when the
caller passes `consent: true`. The filing step also applies a separate
`limit` safety cap (default `3`) so a large backlog cannot flood the
proposals directory in a single run.

### Example

Minimal tool call:

```json
{"limit": 5, "consent": true}
```

Result shape:

```json
{
  "filed": 3,
  "skipped": 2,
  "drafts": [
    {
      "absPath": "/repo/docs/delendai/proposals/ready/f0012345-fix-issue.md",
      "proposalId": "f0012345",
      "rank": 1,
      "finding": {
        "ruleId": "rule-id",
        "severity": "high",
        "message": "Explain the issue"
      }
    }
  ],
  "ranAt": "2026-07-26T00:00:00.000Z"
}
```

### Design reference

See [docs/delendai/proposals/done/feats/f00139-self-audit-dogfood-loop.md](docs/delendai/proposals/done/feats/f00139-self-audit-dogfood-loop.md)
for the original S3 design notes and acceptance criteria.
