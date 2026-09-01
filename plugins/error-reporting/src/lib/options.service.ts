import {
	DEFAULT_BACKOFF_BASE_MS,
	DEFAULT_BACKOFF_JITTER_RATIO,
	DEFAULT_BACKOFF_MAX_MS,
	DEFAULT_CIRCUIT_BREAKER_THRESHOLD,
	DEFAULT_DEDUPE_WINDOW_HOURS,
	DEFAULT_LABELS,
	DEFAULT_MAX_ISSUES_PER_DAY,
	DEFAULT_TARGET_REPO,
	OptionsSchema,
} from './contracts/constants/options.constant';
import type {
	ErrorReportingOptionsWarningHandler,
	IErrorReportingOptions,
} from './contracts/interfaces/options.interface';

export const ERR_REPORTING_OPTION_DEPRECATED =
	'ERR_REPORTING_OPTION_DEPRECATED' as const;

const LEGACY_INTERNAL_ONLY_MESSAGE =
	'"internalOnly" is deprecated and ignored. External project data is non-reportable by construction.';

const FIXED_TRANSPORT_POLICY_MESSAGE =
	'"targetRepo" and "labels" are fixed by MCP Vertex and ignored. Consumer project configuration cannot redirect or identify issues.';

const hasLegacyInternalOnly = (
	raw: Readonly<Record<string, unknown>>,
): boolean => 'internalOnly' in raw;

export const resolveOptions = (
	raw: Readonly<Record<string, unknown>>,
	onWarning?: ErrorReportingOptionsWarningHandler,
): IErrorReportingOptions => {
	const parsed = OptionsSchema.safeParse(raw);
	const data = parsed.success ? parsed.data : {};
	if (hasLegacyInternalOnly(raw)) {
		onWarning?.({
			code: ERR_REPORTING_OPTION_DEPRECATED,
			message: LEGACY_INTERNAL_ONLY_MESSAGE,
		});
	}
	if ('targetRepo' in raw || 'labels' in raw) {
		onWarning?.({
			code: ERR_REPORTING_OPTION_DEPRECATED,
			message: FIXED_TRANSPORT_POLICY_MESSAGE,
		});
	}
	return {
		enabled: data.enabled ?? false,
		// The destination and labels are MCP Vertex-owned transport policy.
		// Consumer-project configuration must never redirect or identify the
		// issue, even when legacy options are present.
		targetRepo: DEFAULT_TARGET_REPO,
		labels: [...DEFAULT_LABELS],
		dedupeWindowHours:
			data.dedupeWindowHours ?? DEFAULT_DEDUPE_WINDOW_HOURS,
		maxIssuesPerDay: data.maxIssuesPerDay ?? DEFAULT_MAX_ISSUES_PER_DAY,
		circuitBreakerThreshold:
			data.circuitBreakerThreshold ?? DEFAULT_CIRCUIT_BREAKER_THRESHOLD,
		backoffBaseMs: data.backoffBaseMs ?? DEFAULT_BACKOFF_BASE_MS,
		backoffMaxMs: data.backoffMaxMs ?? DEFAULT_BACKOFF_MAX_MS,
		backoffJitterRatio:
			data.backoffJitterRatio ?? DEFAULT_BACKOFF_JITTER_RATIO,
	};
};
