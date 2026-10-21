/**
 * known-client.helper.ts — which known client a command runs, from the
 * built-in catalogue and the clients configuration declares.
 *
 * The catalogue is a starting point, not a list of what may exist: a
 * project's `clients` and a person's override or extend it by command, so
 * a client nobody shipped is known the day it is declared.
 */
import { DECLARED_CLIENT_INSTALL } from '../contracts/constants/known-client-schema.constant';
import type { IDeclaredClient } from '../contracts/interfaces/declared-client.interface';
import { KNOWN_CLIENTS } from '../contracts/constants/known-clients.constant';
import type { IKnownClient } from '../contracts/interfaces/known-client.interface';

const COST_TIERS = [1, 2, 3, 4, 5] as const;

/** A declared client as the catalogue holds it, over the built-in entry of its command. */
export const asKnownClient = (declared: IDeclaredClient): IKnownClient => {
	const base: IKnownClient = KNOWN_CLIENTS.find(
		(each) => each.command === declared.command,
	) ?? {
		command: declared.command,
		id: `${declared.command}-cli`,
		label: declared.command,
		vendor: declared.vendor,
		costTier: 3,
		install: DECLARED_CLIENT_INSTALL,
	};
	return {
		...base,
		...declared,
		id: declared.id ?? base.id,
		label: declared.label ?? base.label,
		costTier:
			COST_TIERS.find((tier) => tier === declared.costTier) ??
			base.costTier,
		install: base.install,
	};
};

/** The catalogue with `declared` merged over it by command; later entries win. */
export const knownClientsWith = (
	declared: readonly IDeclaredClient[],
): readonly IKnownClient[] => {
	const byCommand = new Map(
		KNOWN_CLIENTS.map((client) => [client.command, client]),
	);
	for (const entry of declared)
		byCommand.set(entry.command, asKnownClient(entry));
	return [...byCommand.values()];
};

let configured: readonly IKnownClient[] = KNOWN_CLIENTS;

/**
 * The clients this process knows: set once where configuration is read
 * (the server's assembly), read wherever a command is matched to a client.
 */
export const useConfiguredClients = (
	declared: readonly IDeclaredClient[],
): void => {
	configured = knownClientsWith(declared);
};

/** Every client this process knows. */
export const allKnownClients = (): readonly IKnownClient[] => configured;

/** The known client a command names (`claude`, `/usr/bin/claude`, `claude.exe`). */
export const knownClientOf = (command: string): IKnownClient | undefined => {
	const base = (command.replaceAll('\\', '/').split('/').pop() ?? '').replace(
		/\.(exe|cmd|bat)$/iu,
		'',
	);
	return configured.find((client) => client.command === base);
};
