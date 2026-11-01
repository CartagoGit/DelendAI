/**
 * log-tail-page.helper.ts — a tail page from any log store, with how many
 * day-files it took when the store can say.
 */
import type { ILogTailPage } from '../contracts/interfaces/log-store.interface';
import type { ILogStore, ILogTailOptions } from './log-store';
import type { ILogEvent } from './normalize-event';

/** The store's tail page, or its plain tail for a store that does not count files. */
export const tailPageOf = async (
	store: ILogStore,
	options: ILogTailOptions,
): Promise<
	Pick<ILogTailPage<ILogEvent>, 'events'> &
		Partial<Pick<ILogTailPage<ILogEvent>, 'filesRead' | 'filesTotal'>>
> =>
	store.tailPage !== undefined
		? store.tailPage(options)
		: { events: await store.tail(options) };

/** The file counts of a page, for the tool's answer, when there are any. */
export const filesOf = (
	page: Partial<Pick<ILogTailPage<ILogEvent>, 'filesRead' | 'filesTotal'>>,
): { readonly filesRead?: number; readonly filesTotal?: number } => ({
	...(page.filesRead === undefined ? {} : { filesRead: page.filesRead }),
	...(page.filesTotal === undefined ? {} : { filesTotal: page.filesTotal }),
});
