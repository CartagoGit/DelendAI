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
	isMcpVertexInternal,
	normalizeMessage,
	messageOf,
	stackOf,
	signatureOf,
	buildIssueTitle,
	buildIssueBody,
} from '../lib/signature.helper';
export type { IBuildIssueBodyInput } from '../lib/contracts/interfaces/signature.interface';

export {
	shouldReport,
	submitIssue,
	ghIssueExec,
} from '../lib/reporter.service';
export type {
	IIssueExec,
	IIssueExecResult,
	ISubmitIssueInput,
	ISubmitIssueOutcome,
} from '../lib/contracts/interfaces/reporter.interface';

export { createReportStore } from '../lib/report-store.service';
export type {
	IReportRecord,
	IReportRecordInput,
	IReportStore,
} from '../lib/contracts/interfaces/report-store.interface';
