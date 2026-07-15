---
id: x00105
title: "verify:tools actually probes plugin-owned tools and derives the plugin list from disk"
kind: fix
status: review
type: proposal
track: tooling+gates
date: 2026-07-14
---

# x00105 — verify:tools actually probes plugin-owned tools and derives the plugin list from disk

## Goal

Make the verify:tools gate do what its header claims ("Smoke test for every plugin in plugins/*"). Today it probes 18 identical CORE tool rows per plugin and zero plugin-owned tools (status-marker close/validate/ping, conventions classify/check, test-policy get/set… none appear in the output), and its PLUGIN_LIST is a hardcoded array that omits 5 existing plugins (conventions, external-mcps, issues, orchestrator-runner, usage-tracking) and must be hand-edited for every new plugin — the exact "hardcoded list" anti-pattern the bootstrap bans.

## why

Audit a00054 F-1. Evidence: tools/scripts/verify/plugin-tool-verify.script.ts:48 (PLUGIN_LIST hardcoded, 15 of 20 plugins), verifyPlugin() iterates config.extraTools from the test bed but the run output shows exactly 18 core rows per plugin and no plugin-owned tool ids (288 = 16 plugins x 18). A gate that does not exercise plugin handlers cannot catch schema drift — conventions_classify shipped a stale 10-role output enum for months (fixed in f00113) and this gate never noticed.

## non-goals

- No happy-path inputs invented per tool — the empty-input probe + declared-outputSchema assertion is the floor; KNOWN_PROBE_INPUTS stays the opt-in mechanism for happy paths.
- No network or workspace mutation in probes.

## Slices

- global_gate: e2e

### S1 — Diagnose why plugin-owned registrations never reach the probe loop; fix the test-bed seam; probe assertions + disk-derived plugin discovery in the script
- **Status**: done
- **Files**: `tools/scripts/verify/plugin-tool-verify.script.ts`, `tools/scripts/lib/plugin-test-bed.ts`, `tools/scripts/verify/verify-probes.ts`
- **Gate**: e2e
- acceptance:
  - "Running verify:tools lists at least one plugin-owned tool row per plugin (e.g. status-marker close, conventions conventions_classify, test-policy get_test_policy)."
  - "Every probed tool asserts an outputSchema is declared (missing one = failed row, per repo hard rule #8)."
  - "The script discovers plugins by reading plugins/* dirs (skip-list only for plugins that genuinely cannot boot in the bed, each with a comment saying why); conventions, external-mcps, issues, orchestrator-runner and usage-tracking get probed or carry an explicit documented skip; adding a future plugin requires zero edits."

## acceptance

- Running verify:tools lists at least one plugin-owned tool row per plugin (e.g. status-marker close, conventions conventions_classify, test-policy get_test_policy).
- Every probed tool asserts an outputSchema is declared (missing one = failed row, per repo hard rule #8).
- The script discovers plugins by reading plugins/* dirs (skip-list only for plugins that genuinely cannot boot in the bed, each with a comment saying why); conventions, external-mcps, issues, orchestrator-runner and usage-tracking get probed or carry an explicit documented skip; adding a future plugin requires zero edits.
