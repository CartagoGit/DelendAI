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

import type { IProviderAccount } from '@delendai/core/public';

import type { IAccountEnvironment } from '../contracts/interfaces/account-environment.interface';

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

/** The variable each client reads its profile directory from. */
const PROFILE_VARIABLE_BY_CLIENT: Readonly<Record<string, string>> = {
	claude: 'CLAUDE_CONFIG_DIR',
	codex: 'CODEX_HOME',
};

/** Flags that make a client ignore the subscription login. */
const LOGIN_DISCARDING_FLAGS: Readonly<Record<string, readonly string[]>> = {
	claude: ['--bare'],
};

/** `claude`, `/usr/bin/claude`, `claude.exe` → `claude`. */
const clientOf = (command: string): string =>
	basename(command.replaceAll('\\', '/')).replace(/\.(exe|cmd|bat)$/iu, '');

export const accountEnvironment = (input: {
	readonly command: string;
	readonly args: readonly string[];
	readonly account: IProviderAccount | undefined;
	readonly accountId: string | undefined;
	readonly parentEnv: Readonly<Record<string, string | undefined>>;
}): IAccountEnvironment => {
	if (input.accountId === undefined) return { kind: 'inherit' };
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
	const client = clientOf(input.command);
	const discarding = (LOGIN_DISCARDING_FLAGS[client] ?? []).find((flag) =>
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
	const env: Record<string, string> = {};
	for (const [name, value] of Object.entries(input.parentEnv)) {
		if (value === undefined) continue;
		if (isBaseVariable(name)) env[name] = value;
	}
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
		const variable = PROFILE_VARIABLE_BY_CLIENT[client];
		if (variable === undefined)
			return {
				kind: 'refused',
				reason: `${client} has no known way to keep account "${account.accountId}" in its own profile directory`,
			};
		env[variable] = account.profileDir;
	}
	return { kind: 'isolated', env };
};
