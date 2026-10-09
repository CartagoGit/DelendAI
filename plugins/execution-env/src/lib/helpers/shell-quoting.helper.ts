import {
	ENV_NAME_PATTERN,
	POWERSHELL_QUOTE_CHARACTERS,
} from '../contracts/constants/ssh.constant';
import type { IRemoteCommandParts } from '../contracts/interfaces/remote-command.interface';
import type { ISshRemoteDialect } from '../contracts/interfaces/ssh-execution.interface';

/** One word for a POSIX shell: single quotes, with each inner quote escaped. */
export const quotePosix = (word: string): string =>
	`'${word.replace(/'/g, `'\\''`)}'`;

/** One word for PowerShell: single quotes, with every quote character doubled. */
export const quotePowerShell = (word: string): string =>
	`'${word.replace(POWERSHELL_QUOTE_CHARACTERS, (quote) => quote + quote)}'`;

/** Quote one word for the remote shell named by `dialect`. */
export const quoteWord = (word: string, dialect: ISshRemoteDialect): string =>
	dialect === 'posix' ? quotePosix(word) : quotePowerShell(word);

const assertEnvName = (name: string): void => {
	if (!ENV_NAME_PATTERN.test(name)) {
		throw new Error(`not a valid environment variable name: ${name}`);
	}
};

/**
 * The single string ssh hands to the remote shell. ssh cannot take an
 * argument vector, so the quoting here is what keeps data from becoming
 * syntax: every word, the directory and every value is quoted for the
 * remote dialect, and variable names are validated, never quoted.
 */
export const buildRemoteCommand = (
	parts: IRemoteCommandParts,
	dialect: ISshRemoteDialect,
): string => {
	const [program, ...rest] = parts.command;
	if (program === undefined || program.length === 0) {
		throw new Error('a remote command needs a program');
	}
	if (program.startsWith('-')) {
		throw new Error(`a program may not start with a dash: ${program}`);
	}
	const env = Object.entries(parts.env ?? {});
	for (const [name] of env) assertEnvName(name);
	if (dialect === 'posix') {
		const assignments = env.map(([name, value]) =>
			quotePosix(`${name}=${value}`),
		);
		const invocation = [
			'exec',
			...(assignments.length > 0 ? ['env', ...assignments] : []),
			...parts.command.map(quotePosix),
		].join(' ');
		return parts.cwd === undefined
			? invocation
			: `cd -- ${quotePosix(parts.cwd)} && ${invocation}`;
	}
	const statements = [
		...(parts.cwd === undefined
			? []
			: [`Set-Location -LiteralPath ${quotePowerShell(parts.cwd)}`]),
		...env.map(
			([name, value]) => `$env:${name} = ${quotePowerShell(value)}`,
		),
		`& ${[program, ...rest].map(quotePowerShell).join(' ')}`,
		'exit $LASTEXITCODE',
	];
	return statements.join('; ');
};
