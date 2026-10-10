#!/usr/bin/env bun
/**
 * release-pr-gate.script.ts — f00395 S2.
 *
 * Pre-push gate for branches targeting `main` or `release/*`.
 * When the pushed refs touch that surface, the gate enforces:
 *   1. last commit follows Conventional Commits;
 *   2. `bun run typecheck` passes;
 *   3. `bun run lint` passes.
 *
 * Deletes (all-zero local SHA) are ignored. Any other push that does not
 * touch `main` / `release/*` is a no-op.
 */
import { spawnSync } from 'node:child_process';

import {
	lintCommitMessage,
	readLastCommitMessage,
} from './commit-msg-conventional.script';
import {
	parsePrePushStdin,
	type IPrePushRefUpdate,
} from './push-to-develop-discipline.script';

export const RELEASE_PREFIX = 'release/';
export const MAIN = 'main';

const REFS_HEADS_PREFIX = 'refs/heads/';

export interface IReleaseGateOptions {
	readonly readStdin?: () => Promise<string>;
	readonly readLastCommit?: () => string | null;
	readonly runStep?: (label: 'typecheck' | 'lint') => number;
	readonly nowISO?: () => string;
}

export interface IReleaseGateDecision {
	readonly ok: boolean;
	readonly blockers: readonly string[];
	readonly inspectedRefs: readonly string[];
}

const stripRefs = (ref: string): string =>
	ref.startsWith(REFS_HEADS_PREFIX)
		? ref.slice(REFS_HEADS_PREFIX.length)
		: ref;

const isReleaseOrMain = (branch: string): boolean =>
	branch === MAIN || branch.startsWith(RELEASE_PREFIX);

const isDeleteUpdate = (update: IPrePushRefUpdate): boolean =>
	/^0+$/.test(update.localSha);

const involvesReleaseOrMain = (update: IPrePushRefUpdate): boolean => {
	const local = stripRefs(update.localRef);
	const remote = stripRefs(update.remoteRef);
	return isReleaseOrMain(local) || isReleaseOrMain(remote);
};

const defaultRunStep = (label: 'typecheck' | 'lint'): number => {
	const proc = spawnSync('bun', ['run', label], { stdio: 'inherit' });
	return proc.status ?? 1;
};

const defaultReadStdin = async (): Promise<string> => {
	if (process.stdin.isTTY) return '';
	const chunks: Buffer[] = [];
	for await (const chunk of process.stdin) {
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	}
	return Buffer.concat(chunks).toString('utf8');
};

const stepFailureBlockers = (
	label: 'typecheck' | 'lint',
	status: number,
): string[] => [
	`bun run ${label} failed (exit ${status}).`,
	'',
	'next-action:',
	`  run bun run ${label} locally, fix the reported errors, then push again.`,
];

/** Decide, with injected side effects only, whether the release gate passes. */
export const decideReleaseGate = (
	updates: readonly IPrePushRefUpdate[],
	lastCommitMessage: string | null,
	options: IReleaseGateOptions = {},
): IReleaseGateDecision => {
	const inspected = updates
		.filter((update) => !isDeleteUpdate(update))
		.filter(involvesReleaseOrMain);

	if (inspected.length === 0) {
		return { ok: true, blockers: [], inspectedRefs: [] };
	}

	if (lastCommitMessage === null) {
		return {
			ok: false,
			blockers: [
				'could not read the last commit message (HEAD has no commits).',
				'',
				'next-action:',
				'  create at least one commit on this branch, then push again.',
			],
			inspectedRefs: inspected.map(
				(update) =>
					`${stripRefs(update.localRef)}->${stripRefs(update.remoteRef)}`,
			),
		};
	}

	const commitResult = lintCommitMessage(lastCommitMessage);
	if (!commitResult.ok) {
		return {
			ok: false,
			blockers: commitResult.blockers.map((line) =>
				line === '' || line === 'next-action:'
					? line
					: `commit-msg: ${line}`,
			),
			inspectedRefs: inspected.map(
				(update) =>
					`${stripRefs(update.localRef)}->${stripRefs(update.remoteRef)}`,
			),
		};
	}

	const runStep = options.runStep ?? defaultRunStep;
	const blockers: string[] = [];
	for (const label of ['typecheck', 'lint'] as const) {
		const status = runStep(label);
		if (status !== 0) {
			blockers.push(...stepFailureBlockers(label, status));
		}
	}

	return {
		ok: blockers.length === 0,
		blockers,
		inspectedRefs: inspected.map(
			(update) =>
				`${stripRefs(update.localRef)}->${stripRefs(update.remoteRef)}`,
		),
	};
};

const formatReport = (decision: IReleaseGateDecision): string => {
	if (decision.ok) {
		return `✓ release-pr-gate: ok (${decision.inspectedRefs.length} ref(s))\n`;
	}
	return ['✗ release-pr-gate: blocked', '', ...decision.blockers, ''].join(
		'\n',
	);
};

export const main = async (
	argv: readonly string[] = process.argv.slice(2),
	options: IReleaseGateOptions = {},
): Promise<number> => {
	void argv;
	const stdin = options.readStdin
		? await options.readStdin()
		: await defaultReadStdin();
	const updates = parsePrePushStdin(stdin);
	const lastCommit = options.readLastCommit
		? options.readLastCommit()
		: readLastCommitMessage(process.cwd());
	const decision = decideReleaseGate(updates, lastCommit, {
		...(options.runStep ? { runStep: options.runStep } : {}),
		...(options.nowISO ? { nowISO: options.nowISO } : {}),
	});
	const report = formatReport(decision);
	if (decision.ok) {
		process.stdout.write(report);
		return 0;
	}
	process.stderr.write(report);
	return 1;
};

if (import.meta.main) {
	process.exit(await main());
}
