import type { IDoctorCheck, IDoctorCheckContext } from '../../db-doctor';

export const checkIntegrity = ({ db }: IDoctorCheckContext): IDoctorCheck => {
	const result = db.query<{ integrity_check: string }, []>('PRAGMA integrity_check').get()?.integrity_check ?? 'unknown';
	return {
		name: 'integrity',
		severity: result === 'ok' ? 'ok' : 'error',
		message: result === 'ok' ? 'No issues detected.' : `SQLite integrity check: ${result}`,
	};
};
