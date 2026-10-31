/**
 * loose-edits-advisory.ts — announce, on every tool result, changes sitting
 * in the shared checkout on the integration branch.
 *
 * Under a work-ref policy nothing commits there, so a change left there is
 * committed by nobody and eventually lost. The write guard
 * (`integrationCheckoutRefusal`) stops the tools from making such changes,
 * but not an agent's own shell: on 2026-09-26 a reviewer moved proposal
 * files with `mv` in the shared checkout, and nothing it called said so.
 * This advisory rides on the checkpoint-advisory channel (`_meta`), so
 * every agent calling any tool sees it, whoever made the change.
 *
 * Tool calls never wait on git: the state is refreshed in the background,
 * at most once per interval, and the provider answers from the last
 * reading.
 */
import { execFile } from 'node:child_process';

import type {
	CheckpointAdvisoryProvider,
	ICheckpointAdvisory,
} from '../contracts/interfaces/checkpoint-advisory.interface';
import type {
	ILooseEditsAdvisoryDeps,
	ILooseEditsReading,
} from './loose-edits-advisory.interface';
import { integrationCheckoutRefusal } from './project-branches';

const REFRESH_INTERVAL_MS = 30_000;
const LISTED_PATHS = 5;
const PORCELAIN_PATH_OFFSET = 3;

const porcelainPaths = (root: string): Promise<readonly string[]> =>
	new Promise((resolvePaths) => {
		execFile(
			'git',
			['status', '--porcelain'],
			{ cwd: root, encoding: 'utf8' },
			(error, stdout) => {
				if (error !== null) {
					resolvePaths([]);
					return;
				}
				resolvePaths(
					stdout
						.split('\n')
						.filter((line) => line.length > PORCELAIN_PATH_OFFSET)
						.map((line) => line.slice(PORCELAIN_PATH_OFFSET)),
				);
			},
		);
	});

const readLooseEdits = async (
	root: string,
	env: Readonly<Record<string, string | undefined>>,
): Promise<ILooseEditsReading> => {
	const refusal = await integrationCheckoutRefusal(root, env);
	// Outside the guarded checkout, editing is the project's model: say
	// nothing, and do not even run git.
	if (refusal === undefined) return { refusal, paths: [] };
	return { refusal, paths: await porcelainPaths(root) };
};

/** The advisory a reading calls for, or `null` when there is nothing. */
export const looseEditsAdvisoryFor = (
	reading: ILooseEditsReading,
): ICheckpointAdvisory | null => {
	if (reading.refusal === undefined || reading.paths.length === 0) {
		return null;
	}
	const sorted = [...reading.paths].sort();
	const shown = sorted.slice(0, LISTED_PATHS).join(', ');
	const more =
		sorted.length > LISTED_PATHS
			? ` and ${String(sorted.length - LISTED_PATHS)} more`
			: '';
	return {
		triggered: true,
		code: 'LOOSE_EDITS_ON_INTEGRATION',
		severity: 'strong',
		message: `The shared checkout on the integration branch has ${String(sorted.length)} uncommitted change(s): ${shown}${more}.`,
		reason: reading.refusal,
		nextAction:
			'If these are yours, redo them in your own unit (`delendai work enter --proposal=<id> --slice=<id>`, then work in the worktree it prints) and put the shared checkout back as it was. If they are not yours, leave them and tell their owner; never discard another agent’s changes.',
		dedupeKey: `loose-edits:${sorted.join('\n')}`,
	};
};

/**
 * A provider for the checkpoint-advisory channel. Answers synchronously
 * from the last reading and starts a new one when the last is older than
 * the interval.
 */
export const createLooseEditsAdvisory = (
	root: string,
	deps: ILooseEditsAdvisoryDeps = {},
): CheckpointAdvisoryProvider => {
	const env = deps.env ?? process.env;
	const read = deps.read ?? ((at: string) => readLooseEdits(at, env));
	const now = deps.now ?? Date.now;
	const interval = deps.intervalMs ?? REFRESH_INTERVAL_MS;
	let reading: ILooseEditsReading = { refusal: undefined, paths: [] };
	let readAt = Number.NEGATIVE_INFINITY;
	let inFlight = false;
	return () => {
		if (!inFlight && now() - readAt >= interval) {
			inFlight = true;
			readAt = now();
			read(root)
				.then((next) => {
					reading = next;
				})
				.catch(() => {
					// A reading that fails leaves the last one standing.
				})
				.finally(() => {
					inFlight = false;
				});
		}
		return looseEditsAdvisoryFor(reading);
	};
};
