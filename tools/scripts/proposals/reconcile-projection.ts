/**
 * reconcile-projection.ts — the second projection, refreshed by the same
 * act as the first.
 *
 * ## The divergence was structural
 *
 * There are two projections of the proposal markdown: the registry at
 * `<cacheDir>/proposals/index.json`, and the SQLite database. The reader
 * prefers SQLite and falls back to the registry whenever the two
 * disagree.
 *
 * Only one of them was ever refreshed. `sync:proposals` runs from the
 * pre-commit hook on every commit that touches a proposal and rebuilds
 * the registry; the database was refreshed only by an MCP tool nobody
 * invokes by hand. So every proposal added between one manual reconcile
 * and the next made the database staler, and the reader fell back.
 *
 * Measured on this repository, before this change:
 *
 * ```
 * stats: {"reads":1,"fallbacks":1,"last":"fallback-divergence","lastDivergence":12}
 * notices: SQLite projection diverges … serving JSON instead
 *          (x00583, x00585, x00587, x00589, x00590, x00591, x00592,
 *           x00593, x00594, x00595, x00596, x00598)
 * ```
 *
 * Twelve proposals — every one written that day. The shadow could never
 * reach parity, so the cutover it exists to justify could never happen,
 * and "prefer SQLite" was a preference that never once applied.
 *
 * One act refreshes both. The markdown is the source; the registry and
 * the database are both views of it, taken at the same moment from the
 * same tree, at the same commit.
 *
 * ## Why a failure here does not fail the commit
 *
 * The registry is written first and is correct on its own — the reader
 * falls back to it, which is exactly the behaviour this removes the NEED
 * for without removing the ability. A database that could not be
 * reconciled is a stale cache, not a lost proposal, so it is reported
 * and the commit proceeds. Failing the commit would trade a recoverable
 * staleness for an unrecoverable interruption.
 */
import { join } from 'node:path';

import { reconcileProposalsDb } from '../../../plugins/proposals/src/lib/tools/db-reconcile.tool';

export interface IProjectionRefresh {
	readonly status: 'refreshed' | 'skipped' | 'failed';
	readonly lines: readonly string[];
}

/**
 * Bring the SQLite projection up to the same markdown the registry was
 * just built from. Never throws.
 */
export const reconcileProjection = (input: {
	readonly root: string;
	/** Repository-relative proposals directory, from the path layout. */
	readonly proposalsDir: string;
	/** Injected in tests; the real reconciler by default. */
	readonly reconcile?: typeof reconcileProposalsDb;
}): IProjectionRefresh => {
	const reconcile = input.reconcile ?? reconcileProposalsDb;
	try {
		const output = reconcile({
			workspaceRoot: input.root,
			proposalsDirAbs: join(input.root, input.proposalsDir),
		});
		return {
			status: 'refreshed',
			lines: [
				`sync:proposals  sqlite projection: ${String(output.filesReconciled)} of ${String(output.filesScanned)} file(s) at ${output.sourceCommit.slice(0, 9)}`,
				...(output.excluded.length === 0
					? []
					: [
							`                ${String(output.excluded.length)} excluded: ${output.excluded
								.slice(0, 3)
								.map((entry) => entry.path)
								.join(
									', ',
								)}${output.excluded.length > 3 ? ' …' : ''}`,
						]),
			],
		};
	} catch (error) {
		return {
			status: 'failed',
			lines: [
				`sync:proposals  the sqlite projection was NOT refreshed: ${error instanceof Error ? error.message : String(error)}`,
				'                The registry is written and correct; the reader falls back to it.',
				'                Fix with: bun run sync:proposals',
			],
		};
	}
};
