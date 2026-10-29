/**
 * Contract shapes for `./reconciler-incremental.service`.
 */

import type { IMarkdownReconcileInput } from './reconciler-markdown';

/** One incremental pass over the files a change actually touched. */
export interface IIncrementalReconcileInput {
	/** The active database this pass writes to. */
	readonly databasePath: string;
	/** The commit the files were read at, recorded on the run. */
	readonly sourceCommit: string;
	/** ONLY the files that changed — the point of the mode. */
	readonly files: IMarkdownReconcileInput['files'];
	readonly now?: number;
}

/**
 * What the pass did.
 *
 * `unchanged` is reported separately from `updated` on purpose: a second
 * pass over the same files must be able to prove it changed nothing,
 * and a single "applied" count cannot say that.
 */
export interface IIncrementalReconcileResult {
	readonly status: 'ok' | 'degraded';
	readonly runId: number;
	readonly proposalsCreated: number;
	readonly proposalsUpdated: number;
	readonly proposalsUnchanged: number;
	readonly plansCreated: number;
	readonly slicesCreated: number;
	readonly quarantined: number;
}
