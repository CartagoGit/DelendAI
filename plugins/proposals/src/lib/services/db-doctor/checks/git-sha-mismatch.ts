import type { IDoctorCheck, IDoctorCheckContext } from '../../db-doctor';
import { checkCount } from '../../db-doctor';

export const checkGitShaMismatch = ({
	db,
}: IDoctorCheckContext): IDoctorCheck => {
	const count =
		db
			.query<
				{ count: number },
				[]
			>(`SELECT COUNT(*) AS count FROM reconciliation_runs
		WHERE status = 'ok' AND source_commit IS NOT NULL AND logical_digest IS NULL`)
			.get()?.count ?? 0;
	return checkCount(
		'git_sha_mismatch',
		count,
		`${count} successful reconciliation runs lack a logical digest.`,
	);
};
