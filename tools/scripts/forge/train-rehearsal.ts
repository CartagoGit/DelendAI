/**
 * train-rehearsal.ts — a train is rehearsed before the machinery that
 * builds it ships.
 *
 * On 2026-11-08 the merge train failed in production five times in a row,
 * one layer at a time: the forge ruleset refused its refs, then the
 * pre-push guard, then the post-merge refresh committed an empty catalog,
 * then the derived files went stale and drift-check refused the push, then
 * commit-branch-discipline refused its CI checkout. Each was found only
 * when the live queue failed. The rehearsal builds a train exactly as
 * `assembleTrain` does, on a scratch worktree, and runs on it every gate
 * its run and its push will meet, reporting all failures in one pass.
 */
import { spawn } from 'node:child_process';

import type {
	IRehearsalGate,
	IRehearsalResult,
} from './train-rehearsal.interface';

/** Git's null object name: the remote side of a ref that does not exist yet. */
export const NULL_OID = '0'.repeat(40);

/**
 * The paths whose change alters how a train is built, pushed or judged: a
 * change to any of them runs the rehearsal in its proof.
 */
const INTEGRATION_MACHINERY: readonly RegExp[] = [
	/^tools\/scripts\/forge\//u,
	/^tools\/scripts\/ci\//u,
	/^tools\/scripts\/hooks\//u,
	/^tools\/scripts\/lint\/(commit-branch|push-to-develop|publication-proof|no-empty-commits)/u,
	/^packages\/core\/src\/lib\/development-policy\//u,
	/^\.github\/workflows\//u,
	/^lefthook\.yml$/u,
];

/** Whether `changed` touches the integration machinery. */
export const touchesIntegrationMachinery = (
	changed: readonly string[],
): boolean =>
	changed.some((path) =>
		INTEGRATION_MACHINERY.some((pattern) => pattern.test(path)),
	);

/**
 * What git writes to a pre-push hook's stdin for pushing `sha` to the new
 * remote branch `ref`: `<local ref> <local oid> <remote ref> <remote oid>`.
 */
export const prePushStdin = (ref: string, sha: string): string =>
	`refs/heads/${ref} ${sha} refs/heads/${ref} ${NULL_OID}\n`;

const CAUSE_LINE = /✖|\bFAIL\b|\berror\b|\bviolations?\b|\bdrift\b|\brefus/iu;

/** The lines of a failed gate's output that name its cause. Pure. */
export const causesOf = (output: string): readonly string[] =>
	[
		...new Set(
			output
				.split('\n')
				// biome-ignore lint/suspicious/noControlCharactersInRegex: colour codes
				.map((line) => line.replace(/\u001b\[[0-9;]*m/gu, '').trim())
				.filter((line) => CAUSE_LINE.test(line)),
		),
	].slice(0, 4);

/** Run one gate in `cwd`, bounded by `timeoutMs`; it never throws. */
const runGate = (
	gate: IRehearsalGate,
	cwd: string,
	env: NodeJS.ProcessEnv,
	timeoutMs: number,
): Promise<IRehearsalResult> =>
	new Promise((done) => {
		const started = Date.now();
		let output = '';
		const child = spawn('bash', ['-euo', 'pipefail', '-c', gate.script], {
			cwd,
			env,
			stdio: ['pipe', 'pipe', 'pipe'],
			timeout: timeoutMs,
		});
		child.stdout.on('data', (chunk) => {
			output += String(chunk);
		});
		child.stderr.on('data', (chunk) => {
			output += String(chunk);
		});
		child.stdin.on('error', () => undefined);
		child.stdin.end(gate.stdin ?? '');
		child.on('close', (code, signal) => {
			const ok = code === 0;
			done({
				label: gate.label,
				ok,
				seconds: Math.round((Date.now() - started) / 1000),
				causes: ok
					? []
					: signal !== null
						? [
								`killed by ${signal} after ${String(timeoutMs / 1000)}s`,
							]
						: causesOf(output),
			});
		});
	});

/**
 * Run every gate on the assembled train, at most `limit` at once, and
 * return every result: one failure never hides the next.
 */
export const rehearseGates = async (input: {
	readonly gates: readonly IRehearsalGate[];
	readonly cwd: string;
	readonly env: NodeJS.ProcessEnv;
	readonly limit: number;
	readonly timeoutMs: number;
}): Promise<readonly IRehearsalResult[]> => {
	const queue = [...input.gates];
	const results: IRehearsalResult[] = [];
	const worker = async (): Promise<void> => {
		for (let g = queue.shift(); g !== undefined; g = queue.shift()) {
			results.push(
				await runGate(g, input.cwd, input.env, input.timeoutMs),
			);
		}
	};
	await Promise.all(
		Array.from(
			{ length: Math.max(1, Math.min(input.limit, queue.length)) },
			worker,
		),
	);
	return results;
};

/** The report: every failure with its cause, then the verdict. Pure. */
export const reportOf = (
	results: readonly IRehearsalResult[],
	trainRef: string,
): readonly string[] => {
	const failed = results.filter((result) => !result.ok);
	return [
		...results.map(
			(result) =>
				`rehearse-train: ${result.ok ? 'ok  ' : 'FAIL'} ${result.label} (${String(result.seconds)}s)`,
		),
		...failed.flatMap((result) =>
			result.causes.map(
				(cause) => `rehearse-train: why ${result.label}: ${cause}`,
			),
		),
		failed.length === 0
			? `rehearse-train: the train ${trainRef} passes every gate its run and push will meet`
			: `rehearse-train: the train ${trainRef} would fail: ${failed.map((result) => result.label).join(', ')}`,
	];
};
