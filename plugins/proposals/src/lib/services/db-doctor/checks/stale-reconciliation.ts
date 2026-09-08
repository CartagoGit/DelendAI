import type { IDoctorCheck, IDoctorCheckContext } from '../../db-doctor';
import { checkCount } from '../../db-doctor';

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
		WHERE status = 'ok' AND (completed_at IS NULL OR completed_at < ? - 86400000)`)
			.get(now)?.count ?? 0;
	return checkCount(
		'stale_reconciliation',
		count,
		`${count} stale reconciliation runs detected.`,
	);
};
