import type { IDoctorCheck, IDoctorCheckContext } from '../../db-doctor';
import { checkCount } from '../../db-doctor';

export const checkCommandReceipts = ({ db }: IDoctorCheckContext): IDoctorCheck => {
	const count = db.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM mutation_commands WHERE status = 'started' AND created_at < unixepoch('now') * 1000 - 86400000").get()?.count ?? 0;
	return checkCount('command_receipts', count, `${count} stale command receipts detected.`);
};
