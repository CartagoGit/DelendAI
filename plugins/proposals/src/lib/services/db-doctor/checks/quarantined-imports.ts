import type { IDoctorCheck, IDoctorCheckContext } from '../../db-doctor';
import { checkCount } from '../../db-doctor';

export const checkQuarantinedImports = ({
	db,
}: IDoctorCheckContext): IDoctorCheck => {
	const count =
		db
			.query<{ count: number }, []>(
				"SELECT COUNT(*) AS count FROM quarantine WHERE status = 'pending'",
			)
			.get()?.count ?? 0;
	return checkCount(
		'quarantined_imports',
		count,
		`${count} pending quarantined imports detected.`,
	);
};
