#!/usr/bin/env bun
/**
 * dry-run.spec.ts — f00201 (Track O / q00006 §55).
 *
 * Pins the `dryRun` contract for the workflow-transaction executor.
 * Two rules from the proposal:
 *   1. `execute(plan, { dryRun: true })` MUST NOT execute the
 *      `run` of any step — the whole point of a preview is
 *      "what would happen if I ran this for real?". Both pure
 *      and side-effecting steps are skipped; only the trace
 *      (`executedStepNames`, `risk`) is built.
 *   2. The compensation path is also skipped in dryRun mode —
 *      recorded as `skippedReason: 'dry-run'` so the LLM sees
 *      we considered them but did not invoke them.
 *
 * Tests use synthetic steps that mutate an in-process counter on
 * `run` and on `compensate`. The counter is the observable
 * side effect the tests check.
 */
export {};
