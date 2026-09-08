import type { IDoctorCheck, IDoctorCheckContext } from '../../db-doctor';

export const checkForeignKeys = ({ db }: IDoctorCheckContext): IDoctorCheck => {
	const rows = db.query<{ table: string; rowid: number; parent: string; fkid: number }, []>('PRAGMA foreign_key_check').all();
	return {
		name: 'foreign_keys',
		severity: rows.length === 0 ? 'ok' : 'error',
		message: rows.length === 0 ? 'No issues detected.' : `${rows.length} foreign-key violations detected.`,
	};
};
