/** Contract shapes for `./session-handover.service`. */

import type { StateScope } from '@delendai/state';

/** What a session needs again after its context is compacted or lost. */
export type IHandoverSection =
	| 'invariants'
	| 'decisions'
	| 'units'
	| 'pending'
	| 'done'
	| 'branches'
	| 'commits'
	| 'pullRequests'
	| 'evidence'
	| 'tests'
	| 'errors'
	| 'blockers';

/** One fact, as its own store holds it: a short line and where to read the rest. */
export interface IHandoverEntry {
	readonly id: string;
	readonly summary: string;
	/** Where the full record lives (a path, a ref, a proposal id). */
	readonly source: string;
}

/** The handover: every section, rebuilt from the stores that own it. */
export interface ISessionHandover {
	readonly sessionId: string;
	readonly builtAt: number;
	readonly sections: Readonly<
		Record<IHandoverSection, readonly IHandoverEntry[]>
	>;
	/** Sections no store could answer; never filled in by guessing. */
	readonly missing: readonly IHandoverSection[];
}

/** One reader per section; absent or throwing means the section is missing. */
export type ISessionHandoverSources = Partial<
	Record<IHandoverSection, () => Promise<readonly IHandoverEntry[]>>
>;

export interface IBuildSessionHandoverInput {
	readonly sessionId: string;
	readonly sources: ISessionHandoverSources;
	/** Milliseconds since the epoch. */
	readonly now: number;
}

/** Where a handover is kept. */
export interface ISessionHandoverLocation {
	readonly scope: StateScope;
	readonly sessionId: string;
}

/** The bounded text a session is given again after compaction. */
export interface IHandoverIndex {
	readonly sessionId: string;
	readonly builtAt: number;
	readonly counts: Readonly<Record<IHandoverSection, number>>;
	/** The first entries of each section, summaries cut short. */
	readonly entries: Readonly<
		Record<IHandoverSection, readonly IHandoverEntry[]>
	>;
	readonly missing: readonly IHandoverSection[];
}
