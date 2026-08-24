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
	DEFAULT_LABELS,
	DEFAULT_TARGET_REPO,
	DEFAULT_DEDUPE_WINDOW_HOURS,
	resolveOptions,
} from '../lib/contracts/constants/options.constant';
export type { IErrorReportingOptions } from '../lib/contracts/interfaces/options.interface';

export {
	classificationOf,
	buildIssueBody,
	buildIssueTitle,
	isMcpVertexInternal,
	safeFailureClassOf,
	signatureOf,
} from '../lib/signature.helper';
export type { ISafeFingerprintInput } from '../lib/contracts/interfaces/signature.interface';

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
export type {
	IEnvironmentClass,
	IIssueExec,
	IIssueExecResult,
	ISafeMcpVertexReport,
	ISafeReporter,
	ISafeReporterConfig,
	ISafeSyntheticExample,
	IssueClassification,
	SafeFailureClass,
	SafeScalar,
	ISubmitIssueOutcome,
} from '../lib/contracts/interfaces/reporter.interface';
export {
	ISSUE_CLASSIFICATIONS,
	McpVertexInternalError,
	SAFE_FAILURE_CLASSES,
	isSafeScalar,
} from '../lib/contracts/interfaces/reporter.interface';
export type { ISafeMcpFrame } from '../lib/contracts/interfaces/safe-frame.interface';

export { createReportStore } from '../lib/report-store.service';
export type {
	IReportRecord,
	IReportRecordInput,
	IReportStore,
} from '../lib/contracts/interfaces/report-store.interface';
