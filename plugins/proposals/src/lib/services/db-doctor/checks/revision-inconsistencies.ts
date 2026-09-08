import type { IDoctorCheck, IDoctorCheckContext } from '../../db-doctor';
import { checkCount } from '../../db-doctor';

export const checkRevisionInconsistencies = ({ db }: IDoctorCheckContext): IDoctorCheck => {
	const count = db.query<{ count: number }, []>(`SELECT COUNT(*) AS count FROM lifecycle_events e
		LEFT JOIN proposals p ON e.entity_type = 'proposal' AND e.entity_uid = p.uid
		LEFT JOIN plans pl ON e.entity_type = 'plan' AND e.entity_uid = pl.uid
		LEFT JOIN slices s ON e.entity_type = 'slice' AND e.entity_uid = s.uid
		WHERE (e.entity_type = 'proposal' AND p.revision < e.entity_revision)
		   OR (e.entity_type = 'plan' AND pl.revision < e.entity_revision)
		   OR (e.entity_type = 'slice' AND s.revision < e.entity_revision)`).get()?.count ?? 0;
	return checkCount('revision_inconsistencies', count, `${count} lifecycle revision inconsistencies detected.`);
};
