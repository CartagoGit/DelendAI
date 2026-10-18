/**
 * known-client.helper.ts — which known client a command runs.
 */
import { KNOWN_CLIENTS } from '../contracts/constants/known-clients.constant';
import type { IKnownClient } from '../contracts/interfaces/known-client.interface';

/** The known client a command names (`claude`, `/usr/bin/claude`, `claude.exe`). */
export const knownClientOf = (command: string): IKnownClient | undefined => {
	const base = (command.replaceAll('\\', '/').split('/').pop() ?? '').replace(
		/\.(exe|cmd|bat)$/iu,
		'',
	);
	return KNOWN_CLIENTS.find((client) => client.command === base);
};
