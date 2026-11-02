import { execFile } from 'node:child_process';

import { redactSecrets } from '@delendai/core/public';

export type AuditPackageManager = 'bun' | 'npm' | 'yarn';

export interface IAuditExecResult {
	readonly code: number;
	readonly stdout: string;
	readonly stderr: string;
	readonly timedOut: boolean;
}

export type IAuditExec = (
	command: AuditPackageManager,
	args: readonly string[],
	options: { readonly cwd: string; readonly timeoutMs: number },
) => Promise<IAuditExecResult>;

export interface IRunAuditCommandInput {
	readonly cwd: string;
	readonly packageManager: AuditPackageManager;
	readonly timeoutMs?: number;
	readonly exec?: IAuditExec;
}

export type IAuditCommandResult =
	| { readonly ok: true; readonly raw: Record<string, unknown> }
	| {
			readonly ok: false;
			readonly error: string;
			readonly hint: string;
	  };

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_BUFFER_BYTES = 4 * 1024 * 1024;

const AUDIT_ARGS: Readonly<Record<AuditPackageManager, readonly string[]>> = {
	bun: ['audit', '--json'],
	npm: ['audit', '--json'],
	yarn: ['audit', '--json'],
};

export class MissingCliError extends Error {
	readonly cli: AuditPackageManager;
	readonly hint: string;

	constructor(cli: AuditPackageManager) {
		super(`Missing required CLI: ${cli}`);
		this.name = 'MissingCliError';
		this.cli = cli;
		this.hint = installHintForCli(cli);
	}
}

export const installHintForCli = (cli: AuditPackageManager): string => {
	switch (cli) {
		case 'bun':
			return 'brew install bun';
		case 'npm':
			return 'brew install node';
		case 'yarn':
			return 'brew install yarn';
	}
};

const realExec: IAuditExec = (command, args, options) =>
	new Promise((resolve, reject) => {
		execFile(
			command,
			[...args],
			{
				cwd: options.cwd,
				timeout: options.timeoutMs,
				maxBuffer: MAX_BUFFER_BYTES,
				encoding: 'utf8',
			},
			(error, stdout, stderr) => {
				if (
					error !== null &&
					'code' in error &&
					error.code === 'ENOENT'
				) {
					reject(new MissingCliError(command));
					return;
				}
				const code =
					typeof error?.code === 'number'
						? error.code
						: error === null
							? 0
							: 1;
				resolve({
					code,
					stdout,
					stderr,
					timedOut:
						error?.name === 'Error' &&
						error.message.includes('timed out'),
				});
			},
		);
	});

const parseJsonLine = (line: string): Record<string, unknown> | undefined => {
	try {
		const parsed = JSON.parse(line) as unknown;
		if (
			parsed !== null &&
			typeof parsed === 'object' &&
			!Array.isArray(parsed)
		) {
			return parsed as Record<string, unknown>;
		}
	} catch {
		// fall through
	}
	return undefined;
};

const parseYarnAuditStream = (
	text: string,
): Record<string, unknown> | undefined => {
	const advisories: Record<string, unknown> = {};
	for (const line of text
		.split('\n')
		.map((part) => part.trim())
		.filter(Boolean)) {
		const parsed = parseJsonLine(line);
		if (parsed === undefined) continue;
		if (parsed.type === 'auditAdvisory') {
			const advisory = (parsed.data as { advisory?: unknown } | undefined)
				?.advisory;
			const id = (advisory as { id?: unknown } | undefined)?.id;
			if (typeof id === 'number' || typeof id === 'string') {
				advisories[String(id)] = advisory as Record<string, unknown>;
			}
		}
	}
	return Object.keys(advisories).length > 0 ? { advisories } : undefined;
};

const parseAuditJsonText = (
	text: string,
	packageManager: AuditPackageManager,
): Record<string, unknown> | undefined => {
	const trimmed = text.trim();
	if (trimmed.length === 0) return undefined;
	if (packageManager === 'yarn') {
		const ndjson = parseYarnAuditStream(trimmed);
		if (ndjson !== undefined) return ndjson;
	}
	const direct = parseJsonLine(trimmed);
	if (direct !== undefined) return direct;
	const lines = trimmed
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean);
	for (let index = lines.length - 1; index >= 0; index -= 1) {
		const parsed = parseJsonLine(lines[index] ?? '');
		if (parsed !== undefined) return parsed;
	}
	const start = trimmed.indexOf('{');
	const end = trimmed.lastIndexOf('}');
	if (start >= 0 && end >= start) {
		return parseJsonLine(trimmed.slice(start, end + 1));
	}
	return undefined;
};

export const runAuditCommand = async (
	input: IRunAuditCommandInput,
): Promise<IAuditCommandResult> => {
	try {
		const result = await (input.exec ?? realExec)(
			input.packageManager,
			AUDIT_ARGS[input.packageManager],
			{
				cwd: input.cwd,
				timeoutMs: input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
			},
		);
		if (result.timedOut) {
			return {
				ok: false,
				error: `${input.packageManager} audit timed out after ${input.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms`,
				hint: `Retry ${input.packageManager} audit in a smaller workspace or increase the timeout.`,
			};
		}
		const stdout = redactSecrets(result.stdout).text;
		const stderr = redactSecrets(result.stderr).text;
		const raw = parseAuditJsonText(
			stdout.length > 0 ? stdout : stderr,
			input.packageManager,
		);
		if (raw === undefined) {
			return {
				ok: false,
				error: `${input.packageManager} audit did not return readable JSON`,
				hint: `Run ${input.packageManager} audit --json locally and inspect the output.`,
			};
		}
		return { ok: true, raw };
	} catch (error) {
		if (error instanceof MissingCliError) {
			return { ok: false, error: error.message, hint: error.hint };
		}
		return {
			ok: false,
			error:
				error instanceof Error
					? error.message
					: `${input.packageManager} audit failed`,
			hint: `Run ${input.packageManager} audit --json locally and inspect the output.`,
		};
	}
};
