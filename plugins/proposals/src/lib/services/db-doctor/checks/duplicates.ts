import type { IDoctorCheck, IDoctorCheckContext } from '../../db-doctor';
import { checkCount } from '../../db-doctor';

export const checkDuplicateNaturalIds = ({
	db,
}: IDoctorCheckContext): IDoctorCheck => {
	const count =
		db
			.query<{ count: number }, []>(`SELECT COUNT(*) AS count FROM (
		SELECT uid FROM proposals GROUP BY uid HAVING COUNT(*) > 1
		UNION ALL SELECT uid FROM plans GROUP BY uid HAVING COUNT(*) > 1
		UNION ALL SELECT uid FROM slices GROUP BY uid HAVING COUNT(*) > 1
	)`)
			.get()?.count ?? 0;
	return checkCount(
		'duplicate_natural_ids',
		count,
		`${count} duplicate natural IDs detected.`,
	);
};
