import type { IDoctorCheck, IDoctorCheckContext } from '../../db-doctor';
import { checkCount } from '../../db-doctor';

/** A receipt or run older than this is stale enough to report. */
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export const checkCommandReceipts = ({
	db,
}: IDoctorCheckContext): IDoctorCheck => {
	const count =
		db
			.query<{ count: number }, []>(
				`SELECT COUNT(*) AS count FROM mutation_commands WHERE status = 'started' AND created_at < unixepoch('now') * 1000 - ${String(ONE_DAY_MS)}`,
			)
			.get()?.count ?? 0;
	return checkCount(
		'command_receipts',
		count,
		`${count} stale command receipts detected.`,
	);
};
