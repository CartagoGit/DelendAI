/**
 * stale-runtime-advisory.ts — a server running older code than its
 * checkout says so on every tool result (x00701).
 *
 * The host loads delendai's code once, when an agent's session starts.
 * The checkout moves on as pull requests merge: on 2026-09-27 a swarm kept
 * opening pull requests from work refs and pushing back finished work
 * refs for hours after both had been fixed on the integration branch,
 * because every agent's server still ran the code it had booted with, and
 * nothing told them. This advisory rides on the checkpoint-advisory
 * channel, like the loose-edits one, and names the restart that applies
 * the current rules.
 *
 * Tool calls never wait on git: the reading is refreshed in the
 * background, at most once per interval.
 */
import { execFile } from 'node:child_process';

import type {
	CheckpointAdvisoryProvider,
	ICheckpointAdvisory,
} from '../contracts/interfaces/checkpoint-advisory.interface';
import type {
	IStaleRuntimeAdvisoryDeps,
	IStaleRuntimeReading,
	IStaleRuntimeWatch,
} from './stale-runtime-advisory.interface';

const REFRESH_INTERVAL_MS = 60_000;
/** Where the code a server runs lives: sources, not specs or docs. */
const RUNTIME_PATHS =
	/^(packages|plugins)\/[^/]+\/src\/|^tools\/scripts\/host\//u;

const git = (
	root: string,
	args: readonly string[],
): Promise<string | undefined> =>
	new Promise((resolveOutput) => {
		execFile(
			'git',
			[...args],
			{ cwd: root, encoding: 'utf8' },
			(error, stdout) => {
				resolveOutput(error === null ? stdout.trim() : undefined);
			},
		);
	});

/** The advisory a reading calls for, or `null` when the server is current. */
export const staleRuntimeAdvisoryFor = (
	reading: IStaleRuntimeReading,
): ICheckpointAdvisory | null => {
	if (
		reading.bootHead === undefined ||
		reading.head === undefined ||
		reading.bootHead === reading.head
	) {
		return null;
	}
	const runtime = reading.changed.filter((path) => RUNTIME_PATHS.test(path));
	if (runtime.length === 0) return null;
	return {
		triggered: true,
		code: 'SERVER_BEHIND_CHECKOUT',
		severity: 'strong',
		message: `This delendai server started at ${reading.bootHead.slice(0, 9)}; the checkout is at ${reading.head.slice(0, 9)}, and ${String(runtime.length)} source file(s) it runs have changed since. It still applies the rules it started with.`,
		reason: 'Fixes merged since this session started (guards, publishing, reviews) do not apply to calls made through this server.',
		nextAction:
			process.env.DELENDAI_SUPERVISED === '1'
				? 'Nothing to do: this server is supervised and moves onto the current code within a minute, once no call is in flight.'
				: 'Restart the delendai MCP server (VS Code: "MCP: List Servers" → DelendAI → Restart; other hosts: start a new session), then continue.',
		dedupeKey: `stale-runtime:${reading.head}`,
	};
};

/**
 * The server's view of its own code: the commit it started at against the
 * one its checkout is at now. `advisory` rides on every tool result and
 * never waits on git; `behind` reads afresh, for work that must not run
 * on older rules at all (x00709).
 */
export const createStaleRuntimeWatch = (
	root: string,
	deps: IStaleRuntimeAdvisoryDeps = {},
): IStaleRuntimeWatch => {
	const head = deps.head ?? ((at: string) => git(at, ['rev-parse', 'HEAD']));
	const changedBetween =
		deps.changedBetween ??
		(async (at: string, from: string, to: string) =>
			((await git(at, ['diff', '--name-only', from, to])) ?? '')
				.split('\n')
				.filter((line) => line.length > 0));
	const now = deps.now ?? Date.now;
	const interval = deps.intervalMs ?? REFRESH_INTERVAL_MS;
	let reading: IStaleRuntimeReading = {
		bootHead: undefined,
		head: undefined,
		changed: [],
	};
	const boot = head(root).then((sha) => {
		reading = { bootHead: sha, head: sha, changed: [] };
	});
	const refresh = (): Promise<void> =>
		boot
			.then(async () => {
				const current = await head(root);
				const from = reading.bootHead;
				if (current === undefined || from === undefined) return;
				reading = {
					bootHead: from,
					head: current,
					changed:
						current === from
							? []
							: await changedBetween(root, from, current),
				};
			})
			.catch(() => {
				// A reading that fails leaves the last one standing.
			});
	let readAt = now();
	let inFlight = false;
	return {
		advisory: () => {
			if (!inFlight && now() - readAt >= interval) {
				inFlight = true;
				readAt = now();
				void refresh().finally(() => {
					inFlight = false;
				});
			}
			return staleRuntimeAdvisoryFor(reading);
		},
		behind: async () => {
			await refresh();
			return staleRuntimeAdvisoryFor(reading)?.message;
		},
	};
};

/** The advisory alone, for callers that need nothing else. */
export const createStaleRuntimeAdvisory = (
	root: string,
	deps: IStaleRuntimeAdvisoryDeps = {},
): CheckpointAdvisoryProvider => createStaleRuntimeWatch(root, deps).advisory;
