/** Contracts for the read-only registry snapshot (`scanProposalRegistry`). */
import type { IProposalRegistrySyncResult } from '../../proposals/sync-proposal-registry';

/**
 * The registry index as written to `index.json`: what a sync reports,
 * without what only the act of syncing produces (whether it changed, where
 * it was written, the quarantine it recorded, the SQLite projection).
 */
export type IProposalRegistryIndex = Omit<
	IProposalRegistrySyncResult,
	'quarantine' | 'changed' | 'indexPath' | 'projection'
> & {
	readonly semantic_hash: string;
};
