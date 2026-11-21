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

/**
 * The clients each workspace declares, by its resolved root. One list for
 * the whole process let the last project assembled decide which clients
 * every other project's commands matched.
 */
const configuredByRoot = new Map<string, readonly IKnownClient[]>();

/** One spelling per root: separators unified, no trailing one. */
const rootKey = (workspaceRoot: string): string =>
	workspaceRoot.replaceAll('\\', '/').replace(/(?<=.)\/+$/u, '');

/**
 * The clients a workspace knows: set where its configuration is read (the
 * server's assembly), read wherever one of its commands is matched to a
 * client.
 */
export const useConfiguredClients = (
	workspaceRoot: string,
	declared: readonly IDeclaredClient[],
): void => {
	configuredByRoot.set(rootKey(workspaceRoot), knownClientsWith(declared));
};

/** Every client a workspace knows: the catalogue when it declared none. */
export const allKnownClients = (
	workspaceRoot: string,
): readonly IKnownClient[] =>
	configuredByRoot.get(rootKey(workspaceRoot)) ?? KNOWN_CLIENTS;

/** The command a path or file name runs: `/usr/bin/claude.exe` → `claude`. */
const commandName = (command: string): string =>
	(command.replaceAll('\\', '/').split('/').pop() ?? '').replace(
		/\.(exe|cmd|bat)$/iu,
		'',
	);

/** The known client a command names (`claude`, `/usr/bin/claude`, `claude.exe`) in a workspace. */
export const knownClientOf = (
	command: string,
	workspaceRoot: string,
): IKnownClient | undefined => {
	const base = commandName(command);
	return allKnownClients(workspaceRoot).find(
		(client) => client.command === base,
	);
};

/**
 * The built-in entry a command names, whatever any workspace declares:
 * what only the catalogue knows, such as how a client is installed (a
 * declared client keeps its command's built-in install).
 */
export const catalogueClientOf = (
	command: string,
): IKnownClient | undefined => {
	const base = commandName(command);
	return KNOWN_CLIENTS.find((client) => client.command === base);
};
