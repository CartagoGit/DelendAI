import type { IDoctorCheck, IDoctorCheckContext } from '../../db-doctor';
import { checkCount } from '../../db-doctor';

/** A receipt or run older than this is stale enough to report. */
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Stale when the latest successful reconciliation is more than a day old.
 * Every old run used to count, so the warning never cleared: a fresh run
 * left the earlier ones in the history, still older than a day.
 */
export const checkStaleReconciliation = ({
	db,
	now,
}: IDoctorCheckContext): IDoctorCheck => {
	const latest = db
		.query<{ latest: number | null; runs: number }, []>(
			`SELECT MAX(completed_at) AS latest, COUNT(*) AS runs
			 FROM reconciliation_runs WHERE status = 'ok'`,
		)
		.get();
	const stale =
		latest !== null &&
		latest.runs > 0 &&
		(latest.latest === null || latest.latest < now - ONE_DAY_MS);
	const count = stale ? 1 : 0;
	return checkCount(
		'stale_reconciliation',
		count,
		`the latest successful reconciliation is more than a day old.`,
	);
};
