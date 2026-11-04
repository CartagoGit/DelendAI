---
id: x01031
title: "The urgent proof lane reads the integration branch's certification through the API"
kind: fix
status: ready
type: proposal
track: a00095-consistency
date: 2026-11-04
---

# x01031 — The urgent proof lane reads the integration branch's certification through the API

## goal

The urgent lane asks the forge for the integration branch's latest certification with a call every gh version answers, so a red integration branch really makes a fix's proof urgent.

## why

The urgent proof lane (f00804) lets a fix whose integration branch is red take the machine's compute slot ahead of the other proofs. It decides "red" in `urgent-turn.service.ts` by running `gh run list --workflow ci.yml --branch <integration> --status completed ...`. The gh installed here has no `--branch` flag on `run list`, so the call exits non-zero. The lookup catches every error and answers "unknown", and unknown means "not urgent". The failure is therefore silent: a red develop never made any fix urgent, and the automatic lane never fired, with nothing in any log to say why.

`gh api repos/{owner}/{repo}/actions/workflows/ci.yml/runs?branch=<integration>&status=completed&per_page=1` is the same question asked through the REST endpoint, which every gh version supports; gh fills `{owner}` and `{repo}` from the remote of the directory it runs in. The integration branch comes from the policy (`request.integration`), never a literal. The safe default stays: when the forge cannot be asked or answers nothing, the proof is not urgent. What changes is that the reason is now written to stderr (never stdout, which carries the MCP answer), so a lane that cannot decide is visible.

## non-goals

- Changing when a proof is urgent (a fix on a red integration branch, or `--urgent=<reason>`).
- Reading any workflow other than the certifying `ci.yml`.

## slices

- global_gate: none

### S1 — The lookup uses gh api
- **Status**: pending
- **Files**: `packages/core/src/lib/work-units/urgent-turn.service.ts`, `packages/core/src/lib/contracts/interfaces/urgent-turn.interface.ts`, `packages/core/tests/src/lib/work-units/urgent-turn.service.spec.ts`
- **Gate**: none

## acceptance

- The certification lookup runs `gh api repos/{owner}/{repo}/actions/workflows/ci.yml/runs?branch=<integration>&status=completed&per_page=1` in the project root, with the integration branch taken from the policy; a spec with a stubbed command runner sees exactly that call and a red conclusion makes a fix's proof urgent.
- When the call fails or answers nothing, the proof is not urgent and the reason is logged to stderr; a spec asserts both.
