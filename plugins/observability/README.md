# @delendai/observability

Read-only observability for [`@delendai/core`](../../packages/core): recent
remote error issues plus deterministic correlation against local agent logs.

## Tools

- **`obs_errors`** — lists recent Sentry or Datadog issues. Credentials come
  only from `SENTRY_AUTH_TOKEN` or `DATADOG_API_KEY`; they are never emitted
  in tool output or log records. Without a configured source the tool returns
  an actionable setup hint.
- **Trace and release-health tools** — summarize local trace records and
  release crash-free rates when the traces capability is enabled.
- **`obs_correlate`** — reads recent remote issues from the same source that
  powers `obs_errors`, then scans local JSONL runtime logs under
  `.cache/delendai/results/logs/` and
  `.cache/delendai/results/logs-errors/` for lines that mention the same
  exception title or context.

## Local correlation

`lib/correlate` is a pure, bounded adapter for a local log window returned by
the logs capability. It reuses a time window around each issue, then applies
the stricter S3 substring match on the issue title or context so unrelated
events in the same window are not reported as matches.

Flow, in prose:

- remote issue: `TypeError: Cannot read properties of undefined`
- local line: `tool-failed: TypeError Cannot read properties of undefined`
- result: one correlation match pointing at the local JSONL file and line
  number

Sample output:

```json
{
	"matches": [
		{
			"issueId": "issue-1",
			"logFile": ".cache/delendai/results/logs/2026-07-25.jsonl",
			"line": 7,
			"summary": "TypeError matched local log .cache/delendai/results/logs/2026-07-25.jsonl:7 — {\"ts\":\"2026-07-25T11:58:00.000Z\",\"summary\":\"tool-failed: TypeError Cannot read properties of undefined\"}"
		}
	],
	"totalIssues": 1,
	"totalLogs": 14,
	"summary": "Correlated 1 match(es) across 1 remote issue(s), 14 local log line(s) in the last 1440 minute(s)."
}
```

This keeps the remote vendor view and the local execution history in the same
troubleshooting loop without requiring a vendor SDK or any write scope.

## Load

```bash
delendai --plugins=observability
```

## Security

The plugin is read-only. It uses no vendor SDK, does not persist credentials,
and never exposes write actions such as resolving issues or muting alerts.

## License

BSD-3-Clause © Cartago
