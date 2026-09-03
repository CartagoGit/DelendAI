#!/usr/bin/env bun
/**
 * Record a tiny, transcript-free Claude Code lifecycle row from a command
 * hook. Command hooks receive their event payload on stdin and do not insert
 * tool output into the model context, which makes turn counting observable
 * without adding a per-turn context tax.
 */
import { appendFile, mkdir } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

import {
	DEFAULT_CORE_PATHS,
	redactSecrets,
	resolveWorkspaceContained,
	withFileMutex,
} from '@mcp-vertex/core/public';

const LIFECYCLE_FILE = 'host-lifecycle.claude-code.jsonl';
const USAGE_TRACKING_CACHE_REL = `${DEFAULT_CORE_PATHS.cacheDir}/results/usage-tracking`;

export type IClaudeHookEventName =
	| 'UserPromptSubmit'
	| 'PreCompact'
	| 'PostCompact'
	| 'SessionEnd';

export interface IClaudeLifecycleRow {
	readonly version: 1;
	readonly host: 'claude-code';
	readonly hostSessionId: string;
	readonly event: 'turn' | 'pre-compact' | 'post-compact' | 'session-end';
	readonly at: string;
}

const EVENT_MAP: Readonly<
	Record<IClaudeHookEventName, IClaudeLifecycleRow['event']>
> = {
	UserPromptSubmit: 'turn',
	PreCompact: 'pre-compact',
	PostCompact: 'post-compact',
	SessionEnd: 'session-end',
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
	value !== null && typeof value === 'object'
		? (value as Record<string, unknown>)
		: null;

const boundedText = (value: unknown): string | null => {
	if (typeof value !== 'string') return null;
	const normalized = value.trim();
	return normalized.length > 0 && normalized.length <= 512
		? normalized
		: null;
};

/** Convert Claude's hook payload to the deliberately tiny persisted shape. */
export const toClaudeLifecycleRow = (
	payload: unknown,
	now: Date = new Date(),
): IClaudeLifecycleRow | null => {
	const record = asRecord(payload);
	const sessionId = boundedText(record?.session_id);
	const hookEventName = boundedText(record?.hook_event_name);
	if (!sessionId || !hookEventName || !(hookEventName in EVENT_MAP))
		return null;
	return {
		version: 1,
		host: 'claude-code',
		hostSessionId: sessionId,
		event: EVENT_MAP[hookEventName as IClaudeHookEventName],
		at: now.toISOString(),
	};
};

interface IOptions {
	readonly workspace: string;
	readonly lifecyclePath: string;
}

const optionValue = (argv: readonly string[], name: string): string | null => {
	const prefix = `--${name}=`;
	const value = argv
		.find((arg) => arg.startsWith(prefix))
		?.slice(prefix.length);
	return value && value.length > 0 ? value : null;
};

/** Parse only relative workspace/cache paths; a hook must never write outside. */
export const parseOptions = (argv: readonly string[]): IOptions | null => {
	const workspace = optionValue(argv, 'workspace');
	if (!workspace) return null;
	const requestedPath =
		optionValue(argv, 'lifecycle-path') ??
		join(USAGE_TRACKING_CACHE_REL, LIFECYCLE_FILE);
	const contained = resolveWorkspaceContained(workspace, requestedPath);
	if (!contained.ok) return null;
	return { workspace, lifecyclePath: contained.abs };
};

/** Append one safe NDJSON row under the shared mutex used by durable stores. */
export const appendClaudeLifecycleRow = async (
	lifecyclePath: string,
	row: IClaudeLifecycleRow,
): Promise<void> => {
	await mkdir(dirname(lifecyclePath), { recursive: true });
	const { text } = redactSecrets(`${JSON.stringify(row)}\n`);
	await withFileMutex(lifecyclePath, () =>
		appendFile(lifecyclePath, text, 'utf8'),
	);
};

const run = async (): Promise<void> => {
	const options = parseOptions(process.argv.slice(2));
	if (!options) return;
	let input: unknown;
	try {
		input = JSON.parse(await Bun.stdin.text());
	} catch {
		return;
	}
	const row = toClaudeLifecycleRow(input);
	if (!row) return;
	try {
		await appendClaudeLifecycleRow(options.lifecyclePath, row);
	} catch {
		// Lifecycle telemetry is advisory: command hooks must never block Claude.
	}
};

const isMainModule = (): boolean => {
	const entry = process.argv[1];
	return (
		entry !== undefined &&
		basename(new URL(import.meta.url).pathname) === basename(entry)
	);
};

if (isMainModule()) void run();
