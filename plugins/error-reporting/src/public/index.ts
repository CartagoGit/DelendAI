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
	resolveOptions,
} from '../lib/options.constant';
export type { IErrorReportingOptions } from '../lib/options.constant';

export {
	isMcpVertexInternal,
	normalizeMessage,
	messageOf,
	stackOf,
	signatureOf,
	buildIssueTitle,
	buildIssueBody,
} from '../lib/signature.helper';
export type { IBuildIssueBodyInput } from '../lib/signature.helper';

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
} from '../lib/reporter.service';

export { createReportStore } from '../lib/report-store.service';
export type {
	IReportRecord,
	IReportRecordInput,
	IReportStore,
} from '../lib/report-store.service';
