import type { DoctorCheck } from '../types';

export const checkDeps: DoctorCheck = async ({ fs }) => {
	const lock = await fs.fileExists('bun.lock');
	return lock
		? { name: 'deps', status: 'ok', findings: ['bun.lock is present'] }
		: {
				name: 'deps',
				status: 'warn',
				findings: [
					'bun.lock is missing; dependency validation skipped',
				],
			};
};
