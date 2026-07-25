# @mcp-vertex/prompt-eval

Benchmark a prompt or task across the providers discovered by auto-agent-selector, score the outcomes on cost x quality, and write the measured evidence back into auto-agent-selector's calibration store.

## Tools

- eval_run: run an explicitly approved prompt across the configured provider roster.
- eval_report: score a flat list of eval attempts and render a ranked report.
- eval_calibrate: persist non-skipped eval attempts into the shared auto-agent-selector calibration log and return provider win-rates.

## Calibration write-through

This plugin does not keep a parallel benchmark database. eval_calibrate appends outcome records to the same calibration.jsonl store that auto-agent-selector reads from under .cache/mcp-vertex/results/auto-agent-selector, then computes the public win-rate summary from that store.

Each persisted record matches auto-agent-selector's S4 outcome contract:

```json
{
  "providerId": "provider-id",
  "success": true,
  "taskType": "implement",
  "ts": "2026-07-25T12:00:00.000Z"
}
```

The returned summary matches the routing calibration shape:

```json
{
  "providerId": "provider-id",
  "winRate": 0.75,
  "samples": 4
}
```

## Usage

1. Run eval_run with explicit consent to gather attempts.
2. Feed those attempts into eval_report for ranking.
3. Feed the same attempts into eval_calibrate to update routing evidence.
