---
id: x01022
title: "The seven open code-scanning alerts on develop are triaged, each fixed or dismissed with its reason"
kind: fix
status: review
type: proposal
track: ci
date: 2026-11-04
last-transition-id: 4a941319-be31-4761-b382-16f949a4b022
last-correlation-id: 4a941319-be31-4761-b382-16f949a4b022
last-transition-from: in-progress
last-transition-at: 2026-11-04T11:22:34.594Z
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
- **Status**: review
- **Files**: `packages/core/src/lib/development-policy/maintenance-lease.service.ts`
- **Gate**: type
- acceptance:
  - "#477 and #478 are each fixed or dismissed on GitHub with the reason that the scratch name is inside the owned workspace cache; the decision is recorded in this proposal."
- shipped-in: `2c5e46fc983e`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

### S2 — The markdown parser expressions
- **Status**: review
- **Files**: `packages/proposals-sqlite/src/lib/markdown-parser.ts`
- **Gate**: type
- acceptance:
  - "#471, #472 and #473 are fixed by bounding the line length matched, with a spec of a 100000-space line that finishes quickly, or dismissed with a reason."
- shipped-in: `2c5e46fc983e`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

### S3 — The dockerfile and scaffolder expressions
- **Status**: review
- **Files**: `plugins/container/src/lib/lint/parse-dockerfile.ts`, `plugins/audit/src/lib/services/proposal-scaffolder.service.ts`
- **Gate**: type
- acceptance:
  - "#474 and #475 are fixed with a spec of a pathological line, or dismissed with a reason."
- shipped-in: `2c5e46fc983e`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

## acceptance

- #477 and #478 are each fixed or dismissed on GitHub with the reason that the scratch name is inside the owned workspace cache; the decision is recorded in this proposal.
- #471, #472 and #473 are fixed by bounding the line length matched, with a spec of a 100000-space line that finishes quickly, or dismissed with a reason.
- #474 and #475 are fixed with a spec of a pathological line, or dismissed with a reason.

## notes

All seven alerts are real and fixed in code; none is dismissed. Nothing was dismissed on the forge.

- #477, #478 (`js/insecure-temporary-file`, maintenance-lease.service.ts): the premise that the name was safe because it sits in the workspace cache does not hold, since the name was predictable (`<lease>.<holder>`) and written with the default mode, following a planted link. Fixed: every scratch file now has a random-UUID name, is opened `wx` (fails on any existing file or link) with mode 0600, in a directory created 0700; the stale-aside name is random too. Specs: 0600 and no leftovers; a symlink planted at the old name is not written through.
- #471, #472, #473 (`js/polynomial-redos`, markdown-parser.ts): the title, slice heading, `## Slices`, `##` heading and status matchers are linear string parses with the same grammar. Specs: 100000-space lines for each.
- #474 (proposal-scaffolder.service.ts): the `-+$` slug trim is an index trim. Spec: a 100000-dash title.
- #475 (parse-dockerfile.ts): `^([A-Za-z]+)\s+(.*)$` is a linear split. Spec: a 100000-space line.
