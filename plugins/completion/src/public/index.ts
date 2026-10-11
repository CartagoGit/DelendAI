/**
 * Public surface of `@delendai/completion`.
 *
 * Re-exports the plugin plus the pure store/record types so other
 * plugins and the web site can read completion records without
 * importing `src/index.ts` (which has side effects through
 * `definePlugin`).
 */

export { default } from '../index';

export {
	createCompletionStore,
	recordFileName,
	recordPath,
} from '../lib/completion-store.service';
export type {
	ICompletionRecord,
	ICompletionStore,
} from '../lib/completion-store.service';

export type { ICompletionToolOptions } from '../lib/tools/completion-tools';
export {
	buildClearRegistration,
	buildReportCompleteRegistration,
	buildStatusRegistration,
} from '../lib/tools/completion-tools';
