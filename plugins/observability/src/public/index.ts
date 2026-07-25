/**
 * f00129 — public surface for the observability plugin.
 *
 * Re-exports the S1 error/issue contracts and parsers so plugin
 * authors can build alternative sources (e.g. a self-hosted
 * GlitchTip/Sentry-compatible API) without forking the contracts.
 */
export type {
	IErrorSource,
	IFetchLike,
	IObsIssue,
	IListErrorsInput,
	IListErrorsOutput,
} from '../lib/errors/ierror-source';
export {
	authHeaderFor,
	dispatchFetch,
	redactToken,
} from '../lib/errors/ierror-source';
export {
	listRecentErrors,
	normalizeLevel,
	sentryBuildListUrl,
	sentryParseList,
} from '../lib/errors/list-errors';
export { buildObsErrorsToolRegistration } from '../lib/tools/obs-errors.tool';
export type { IObsErrorsToolOptions } from '../lib/tools/obs-errors.tool';
