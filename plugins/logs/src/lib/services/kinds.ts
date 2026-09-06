/**
 * kinds.ts — f00153 S1.
 *
 * `severity` (syslog RFC 5424 8-level taxonomy, §6.2.1) and `incidentType` (the
 * type of incident an event represents). Both fields ride on every
 * `ILogEvent` so any read tool (query / tail / errors_tail / correlate
 * / search / incidents) can filter by them without a separate index.
 *
 * The syslog severity scale runs 0-7 (8 levels total): emergency, alert,
 * critical, error, warning, notice, informational, debug. We expose them
 * alphabetically in `LOG_SEVERITIES` for stable sort; the numeric
 * ranking in `SEVERITY_RANK` is the operator-facing order.
 *
 * `KIND_TO_INCIDENT_TYPE` maps the lifecycle `kind` (the hook that
 * emitted the event) to a stable, lower-case `^[a-z][a-z0-9-]{0,63}$`
 * code that an agent can group by. The codes are intentionally
 * operator-facing: they describe WHAT BROKE, not the hook that caught
 * it. `logs_log` lets a caller override the default and pin an
 * arbitrary code.
 *
 * `severityForOutcome` provides the default severity from `outcome`
 * when the caller does not specify one. The two maps are independent —
 * `outcome` is the lifecycle state (`ok`, `failed`, …), `severity` is
 * the operator-facing alarm level. A `cancelled` event is `notice`
 * (benign — user interrupt); a `dead` event is `critical` (the agent
 * is gone).
 */

import { LOG_OUTCOMES, type LogOutcome } from './normalize-event';

export const LOG_SEVERITIES = [
	'debug',
	'info',
	'notice',
	'warning',
	'error',
	'critical',
	'alert',
	'emergency',
] as const;

export type LogSeverity = (typeof LOG_SEVERITIES)[number];

export const isLogSeverity = (value: unknown): value is LogSeverity =>
	typeof value === 'string' &&
	(LOG_SEVERITIES as readonly string[]).includes(value);

/**
 * Default severity per outcome. Pure, deterministic, exhaustive over
 * {@link LOG_OUTCOMES} — the type-level union guarantees every
 * outcome is mapped, so a future `LogOutcome` addition will not
 * silently fall through to `unknown`.
 */
const SEVERITY_FOR_OUTCOME: Readonly<Record<LogOutcome, LogSeverity>> = {
	ok: 'info',
	idle: 'info',
	failed: 'error',
	'timed-out': 'error',
	cancelled: 'notice',
	dead: 'critical',
	unknown: 'warning',
};

export const severityForOutcome = (outcome: LogOutcome): LogSeverity =>
	SEVERITY_FOR_OUTCOME[outcome];

/**
 * Numeric ranking per syslog severity (RFC 5424 §6.2.1: 0=emerg .. 7=debug).
 * Exposed so the read-side filters (`severityAtLeast`) can compare
 * without a hand-rolled switch, and so x00153 S7's spec can assert the
 * operator-facing order without re-listing the levels.
 */
export const SEVERITY_RANK: Readonly<Record<LogSeverity, number>> = {
	emergency: 0,
	alert: 1,
	critical: 2,
	error: 3,
	warning: 4,
	notice: 5,
	info: 6,
	debug: 7,
};

/**
 * Default incident-type per lifecycle kind. Stable, lower-case,
 * hyphen-separated. The grep is on `toolName`, not `incidentType`, so
 * the two coexist.
 */
export const KIND_TO_INCIDENT_TYPE = {
	'server-started': 'server-boot',
	'tool-started': 'tool-invocation',
	'tool-completed': 'tool-invocation',
	'tool-failed': 'tool-failure',
	'tool-timed-out': 'tool-timeout',
	'tool-cancelled': 'tool-cancellation',
	'agent-alive': 'agent-heartbeat',
	'agent-idle': 'agent-heartbeat',
	'agent-dead': 'agent-death',
	'lock-claimed': 'lock-acquisition',
	'lock-released': 'lock-release',
	'quality-run-started': 'quality-run',
	'quality-run-finished': 'quality-run',
	'quality-run-cancelled': 'quality-run',
	'slice-submitted': 'slice-review',
	'slice-approved': 'slice-review',
	'slice-request-changes': 'slice-review',
	'proposal-stale-detected': 'proposal-staleness',
	'state-repaired': 'state-repair',
	'state-inconsistency-detected': 'state-inconsistency',
	'log-warning': 'log-warning',
	// c00512: the canonical kind for peer-emitted incidents (errors
	// captured by `IErrorSink` and routed via `error-sink-adapter`).
	// The incident type stays under `peer-error` so consumers can
	// group peer-detected failures by their source domain via the
	// `incidentType` discriminator, not the kind.
	'incident-error': 'peer-error',
} as const;

export type IncidentType =
	(typeof KIND_TO_INCIDENT_TYPE)[keyof typeof KIND_TO_INCIDENT_TYPE];

export const incidentTypeForKind = (kind: string): string | null => {
	if (kind in KIND_TO_INCIDENT_TYPE) {
		return KIND_TO_INCIDENT_TYPE[
			kind as keyof typeof KIND_TO_INCIDENT_TYPE
		];
	}
	return null;
};

/**
 * Validate an arbitrary `incidentType` slug against the project
 * convention: `^[a-z][a-z0-9-]{0,63}$`. Used by `logs_log` to refuse
 * upstream callers that invent free-text codes. The map above
 * already matches this regex, but logs_log also accepts ad-hoc codes
 * — they must obey the same shape.
 */
export const INCIDENT_TYPE_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;

export const isValidIncidentType = (value: string): boolean =>
	INCIDENT_TYPE_PATTERN.test(value);
