---
id: a00057
title: "17-07-2026 audit — proposal Files: drift is a real, recurring class; a burn-down ratchet gate now catches it"
kind: audit
status: done
type: proposal
track: audit
date: 2026-07-16
closed-by: cartago (consolidated evidence pass 2026-07-26)
closed-evidence:
  - 3 commits referencing a00057 recovered from git log --grep (precedes convention)
  - all declared Files verified to exist via 3-commit batch
shipped-in:
  - 7aaa10fd # fix(cli): a00061 — mcpv init/init:default silently ignored --workspace and wrote
  - 50906f38 # fix(dev): a00058 — dev-preview browser bundles were silently broken since an unk
  - 61e33d69 # feat(proposals): a00057 — Files: doc drift is a recurring class; permanent ratch
---

# a00057 — 17-07-2026 claude-round-2 audit — proposal Files: drift is a real, recurring class; a burn-down ratchet gate now catches it

## Goal

Triggered by q00002's independent peer review, which caught f00118's own proposal doc naming Files: that were never created. Generalized the check: scanned every done/review/in-progress proposal's Files: lists against the real filesystem. Found the SAME defect class in 8 more already-done proposals (f00097, f00112, f00113, f00116, r00009, t00002, x00102, x00103) — writers copy the originally-planned Files: list and never correct it after a mid-build re-scope or rename. Fixed all 9 (incl. f00118) to name what actually shipped. Built a permanent ratchet gate (proposal-files-exist.script.ts, wired into lint:proposals) so future drift is caught automatically instead of relying on a peer reviewer noticing by chance.

## why

User directive: keep pushing every dimension of the project to 11/10. A defect class found once by a lucky independent review is not "fixed" until there's a standing gate — the same discipline as a00054's "gates that lie" finding and a00055's error-envelope convention.

## non-goals

- No retroactive fix of the full historical debt — 579 dangling refs across 68 proposals were found repo-wide (many legitimate: an old pre-move docs/proposals/ scheme, deleted example dirs, CSS selectors mis-captured as paths). These are baselined as pre-existing debt, matching the types-in-contracts ratchet convention — only NEW drift is blocked.
- Findings without file:line evidence are not recorded (playbook rule).

## Slices

- global_gate: lint

### S1 — Findings + fixes to 9 drifted proposals + permanent ratchet gate
- **Status**: done
- **Files**: `tools/scripts/lint/proposal-files-exist.script.ts`, `tools/scripts/lint/proposal-files-exist.script.spec.ts`, `tools/scripts/lint/proposal-files-exist.baseline.json`, `package.json`
- **Gate**: lint
- acceptance:
  - "scanMissingFiles(root) walks done/review/in-progress proposals (ready/paused excluded as not-yet-built), extracts backtick-quoted Files: paths incl. multi-line lists, strips trailing line-number refs, skips glob/JSX/none placeholders and pre-transition ready/ self-references."
  - "9 already-done proposals (f00097, f00112, f00113, f00116, f00118, r00009, t00002, x00102, x00103) had their Files:/acceptance text corrected to name what actually shipped."
  - "proposal-files-exist wired into lint:proposals; baseline captures the 579 pre-existing historical refs (mostly legitimate) so only NEW drift fails validate."
  - "bun run lint:proposals green; new script's own spec (6 cases) green."

## acceptance

- scanMissingFiles(root) walks done/review/in-progress proposals (ready/paused excluded as not-yet-built), extracts backtick-quoted Files: paths incl. multi-line lists, strips trailing line-number refs, skips glob/JSX/none placeholders and pre-transition ready/ self-references.
- 9 already-done proposals (f00097, f00112, f00113, f00116, f00118, r00009, t00002, x00102, x00103) had their Files:/acceptance text corrected to name what actually shipped.
- proposal-files-exist wired into lint:proposals; baseline captures the 579 pre-existing historical refs (mostly legitimate) so only NEW drift fails validate.
- bun run lint:proposals green; new script's own spec (6 cases) green.
