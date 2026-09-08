import type { IDoctorCheck, IDoctorCheckContext } from '../../db-doctor';
import { checkCount } from '../../db-doctor';

export const checkMissingRelations = ({ db }: IDoctorCheckContext): IDoctorCheck => {
	const count = db.query<{ count: number }, []>(`SELECT COUNT(*) AS count FROM lifecycle_events e
		LEFT JOIN proposals p ON e.entity_type = 'proposal' AND e.entity_uid = p.uid
		LEFT JOIN plans pl ON e.entity_type = 'plan' AND e.entity_uid = pl.uid
		LEFT JOIN slices s ON e.entity_type = 'slice' AND e.entity_uid = s.uid
		WHERE p.uid IS NULL AND pl.uid IS NULL AND s.uid IS NULL`).get()?.count ?? 0;
	return checkCount('missing_relations', count, `${count} lifecycle events reference missing entities.`);
};
