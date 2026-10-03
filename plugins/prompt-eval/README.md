# @delendai/prompt-eval

Benchmark a prompt across the reachable provider roster and feed the measured
winner data back into routing calibration.

## Tools

- `eval_run`: run an explicitly approved prompt across the configured provider
  roster, spend-guarded per provider.
- `eval_report`: score a flat list of eval attempts and render a ranked report
  (pure, no I/O).

There is no separate `eval_calibrate` tool — calibration write-through happens
automatically inside `eval_run` when a `calibrationStore` is injected (see
below).

## Current build status

`eval_run`'s `allowSpend` / `runProvider` / `checkAcceptance` seams are not
wired to a real provider runtime in this build (no adapter onto
orchestrator-runner's spend-guard + invocation manager exists yet — that is
separate feature work, not configuration). Calling `eval_run` refuses with an
explicit diagnostic rather than silently reporting every provider as
spend-denied, which would be indistinguishable from a legitimate budget
refusal. `eval_report` is unaffected — it only scores attempts you supply.

## Calibration

When `eval_run` completes with a winner, prompt-eval writes one outcome record
per attempted provider into the auto-agent-selector calibration store. The
winning provider is recorded with `success=true`; every other attempted
provider is recorded with `success=false`. Providers skipped by the spend
guard are omitted because they never ran.

The routing blend only uses measured data after a provider has at least 5
samples for the relevant task type. Until then, ranking falls back to the
normal cost-quality heuristic.

To enable persistence in production, pass `calibrationStore` in the plugin
options. If you omit it, `eval_run` still works (once wired) and calibration
write-through is disabled.

## Usage

1. Run `eval_run` with explicit consent to gather attempts.
2. Feed those attempts into `eval_report` for ranking.
