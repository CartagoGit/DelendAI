// effect-boundary-authorized: streams the host's own transcripts, which can reach GBs, read-only
import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

import type {
	IHostSessionTokens,
	IMeterSessionsOptions,
	IHostSessionWindow,
	IThreadTokens,
} from '../contracts/host-session-tokens.interface';

const PROMPT_LIMIT = 90;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** `/a/b` -> `-a-b`: how Claude Code names a workspace's transcript folder. */
export const claudeProjectDirName = (workspace: string): string =>
	workspace.replace(/[^a-zA-Z0-9-]/g, '-');

export const claudeProjectsDir = (
	workspace: string,
	home: string = homedir(),
): string => join(home, '.claude', 'projects', claudeProjectDirName(workspace));

const median = (values: readonly number[]): number => {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = sorted.length >> 1;
	return Math.floor(
		sorted.length % 2
			? sorted[mid]!
			: (sorted[mid - 1]! + sorted[mid]!) / 2,
	);
};

const bound = (value: string | undefined, endOfDay: boolean): number | null => {
	if (!value) return null;
	const date = /^\d{4}-\d{2}-\d{2}$/.test(value);
	const time = Date.parse(value);
	if (Number.isNaN(time)) return null;
	return date && endOfDay ? time + MS_PER_DAY - 1 : time;
};

const promptOf = (content: unknown): string => {
	const text =
		typeof content === 'string'
			? content
			: Array.isArray(content)
				? content
						.map((part: unknown) =>
							part && typeof part === 'object'
								? String(
										(part as { text?: unknown }).text ?? '',
									)
								: '',
						)
						.join(' ')
				: '';
	return text.split(/\s+/).filter(Boolean).join(' ').slice(0, PROMPT_LIMIT);
};

interface IRow {
	readonly type?: string;
	readonly timestamp?: string;
	readonly uuid?: string;
	readonly message?: {
		readonly id?: string;
		readonly role?: string;
		readonly content?: unknown;
		readonly usage?: {
			readonly input_tokens?: number;
			readonly cache_creation_input_tokens?: number;
			readonly cache_read_input_tokens?: number;
			readonly output_tokens?: number;
		};
	};
}

/**
 * Meters one transcript, streaming it line by line (they reach GBs). Each
 * assistant message counts once, by message id: a message streamed in several
 * rows is the same call.
 */
export const meterTranscript = async (
	path: string,
	window: IHostSessionWindow = {},
): Promise<IThreadTokens> => {
	const from = bound(window.from, false);
	const to = bound(window.to, true);
	const seen = new Set<string>();
	const context: number[] = [];
	const total = { input: 0, cacheWrite: 0, cacheRead: 0, output: 0 };
	let first: string | null = null;
	let last: string | null = null;
	let prompt: string | null = null;
	const lines = createInterface({
		input: createReadStream(path, { encoding: 'utf8' }),
		crlfDelay: Infinity,
	});
	for await (const line of lines) {
		if (prompt !== null && !line.includes('"usage"')) continue;
		let row: IRow;
		try {
			row = JSON.parse(line) as IRow;
		} catch {
			continue;
		}
		const stamp = row.timestamp ?? '';
		const at = stamp ? Date.parse(stamp) : Number.NaN;
		if (!Number.isNaN(at)) {
			if (from !== null && at < from) continue;
			if (to !== null && at > to) continue;
		}
		const message = row.message ?? {};
		if (prompt === null && row.type === 'user') {
			prompt = promptOf(message.content);
		}
		const use = message.usage;
		if (!use || message.role !== 'assistant') continue;
		const key = message.id ?? row.uuid ?? '';
		if (key && seen.has(key)) continue;
		if (key) seen.add(key);
		const input = use.input_tokens ?? 0;
		const cacheWrite = use.cache_creation_input_tokens ?? 0;
		const cacheRead = use.cache_read_input_tokens ?? 0;
		total.input += input;
		total.cacheWrite += cacheWrite;
		total.cacheRead += cacheRead;
		total.output += use.output_tokens ?? 0;
		context.push(input + cacheWrite + cacheRead);
		first ??= stamp || null;
		last = stamp || last;
	}
	return {
		calls: context.length,
		...total,
		contextMedian: median(context),
		contextMax: context.reduce((a, b) => Math.max(a, b), 0),
		first,
		last,
		prompt: prompt ?? '',
	};
};

/** Meters a session: its main transcript plus `<session>/subagents/*.jsonl`. */
export const meterSession = async (
	mainPath: string,
	window: IHostSessionWindow = {},
): Promise<IHostSessionTokens> => {
	const base = mainPath.replace(/\.jsonl$/, '');
	const main = await meterTranscript(mainPath, window);
	let names: string[] = [];
	try {
		names = (await readdir(join(base, 'subagents')))
			.filter((name) => name.endsWith('.jsonl'))
			.sort();
	} catch {
		names = [];
	}
	const subagents: (IThreadTokens & { id: string })[] = [];
	for (const name of names) {
		const use = await meterTranscript(
			join(base, 'subagents', name),
			window,
		);
		if (use.calls > 0) subagents.push({ id: name.slice(0, -6), ...use });
	}
	return {
		session: base.slice(base.lastIndexOf('/') + 1),
		main,
		subagents,
	};
};

/**
 * Meters the sessions in a transcript folder, newest first. A session whose
 * file was last written before `from` cannot hold a call in the window and is
 * skipped without being read.
 */
export const meterSessions = async (
	dir: string,
	options: IMeterSessionsOptions = {},
): Promise<readonly IHostSessionTokens[]> => {
	const from = bound(options.from, false);
	let names: string[];
	try {
		names = (await readdir(dir)).filter((name) => name.endsWith('.jsonl'));
	} catch {
		return [];
	}
	const files: { path: string; mtime: number }[] = [];
	for (const name of names) {
		if (options.session && name !== `${options.session}.jsonl`) continue;
		const path = join(dir, name);
		const { mtimeMs } = await stat(path);
		if (from !== null && mtimeMs < from) continue;
		files.push({ path, mtime: mtimeMs });
	}
	files.sort((a, b) => b.mtime - a.mtime);
	const out: IHostSessionTokens[] = [];
	for (const file of files) {
		const metered = await meterSession(file.path, options);
		const spent = metered.main.calls + metered.subagents.length;
		if (spent > 0) out.push(metered);
	}
	return out;
};
