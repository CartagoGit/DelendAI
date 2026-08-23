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
} from '../lib/options';
export type { IErrorReportingOptions } from '../lib/options';

export {
	isMcpVertexInternal,
	normalizeMessage,
	messageOf,
	stackOf,
	signatureOf,
	buildIssueTitle,
	buildIssueBody,
} from '../lib/signature';
export type { IBuildIssueBodyInput } from '../lib/signature';

export { shouldReport, submitIssue, ghIssueExec } from '../lib/reporter';
export type {
	IIssueExec,
	IIssueExecResult,
	ISubmitIssueInput,
	ISubmitIssueOutcome,
} from '../lib/reporter';

export { createReportStore } from '../lib/report-store';
export type {
	IReportRecord,
	IReportRecordInput,
	IReportStore,
} from '../lib/report-store';
