---
id: x01022
title: "The seven open code-scanning alerts on develop are triaged, each fixed or dismissed with its reason"
kind: fix
status: ready
type: proposal
track: ci
date: 2026-11-04
---

# x01022 — The seven open code-scanning alerts on develop are triaged, each fixed or dismissed with its reason

## goal

Each of the 7 code-scanning alerts open on develop on 2026-11-04 is fixed, or dismissed with the reason it does not apply.

## why

External audit (ChatGPT, 2026-11-04, against develop f7f53bf8d), finding 3. Claim: 7 code-scanning alerts are open on develop. Verified: `gh api repos/CartagoGit/delendai/code-scanning/alerts?state=open` lists exactly these: #477 and #478 `js/insecure-temporary-file` (high) at `maintenance-lease.service.ts` lines 125 and 146; #475 `js/polynomial-redos` (high) at `plugins/container/src/lib/lint/parse-dockerfile.ts:57`; #474 `js/polynomial-redos` at `plugins/audit/src/lib/services/proposal-scaffolder.service.ts:131`; #471, #472, #473 `js/polynomial-redos` at `packages/proposals-sqlite/src/lib/markdown-parser.ts` lines 36, 107 and 119. I read the flagged lines, not a reproduction. The lease scratch file is a name beside the lease inside the workspace cache, written then linked or renamed, so it is not a world-writable temp path: likely dismissible with that reason. The regexes (`^#\s+(.+)$`, `^([A-Za-z]+)\s+(.*)$` and the slice heading and status matchers) run on local documents and are anchored, but several have adjacent overlapping quantifiers around `\s`, so a long whitespace run is quadratic: real but low impact, cheap to fix by bounding the input line. So at least some are real and each needs an owner. x00995 already reports open alerts in the queue job; this proposal clears the ones it reports.

## non-goals

- Silencing a query by changing a reviewed design.
- The report of open alerts in the queue job, which x00995 owns.

## slices

- global_gate: none

### S1 — The lease scratch file alerts
- **Status**: pending
- **Files**: `packages/core/src/lib/development-policy/maintenance-lease.service.ts`
- **Gate**: type
- acceptance:
  - "#477 and #478 are each fixed or dismissed on GitHub with the reason that the scratch name is inside the owned workspace cache; the decision is recorded in this proposal."

### S2 — The markdown parser expressions
- **Status**: pending
- **Files**: `packages/proposals-sqlite/src/lib/markdown-parser.ts`
- **Gate**: type
- acceptance:
  - "#471, #472 and #473 are fixed by bounding the line length matched, with a spec of a 100000-space line that finishes quickly, or dismissed with a reason."

### S3 — The dockerfile and scaffolder expressions
- **Status**: pending
- **Files**: `plugins/container/src/lib/lint/parse-dockerfile.ts`, `plugins/audit/src/lib/services/proposal-scaffolder.service.ts`
- **Gate**: type
- acceptance:
  - "#474 and #475 are fixed with a spec of a pathological line, or dismissed with a reason."

## acceptance

- #477 and #478 are each fixed or dismissed on GitHub with the reason that the scratch name is inside the owned workspace cache; the decision is recorded in this proposal.
- #471, #472 and #473 are fixed by bounding the line length matched, with a spec of a 100000-space line that finishes quickly, or dismissed with a reason.
- #474 and #475 are fixed with a spec of a pathological line, or dismissed with a reason.
