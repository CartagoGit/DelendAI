/**
 * index-reader-parity-report.ts — what a SQL read says about the JSON
 * registry beside it: in parity, divergent, or too old to compare.
 */
import type { IProposalIndexEntry } from './index-reader';
import { recordProposalIndexRead } from './index-read-stats';
import { noticeOnce } from './index-reader-notice';
import { compareIndexEntries } from './index-source-policy';

/** Whether the registry was generated before the projection reconciled. */
const registryOlderThan = (
	registry: { readonly generated_at?: unknown },
	reconciledAt: number | null,
): boolean => {
	if (reconciledAt === null) return false;
	const generated =
		typeof registry.generated_at === 'string'
			? Date.parse(registry.generated_at)
			: Number.NaN;
	return !Number.isNaN(generated) && generated < reconciledAt;
};

/**
 * Count the read and, when the registry disagrees, say so once. No
 * registry on disk is nothing to compare, not a difference on every id:
 * a fresh worktree has none. An export written before the projection's
 * last reconcile describes an older tree: it differs because it is old,
 * not because the two disagree — the registry is written only by a full
 * sync while the projection reconciles on its own, so in a shared
 * checkout it went stale within hours and every boot reported divergence.
 */
export const reportRegistryParity = (input: {
	readonly entries: readonly IProposalIndexEntry[];
	readonly registry: {
		readonly generated_at?: unknown;
		readonly proposals?: readonly IProposalIndexEntry[];
	} | null;
	readonly reconciledAt: number | null;
	readonly indexPathAbs: string;
	readonly rebuilt: boolean;
	readonly log: (message: string) => void;
}): void => {
	const { registry } = input;
	const stale =
		registry !== null && registryOlderThan(registry, input.reconciledAt);
	const divergence =
		registry === null || stale
			? []
			: compareIndexEntries(input.entries, registry.proposals ?? []);
	recordProposalIndexRead(
		stale
			? 'sql-registry-stale'
			: divergence.length > 0
				? 'sql-divergence-reported'
				: 'sql-parity',
		divergence.length,
		input.rebuilt,
	);
	if (divergence.length > 0)
		noticeOnce(
			`sql-strict-divergence:${input.indexPathAbs}`,
			`proposal index: serving the SQLite projection (source pinned to "sql"); ${input.indexPathAbs} differs on ${divergence.join(', ')}`,
			input.log,
		);
};
