/**
 * Public surface of `@mcp-vertex/error-reporting`. The default export
 * (in `../index.ts`) is the loadable `IMcpPlugin`; this barrel exposes
 * only the pure data contracts and helpers so other packages can build
 * on the same shapes without importing the plugin entry (which has
 * side effects through `definePlugin`).
 */
export { default } from '../index';

export {
	OptionsSchema,
	DEFAULT_BACKOFF_BASE_MS,
	DEFAULT_BACKOFF_JITTER_RATIO,
	DEFAULT_BACKOFF_MAX_MS,
	DEFAULT_CIRCUIT_BREAKER_THRESHOLD,
	DEFAULT_LABELS,
	DEFAULT_MAX_ISSUES_PER_DAY,
	DEFAULT_TARGET_REPO,
	DEFAULT_DEDUPE_WINDOW_HOURS,
} from '../lib/contracts/constants/options.constant';
export type { IErrorReportingOptions } from '../lib/contracts/interfaces/options.interface';
export {
	ERR_REPORTING_OPTION_DEPRECATED,
	resolveOptions,
} from '../lib/options.service';
export { SAFE_REPORTER_FAILURE_CODES } from '../lib/contracts/constants/safe-reporter-failure-codes.constant';
export type {
	SafeReporterFailureCode,
	SafeReporterTransportFailureCode,
} from '../lib/contracts/constants/safe-reporter-failure-codes.constant';

export {
	classifyInternalError,
	classificationFromEvidence,
	classificationOf,
	buildIssueBody,
	buildIssueTitle,
	isMarkedInternalBoundary,
	isMcpVertexInternal,
	markErrorAsInternalBoundary,
	registerInternalPath,
	registerInternalRuntimePaths,
	resetInternalPathRegistry,
	safeFailureClassOf,
	signatureOf,
} from '../lib/signature.helper';
export type { ISafeFingerprintInput } from '../lib/contracts/interfaces/signature.interface';
export {
	MCP_VERTEX_ERROR_CODES,
	isMcpVertexErrorCode,
} from '../lib/contracts/constants/error-codes.constant';
export type { McpVertexErrorCode } from '../lib/contracts/constants/error-codes.constant';

export {
	extractSafeMcpFrames,
	packageIdFromSafeFrame,
} from '../lib/frame-extractor.helper';
export {
	validateSafeReport,
	validateSerializedSafeReport,
} from '../lib/privacy-validator.helper';
export type { IPrivacyValidationResult } from '../lib/contracts/interfaces/privacy-validator.interface';

export {
	createSafeReporter,
	shouldReport,
	ghIssueExec,
} from '../lib/reporter.service';
export { buildSafeReport } from '../lib/report-builder.helper';
export { createReportScheduler } from '../lib/report-scheduler.helper';
export { buildSyntheticExample } from '../lib/synthetic-example.builder';
export { buildErrorReportingKnowledge } from '../lib/knowledge/error-reporting';
export {
	SYNTHETIC_FIXTURES,
	selectSyntheticFixture,
} from '../lib/synthetic-fixtures.constant';
export type {
	IEnvironmentClass,
	IIssueExec,
	IIssueExecResult,
	ISafeMcpVertexReport,
	ISafeReporter,
	ISafeReporterConfig,
	ISafeSyntheticExample,
	IssueClassification,
	ISubmitIssueFailureOutcome,
	ISubmitIssueOutcome,
	ISubmitIssueSuccessOutcome,
	SafeFailureClass,
	SafeScalar,
} from '../lib/contracts/interfaces/reporter.interface';
export type {
	IReportFailureState,
	IReportScheduleDecision,
	IReportSchedulerClock,
} from '../lib/contracts/interfaces/report-scheduler.interface';
export {
	ISSUE_CLASSIFICATIONS,
	McpVertexInternalError,
	SAFE_FAILURE_CLASSES,
	isSafeScalar,
} from '../lib/contracts/interfaces/reporter.interface';
export type { ISafeMcpFrame } from '../lib/contracts/interfaces/safe-frame.interface';

export { createReportStore } from '../lib/report-store.service';
export type {
	IReportAttemptInput,
	IReportFailureInput,
	IReportRecord,
	IReportStore,
	IReportSuccessInput,
} from '../lib/contracts/interfaces/report-store.interface';
export type {
	IReportStatusDestination,
	IReportStatusHealth,
	IReportStatusOutput,
	IReportStatusRecentReport,
	IReportStatusToolOptions,
	IReportStatusTransmittedFieldCatalog,
} from '../lib/contracts/interfaces/report-status.interface';
export { healthOf } from '../lib/tools/report-status.tool';

// --- AUD-G01: the error-reporting funnel + self-test surface ---
export { createFunnelCounterStore } from '../lib/funnel-counter-store.service';
export type {
	IFunnelStage,
	IFunnelCounterEvent,
	IFunnelCounters,
	IFunnelCounterStore,
} from '../lib/contracts/interfaces/funnel-counters.interface';
export { FUNNEL_STAGES } from '../lib/contracts/constants/funnel-stages.constant';
export { runErrorReportingSelfTest } from '../lib/self-test.service';
export { SELF_TEST_CHECK_IDS } from '../lib/contracts/interfaces/self-test.interface';
export type {
	IRunErrorReportingSelfTestInput,
	ISelfTestCheck,
	ISelfTestResult,
	ISelfTestCheckId,
} from '../lib/contracts/interfaces/self-test.interface';
