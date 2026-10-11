import type { DoctorCheck } from '../types';

export const checkPorts: DoctorCheck = async () => ({
	name: 'ports',
	status: 'ok',
	findings: ['port probe skipped; doctor does not reserve host ports'],
});
