/**
 * logs-knowledge.ts — f00153 S4.
 *
 * The knowledge body the `logs` plugin publishes to the host
 * catalog. Extracted from `index.ts` so it can be re-used (e.g. by
 * docs sites) and so the body itself is unit-testable. The body
 * documents the new `severity` taxonomy, the `incidentType` field,
 * the three new tools (`log` / `search` / `incidents`) and a worked
 * "find recurring incidents" recipe.
 */

export interface ILogKnowledgeOptions {
	readonly prefix: string;
}

export const buildOperationalEventLogKnowledge = (
	options: ILogKnowledgeOptions,
): string => {
	const p = options.prefix;
	return [
		'# Operational event log',
		'',
		'The logs plugin persists redacted JSONL events under `.cache/delendai/results/logs/` (every event) and ALSO under `.cache/delendai/results/logs-errors/` (only events whose outcome is not `ok`/`idle` — failed, timed-out, dead, cancelled or unknown).',
		'',
		'## Fields on every event',
		'',
		'- `ts` (ISO 8601), `kind` (lifecycle hook: `tool-started` / `tool-failed` / …).',
		'- `outcome` (`ok` / `failed` / `timed-out` / `cancelled` / `dead` / `idle` / `unknown`) — drives which stream the event lands in.',
		'- `severity` (syslog 8-level: `debug` / `info` / `notice` / `warning` / `error` / `critical` / `alert` / `emergency`) — operator-facing alarm level, default `severityForOutcome(outcome)`. `error`+ means "wake someone up".',
		'- `incidentType` (lower-case slug, e.g. `tool-failure`, `state-inconsistency`, `lock-conflict`, `secret-detected`) — the operator-facing code for WHAT BROKE. Defaults to `KIND_TO_INCIDENT_TYPE[kind]`. Lets a peer agent group recurring bugs by code, not by free-text.',
		'- `agent` / `files` (top-level, not buried in `meta`) — filterable by `query` / `tail` / `correlate` even with `includeMeta:false`.',
		'- `callId` (in `meta`) — pairs `tool-started` with its eventual `tool-completed` / `tool-failed` even when the same tool runs concurrently.',
		'- `summary` (≤200 chars, redacted) and the full `meta` (args / result / error / stack).',
		'',
		'## Tools',
		'',
		'- `' +
			p +
			'_query` — filter by `since` / `until` / `kind` / `agent` / `taskId` / `outcome` / `severity` (>=, inclusive) / `incidentType`, cursor pagination.',
		'- `' +
			p +
			'_tail` / `' +
			p +
			'_errors_tail` — newest N, optionally filtered. `errors_tail` reads the curated error stream only and includes `meta` by default (the fast path for "where do I look for bugs").',
		'- `' +
			p +
			'_correlate` — chronological chain for one `taskId` or `agent` with gap detection.',
		'- `' +
			p +
			'_subscribe` — SSE-friendly projection of the recent error events.',
		'- `' +
			p +
			'_log` — write-side: any peer plugin / agent records a structured incident. `severity` (defaults to `warning`), `incidentType` (must match `^[a-z][a-z0-9-]{0,63}$`), `message` (required), `files?`, `agent?`, `context?`. Lands in the main timeline (and the error stream when `severity` is `error` or above).',
		'- `' +
			p +
			'_search` — full-text or regex search across `summary` / `error.message`+`error.stack` / `args` / `result` / `all`. Use this when `query` cannot express what you want (substring inside an error message, regex over a stack, etc.).',
		'- `' +
			p +
			'_incidents` — auto-detector: clusters failing events by `(toolName, hash(error.message))` and returns one record per cluster with `count`, `distinctAgents`, `firstSeen`, `lastSeen`, `sampleSummary`, `sampleError` and the last `recentEvents[]`. **Start here when an agent asks "what is broken right now?"** — it returns the same bug many times, ONCE.',
		'- `' +
			p +
			'_redact_test` — audit the redactor against a sample payload.',
		'',
		'## Cross-plugin helper',
		'',
		'Other plugins can emit structured incidents through `ctx.logs.log({ severity, incidentType, message, files?, agent?, context? })`. The helper is the same writer `' +
			p +
			'_log` uses, so an entry is queryable by `query` / `search` / `incidents`. The helper is conditional on the `logs` plugin being loaded; null-check before calling (`ctx.logs?.log(...)`).',
		'',
		'## Authoring',
		'',
		'For third-party plugin authors: see `docs/delendai/plugins/logs/AUTHORING.md` for the full `withIncidentLogging` recipe, the `IPluginLogInput` / `IPluginLogsHelper` types, the `incidentLoggingDisabled` opt-out, and the `--strict-logs` host flag.',
		'',
		'## Recipe — "what is broken right now?"',
		'',
		'1. Call `' +
			p +
			'_incidents { minCount: 2 }` for the recurring cluster view.',
		'2. For a top cluster, take the `sampleError` and pass it to `' +
			p +
			'_search { pattern: <sampleError>, isRegex: true, scope: "error" }` to see every occurrence with full context.',
		'3. Use `' +
			p +
			'_correlate { taskId: <toolName> }` to see what happened before/after the first occurrence.',
		'4. For an ad-hoc diagnostic, call `' +
			p +
			'_log { severity: "critical", incidentType: "lock-conflict", message: "...", context: { ... } }` so a future `' +
			p +
			'_search` can find it.',
		'',
		'## Retention',
		'',
		'Both streams are day-rotated JSONL, each retained independently to the newest `retentionCount` files (default 10, oldest dropped first) — history from earlier sessions survives as long as it fits that window. A `server-started` event marks each host boot (pid + workspace).',
	].join('\n');
};
