import { readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import {
	SafeWorkspaceReader,
	toolJson,
	type IToolRegistration,
	withFileMutex,
} from '@mcp-vertex/core/public';
import z from 'zod';

import {
	listStaleAgentLockTmpFiles,
	readLock,
	type ILockEntry,
} from '../locks/agent-lock-engine';

const ZOMBIE_AGE_MS = 30_000;
const TMP_ORPHAN_AGE_MS = 60_000;

const ZOMBIE_SCHEMA = z.object({
	task_id: z.string(),
	agent: z.string(),
	ownership: z.array(z.string()),
	started_at: z.string(),
	last_seen: z.string(),
	age_seconds: z.number(),
	parent_task_id: z.string().optional(),
});

const TMP_ORPHAN_SCHEMA = z.object({
	absPath: z.string(),
	relName: z.string(),
	mtime: z.string(),
	ageSeconds: z.number(),
});

const LOG_GAP_SCHEMA = z.object({
	task_id: z.string(),
	lock_last_seen: z.string(),
	latest_log_ts: z.string().nullable(),
	gap_seconds: z.number().nullable(),
});

const AGENTS_LOCK_DIAGNOSE_OUTPUT_SCHEMA = z.object({
	ok: z.literal(true),
	zombies: z.array(ZOMBIE_SCHEMA),
	tmpOrphans: z.array(TMP_ORPHAN_SCHEMA),
	logGaps: z.array(LOG_GAP_SCHEMA),
});

export interface IAgentsLockDiagnoseToolOptions {
	readonly namespacePrefix: string;
	readonly lockPathAbs: string;
	readonly lockFileLabel: string;
}

interface ILogGap {
	readonly task_id: string;
	readonly lock_last_seen: string;
	readonly latest_log_ts: string | null;
	readonly gap_seconds: number | null;
}

const isZombie = (entry: ILockEntry, nowMs: number): boolean => {
	if (entry.started_at !== entry.last_seen) return false;
	const lastSeenMs = Date.parse(entry.last_seen);
	if (Number.isNaN(lastSeenMs)) return false;
	return nowMs - lastSeenMs > ZOMBIE_AGE_MS;
};

const toZombie = (entry: ILockEntry, nowMs: number) => ({
	task_id: entry.task_id,
	agent: entry.agent,
	ownership: [...entry.ownership],
	started_at: entry.started_at,
	last_seen: entry.last_seen,
	age_seconds: Math.floor((nowMs - Date.parse(entry.last_seen)) / 1000),
	...(entry.parent_task_id !== undefined
		? { parent_task_id: entry.parent_task_id }
		: {}),
});

const findLogDirs = (lockPathAbs: string): readonly string[] => {
	const cacheRoot = dirname(lockPathAbs);
	return [join(cacheRoot, 'results', 'logs'), join(cacheRoot, 'logs')];
};

const readLatestLogTsByTask = async (
	lockPathAbs: string,
): Promise<Map<string, string>> => {
	const latestByTask = new Map<string, string>();
	for (const logsDir of findLogDirs(lockPathAbs)) {
		const names = (await readdir(logsDir).catch(() => []))
			.filter((name) => name.endsWith('.jsonl'))
			.sort();
		const reader = new SafeWorkspaceReader(logsDir);
		for (const name of names) {
			const content = await reader
				.readText(name)
				.then((value) => value.content)
				.catch(() => '');
			for (const line of content.split('\n')) {
				if (!line.trim()) continue;
				let parsed: unknown;
				try {
					parsed = JSON.parse(line) as unknown;
				} catch {
					continue;
				}
				if (typeof parsed !== 'object' || parsed === null) continue;
				const taskId =
					'taskId' in parsed && typeof parsed.taskId === 'string'
						? parsed.taskId
						: null;
				const ts =
					'ts' in parsed && typeof parsed.ts === 'string'
						? parsed.ts
						: null;
				if (taskId === null || ts === null) continue;
				const existing = latestByTask.get(taskId);
				if (
					existing === undefined ||
					Date.parse(ts) > Date.parse(existing)
				) {
					latestByTask.set(taskId, ts);
				}
			}
		}
	}
	return latestByTask;
};

const buildLogGaps = (
	zombies: ReadonlyArray<ReturnType<typeof toZombie>>,
	latestByTask: ReadonlyMap<string, string>,
): ILogGap[] =>
	zombies.map((zombie) => {
		const latest = latestByTask.get(zombie.task_id) ?? null;
		return {
			task_id: zombie.task_id,
			lock_last_seen: zombie.last_seen,
			latest_log_ts: latest,
			gap_seconds:
				latest === null
					? null
					: Math.max(
							0,
							Math.floor(
								(Date.parse(zombie.last_seen) -
									Date.parse(latest)) /
									1000,
							),
						),
		};
	});

const diagnoseAgentsLock = async (
	options: IAgentsLockDiagnoseToolOptions,
): Promise<z.infer<typeof AGENTS_LOCK_DIAGNOSE_OUTPUT_SCHEMA>> => {
	const nowMs = Date.now();
	const lock = await withFileMutex(
		options.lockPathAbs,
		() => readLock({ lockPath: options.lockPathAbs }),
		{ onContention: 'fail', timeoutMs: 10_000 },
	);
	const zombies = lock.in_flight
		.filter((entry) => isZombie(entry, nowMs))
		.map((entry) => toZombie(entry, nowMs));
	const tmpOrphans = await listStaleAgentLockTmpFiles(
		options.lockPathAbs,
		TMP_ORPHAN_AGE_MS,
	);
	const latestByTask = await readLatestLogTsByTask(options.lockPathAbs);
	return {
		ok: true,
		zombies,
		tmpOrphans: [...tmpOrphans],
		logGaps: buildLogGaps(zombies, latestByTask),
	};
};

export const buildAgentsLockDiagnoseRegistration = (
	options: IAgentsLockDiagnoseToolOptions,
): IToolRegistration => ({
	id: 'agents_lock_diagnose',
	summary:
		'Diagnose stuck agents by correlating stale lock heartbeats, orphaned lock tmp files and the last matching log entry.',
	tags: ['coordination', 'lazy'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_agents_lock_diagnose`,
			{
				inputSchema: z.object({}),
				outputSchema: AGENTS_LOCK_DIAGNOSE_OUTPUT_SCHEMA,
				description:
					'Reads agents.lock.json, reports zombie lock entries (started_at == last_seen and older than 30s), stale agents.lock tmp files older than 60s, and correlates each zombie task with the most recent matching log line under results/logs or logs.',
			},
			async () => toolJson(await diagnoseAgentsLock(options)),
		);
	},
});

export const __testOnly = {
	buildLogGaps,
	diagnoseAgentsLock,
	isZombie,
	readLatestLogTsByTask,
	toZombie,
	TMP_ORPHAN_AGE_MS,
	ZOMBIE_AGE_MS,
};
