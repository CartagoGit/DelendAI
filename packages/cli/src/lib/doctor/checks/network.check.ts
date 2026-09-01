import type { DoctorCheck } from '../types';

export const checkNetworkDependentSurfaces: DoctorCheck = async () => ({
	name: 'network-surfaces',
	status: 'warn',
	findings: [
		'GitHub CI status and MCP handshake checks are skipped from the local doctor; run the host-specific smoke checks for network validation',
	],
});
