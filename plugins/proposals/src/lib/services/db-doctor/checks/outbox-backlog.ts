import type { IDoctorCheck, IDoctorCheckContext } from '../../db-doctor';
import { checkCount } from '../../db-doctor';

export const checkOutboxBacklog = ({ db }: IDoctorCheckContext): IDoctorCheck => {
	const count = db.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM outbox WHERE status IN ('pending','in-flight')").get()?.count ?? 0;
	return checkCount('outbox_backlog', count, `${count} pending outbox records detected.`);
};
