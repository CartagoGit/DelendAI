/**
 * account-environment.service.ts — what a provider process on an account
 * may see.
 *
 * A worker CLI spawned with the server's whole environment would read
 * every credential the server holds, and an API key left in it takes
 * precedence over the subscription login the account declares. A process
 * on an account therefore starts from an allowlist: what any program needs
 * to run (PATH, locale, temp dirs, the user's home — never replaced), the
 * account's own credential variable when it names one, and the variable
 * that points the vendor's client at the account's isolated profile
 * directory. An account whose profile cannot be isolated for that client,
 * a subscription login asked to run with a flag that discards it, or an
 * account the user has not opened to unattended work, is refused before
 * anything is spawned.
 */
import { basename } from 'node:path';

import { knownClientOf, type IProviderAccount } from '@delendai/core/contracts';

import type {
	IAccountApiCredential,
	IAccountEnvironment,
} from '../contracts/interfaces/account-environment.interface';

/** What any program needs to run, on every OS. */
const BASE_VARIABLES = [
	'PATH',
	'HOME',
	'USER',
	'LOGNAME',
	'SHELL',
	'LANG',
	'TERM',
	'TMPDIR',
	'TMP',
	'TEMP',
	'TZ',
	'SystemRoot',
	'ComSpec',
	'PATHEXT',
	'USERPROFILE',
	'APPDATA',
	'LOCALAPPDATA',
	'HOMEDRIVE',
	'HOMEPATH',
];

const BASE_PREFIXES = ['LC_', 'XDG_'];

/** Windows spells these in any case (`Path`), so names compare without it. */
const isBaseVariable = (name: string): boolean => {
	const upper = name.toUpperCase();
	return (
		BASE_VARIABLES.some((base) => base.toUpperCase() === upper) ||
		BASE_PREFIXES.some((prefix) => upper.startsWith(prefix))
	);
};

/** What any program needs, taken from the server's environment. */
const baseEnvironment = (
	parentEnv: Readonly<Record<string, string | undefined>>,
): Record<string, string> => {
	const env: Record<string, string> = {};
	for (const [name, value] of Object.entries(parentEnv)) {
		if (value === undefined) continue;
		if (isBaseVariable(name)) env[name] = value;
	}
	return env;
};

export const accountEnvironment = (input: {
	readonly command: string;
	readonly args: readonly string[];
	readonly account: IProviderAccount | undefined;
	readonly accountId: string | undefined;
	readonly parentEnv: Readonly<Record<string, string | undefined>>;
	/** The workspace whose declared clients the command is matched to. */
	readonly workspaceRoot: string;
	/** The variables the entry names it needs (`invoke.env`). */
	readonly named?: readonly string[] | undefined;
}): IAccountEnvironment => {
	if (input.accountId === undefined) {
		// No account: the entry runs on what any program needs plus what
		// it names. Naming nothing, it used to get the server's whole
		// environment, every credential the server holds included.
		const env = baseEnvironment(input.parentEnv);
		for (const name of input.named ?? []) {
			const value = input.parentEnv[name];
			if (value !== undefined) env[name] = value;
		}
		return { kind: 'isolated', env };
	}
	const account = input.account;
	if (account === undefined)
		return {
			kind: 'refused',
			reason: `account "${input.accountId}" is not in the account registry`,
		};
	if (!account.permittedAutomation)
		return {
			kind: 'refused',
			reason: `account "${account.accountId}" is not open to unattended work (permittedAutomation is false)`,
		};
	const known = knownClientOf(input.command, input.workspaceRoot);
	const client =
		known?.command ??
		basename(input.command.replaceAll('\\', '/')).replace(
			/\.(exe|cmd|bat)$/iu,
			'',
		);
	const discarding = (known?.loginDiscardingFlags ?? []).find((flag) =>
		input.args.includes(flag),
	);
	if (
		discarding !== undefined &&
		account.credentialMode === 'official-subscription-login'
	)
		return {
			kind: 'refused',
			reason: `${client} ${discarding} ignores the subscription login of account "${account.accountId}"`,
		};
	const env = baseEnvironment(input.parentEnv);
	if (account.credentialEnv !== undefined) {
		const credential = input.parentEnv[account.credentialEnv];
		if (credential === undefined)
			return {
				kind: 'refused',
				reason: `account "${account.accountId}" names credential variable ${account.credentialEnv}, which is not set`,
			};
		env[account.credentialEnv] = credential;
	}
	if (account.profileDir !== undefined) {
		const variable = known?.profileVariable;
		if (variable === undefined)
			return {
				kind: 'refused',
				reason: `${client} has no known way to keep account "${account.accountId}" in its own profile directory`,
			};
		env[variable] = account.profileDir;
	}
	return { kind: 'isolated', env };
};

/**
 * The key an API provider is called with. On an account it comes from the
 * account's own credential variable, under the same policy a process on
 * it obeys: the account must exist and be open to unattended work, and a
 * subscription login is not an API key. The API transport used to read
 * the entry's variable whatever the account said.
 */
export const accountApiCredential = (input: {
	readonly envVar: string;
	readonly account: IProviderAccount | undefined;
	readonly accountId: string | undefined;
	readonly parentEnv: Readonly<Record<string, string | undefined>>;
}): IAccountApiCredential => {
	const read = (name: string): IAccountApiCredential => {
		const key = input.parentEnv[name];
		return key === undefined || key.length === 0
			? {
					kind: 'refused',
					reason: `api provider missing env key ${name}`,
				}
			: { kind: 'key', key };
	};
	if (input.accountId === undefined) return read(input.envVar);
	const account = input.account;
	if (account === undefined)
		return {
			kind: 'refused',
			reason: `account "${input.accountId}" is not in the account registry`,
		};
	if (!account.permittedAutomation)
		return {
			kind: 'refused',
			reason: `account "${account.accountId}" is not open to unattended work (permittedAutomation is false)`,
		};
	if (account.credentialMode === 'official-subscription-login')
		return {
			kind: 'refused',
			reason: `account "${account.accountId}" is a subscription login, not an API key: an API call cannot run on it`,
		};
	return read(account.credentialEnv ?? input.envVar);
};
