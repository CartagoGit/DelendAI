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
			'Restart the delendai MCP server (VS Code: "MCP: List Servers" → DelendAI → Restart; other hosts: start a new session), then continue.',
		dedupeKey: `stale-runtime:${reading.head}`,
	};
};

/**
 * A provider for the checkpoint-advisory channel. The first reading
 * records the commit the server started at; later readings compare.
 */
export const createStaleRuntimeAdvisory = (
	root: string,
	deps: IStaleRuntimeAdvisoryDeps = {},
): CheckpointAdvisoryProvider => {
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
	let readAt = now();
	let inFlight = false;
	return () => {
		if (!inFlight && now() - readAt >= interval) {
			inFlight = true;
			readAt = now();
			boot.then(async () => {
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
				})
				.finally(() => {
					inFlight = false;
				});
		}
		return staleRuntimeAdvisoryFor(reading);
	};
};
