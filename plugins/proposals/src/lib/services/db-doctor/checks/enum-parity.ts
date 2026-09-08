import type { IDoctorCheck, IDoctorCheckContext } from '../../db-doctor';

export const checkEnumParity = ({ db }: IDoctorCheckContext): IDoctorCheck => {
	const status = db.query<{ invalid: number }, []>(`SELECT COUNT(*) AS invalid FROM (
		SELECT status FROM proposals UNION ALL SELECT status FROM plans UNION ALL SELECT status FROM slices
	) WHERE status IS NULL OR TRIM(status) = ''`).get()?.invalid ?? 0;
	return {
		name: 'enum_parity',
		severity: status === 0 ? 'ok' : 'error',
		message: status === 0 ? 'No issues detected.' : `${status} enum-parity violations detected.`,
	};
};
