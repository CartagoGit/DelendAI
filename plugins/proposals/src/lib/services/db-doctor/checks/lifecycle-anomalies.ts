import type { IDoctorCheck, IDoctorCheckContext } from '../../db-doctor';
import { checkCount } from '../../db-doctor';

export const checkLifecycleAnomalies = ({
	db,
}: IDoctorCheckContext): IDoctorCheck => {
	const count =
		db
			.query<
				{ count: number },
				[]
			>(`SELECT COUNT(*) AS count FROM lifecycle_events
		WHERE to_status = from_status OR entity_revision < 0`)
			.get()?.count ?? 0;
	return checkCount(
		'lifecycle_anomalies',
		count,
		`${count} lifecycle anomalies detected.`,
	);
};
