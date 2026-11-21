import type { IProposalIndexSource } from '../../../contracts/interfaces/proposal-index-source.interface';
import type { IProposalIndexReadStats } from '../../../contracts/interfaces/proposal-index-read-stats.interface';
import { parityStatusOf } from '../../../proposals/index-read-stats';
import type { IDoctorCheck } from '../../db-doctor';

/**
 * Reports which source the proposal index is configured to read, the
 * canonical database path, how often this process fell back to JSON, and
 * the last observed parity.
 *
 * It needs no open database, so the doctor reports it even when the
 * database is missing. A fallback or a divergence is a warning: the
 * server served something other than the projection it was set up to
 * trust.
 */
export const buildStorageModeCheck = (input: {
	readonly mode: IProposalIndexSource;
	readonly databasePath: string;
	readonly stats: IProposalIndexReadStats;
}): IDoctorCheck => {
	const { mode, databasePath, stats } = input;
	const parity = parityStatusOf(stats.last);
	const divergence =
		parity === 'divergent' ? ` (${stats.lastDivergence} id(s) differ)` : '';
	const message = `mode=${mode}; canonical path=${databasePath}; fallbacks=${stats.fallbacks} of ${stats.reads} read(s); parity=${parity}${divergence}.`;
	return {
		name: 'storage_mode',
		severity:
			stats.fallbacks > 0 || parity === 'divergent' ? 'warning' : 'ok',
		message,
	};
};
