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

const TARGET_REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export const ERR_REPORTING_OPTION_DEPRECATED =
	'ERR_REPORTING_OPTION_DEPRECATED' as const;

const LEGACY_INTERNAL_ONLY_MESSAGE =
	'"internalOnly" is deprecated and ignored. External project data is non-reportable by construction.';

const hasLegacyInternalOnly = (
	raw: Readonly<Record<string, unknown>>,
): boolean => 'internalOnly' in raw;

export const resolveOptions = (
	raw: Readonly<Record<string, unknown>>,
	onWarning?: ErrorReportingOptionsWarningHandler,
): IErrorReportingOptions => {
	const parsed = OptionsSchema.safeParse(raw);
	const data = parsed.success ? parsed.data : {};
	const configuredRepo =
		typeof data.targetRepo === 'string' ? data.targetRepo.trim() : '';
	const safeConfiguredRepo = TARGET_REPO_PATTERN.test(configuredRepo)
		? configuredRepo
		: '';
	const configuredLabels =
		Array.isArray(data.labels) && data.labels.length > 0
			? data.labels.map((label) => label.trim()).filter((l) => l !== '')
			: [];
	if (hasLegacyInternalOnly(raw)) {
		onWarning?.({
			code: ERR_REPORTING_OPTION_DEPRECATED,
			message: LEGACY_INTERNAL_ONLY_MESSAGE,
		});
	}
	return {
		enabled: data.enabled ?? true,
		targetRepo:
			safeConfiguredRepo !== ''
				? safeConfiguredRepo
				: DEFAULT_TARGET_REPO,
		labels:
			configuredLabels.length > 0
				? configuredLabels
				: [...DEFAULT_LABELS],
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
