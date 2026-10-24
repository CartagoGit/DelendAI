/**
 * proposal-filter-store.ts — f00097 S2.
 *
 * A `globalState`-backed implementation of `IProposalFilterStore` so the
 * proposals board's status / text filters survive a window reload. Kept out of
 * the provider itself so the provider stays free of any host (`vscode`)
 * coupling and remains unit-testable with a plain in-memory store.
 */
import type {
	IProposalFilterStore,
	IProposalFilters,
} from '../providers/proposal-board-provider';

/** Minimal subset of `vscode.Memento` we depend on. */
export interface IMemento {
	get<T>(key: string): T | undefined;
	update(key: string, value: unknown): Thenable<void>;
}

const STATUS_KEY = 'delendai.proposals.filters.status';
const TEXT_KEY = 'delendai.proposals.filters.text';

export const createProposalFilterStore = (
	memento: IMemento,
): IProposalFilterStore => ({
	read: (): IProposalFilters => {
		const status = memento.get<string>(STATUS_KEY);
		const text = memento.get<string>(TEXT_KEY);
		return {
			...(status === undefined ? {} : { status }),
			...(text === undefined ? {} : { text }),
		};
	},
	write: (filters: IProposalFilters): void => {
		void memento.update(STATUS_KEY, filters.status);
		void memento.update(TEXT_KEY, filters.text);
	},
});
