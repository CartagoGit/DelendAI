import type { IDoctorCheck, IDoctorCheckContext } from '../../db-doctor';
import { checkCount } from '../../db-doctor';

export const checkOrphans = ({ db }: IDoctorCheckContext): IDoctorCheck => {
	const count = db.query<{ count: number }, []>(`SELECT
		(SELECT COUNT(*) FROM plans p LEFT JOIN proposals pr ON pr.id = p.proposal_id WHERE pr.id IS NULL) +
		(SELECT COUNT(*) FROM slices s LEFT JOIN plans p ON p.id = s.plan_id WHERE p.id IS NULL) AS count`).get()?.count ?? 0;
	return checkCount('orphans', count, `${count} orphaned plan or slice rows detected.`);
};
