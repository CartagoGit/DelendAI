/**
 * server-log.ts — a server keeps its own log, where any agent can read it.
 *
 * What a server says goes to its stderr, and stderr went wherever the
 * host put it: VS Code kept it in a per-window log under the user's
 * application data, another host kept nothing. An agent fixing what the
 * boot reported had to be handed the text by a person. The server now
 * copies every line to `<cache>/logs/mcp-server/mcp-server.<day>.log`,
 * stamped with the time and the process, so the boots after a change —
 * and how they reacted to it — can be read back from the workspace. Ten
 * days are kept; older files go when a server starts.
 */
import { appendFile, mkdir, readdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { DEFAULT_CORE_PATHS } from '../contracts/interfaces/core-paths.interface';
import { parseConfigFile } from '../plugins/load-config-file';
import { readConfigText } from '../work-units/command-args.helper';
import {
	SERVER_LOG_DAYS_KEPT,
	SERVER_LOG_SEGMENTS,
} from '../contracts/constants/server-log.constant';

const FILE = /^mcp-server\.(\d{4}-\d{2}-\d{2})\.log$/u;

/** The day's file name for `at`. */
export const serverLogName = (at: Date): string =>
	`mcp-server.${at.toISOString().slice(0, 10)}.log`;

/** Of `names`, the server logs past the newest `keep` days. */
export const expiredServerLogs = (
	names: readonly string[],
	keep: number = SERVER_LOG_DAYS_KEPT,
): readonly string[] =>
	names
		.filter((name) => FILE.test(name))
		.sort()
		.reverse()
		.slice(keep);

/**
 * Copy what this process writes to stderr into the day's server log
 * under `cacheDirAbs`, and remove the logs past the days kept. Never
 * throws and never blocks a write: a log that cannot be written is a
 * log that is missing, not a server that fails.
 */
export const startServerLog = async (input: {
	readonly cacheDirAbs: string;
	readonly label: string;
	readonly now?: () => Date;
}): Promise<void> => {
	const dir = join(input.cacheDirAbs, ...SERVER_LOG_SEGMENTS);
	const now = input.now ?? (() => new Date());
	try {
		await mkdir(dir, { recursive: true });
		// Today's file counts among the days kept, written yet or not.
		const today = serverLogName(now());
		const names = await readdir(dir);
		for (const name of expiredServerLogs(
			names.includes(today) ? names : [...names, today],
		)) {
			await rm(join(dir, name), { force: true });
		}
	} catch {
		return;
	}
	const prefix = `${input.label}#${String(process.pid)}`;
	let pending = Promise.resolve();
	let partial = '';
	const record = (text: string): void => {
		const lines = `${partial}${text}`.split('\n');
		partial = lines.pop() ?? '';
		if (lines.length === 0) return;
		const at = now();
		const block = lines
			.map((line) => `${at.toISOString()} ${prefix} ${line}\n`)
			.join('');
		pending = pending
			.then(() => appendFile(join(dir, serverLogName(at)), block))
			.catch(() => undefined);
	};
	const write = process.stderr.write.bind(process.stderr);
	process.stderr.write = ((chunk: unknown, ...rest: unknown[]) => {
		record(typeof chunk === 'string' ? chunk : String(chunk));
		return (write as (...args: unknown[]) => boolean)(chunk, ...rest);
	}) as typeof process.stderr.write;
	record(`--- server started (${input.label}) ---\n`);
};

/** `startServerLog` under the cache directory `workspaceRoot` declares. */
export const startServerLogIn = async (
	workspaceRoot: string,
	label: string,
): Promise<void> => {
	const config = parseConfigFile(await readConfigText(workspaceRoot));
	await startServerLog({
		cacheDirAbs: resolve(
			workspaceRoot,
			config.cacheDir ?? DEFAULT_CORE_PATHS.cacheDir,
		),
		label,
	});
};
