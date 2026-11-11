import { notApplicable } from '../applicability';
import type { DoctorCheck } from '../types';

/**
 * Nothing here is probed: the local doctor never opens a socket. That is
 * a standing fact about this command, not a problem in the project, so it
 * is reported as not applicable rather than as a warning every project
 * carries forever.
 */
export const checkNetworkDependentSurfaces: DoctorCheck = async () =>
	notApplicable(
		'network-surfaces',
		'not applicable: GitHub CI status and MCP handshake checks are skipped from the local doctor; run the host-specific smoke checks for network validation',
	);
