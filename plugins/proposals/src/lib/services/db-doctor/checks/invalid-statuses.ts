import type { IDoctorCheck, IDoctorCheckContext } from '../../db-doctor';
import { checkCount } from '../../db-doctor';

export const checkInvalidStatuses = ({ db }: IDoctorCheckContext): IDoctorCheck => {
	const count = db.query<{ count: number }, []>(`SELECT COUNT(*) AS count FROM (
		SELECT id FROM proposals WHERE status NOT IN ('draft','ready','in-progress','review','blocked','paused','done','retired','superseded','quarantined')
		UNION ALL SELECT id FROM plans WHERE status NOT IN ('draft','ready','in-progress','review','blocked','paused','done','retired','superseded','quarantined')
		UNION ALL SELECT id FROM slices WHERE status NOT IN ('draft','ready','in-progress','review','blocked','paused','done','retired','superseded','quarantined')
	)`).get()?.count ?? 0;
	return checkCount('invalid_statuses', count, `${count} invalid statuses detected.`);
};
