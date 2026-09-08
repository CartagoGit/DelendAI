import type { IDoctorCheck, IDoctorCheckContext } from '../../db-doctor';
import { checkCount } from '../../db-doctor';

/** A receipt or run older than this is stale enough to report. */
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export const checkStaleReconciliation = ({
	db,
	now,
}: IDoctorCheckContext): IDoctorCheck => {
	const count =
		db
			.query<
				{ count: number },
				[number]
			>(`SELECT COUNT(*) AS count FROM reconciliation_runs
		WHERE status = 'ok' AND (completed_at IS NULL OR completed_at < ? - ${String(ONE_DAY_MS)})`)
			.get(now)?.count ?? 0;
	return checkCount(
		'stale_reconciliation',
		count,
		`${count} stale reconciliation runs detected.`,
	);
};
