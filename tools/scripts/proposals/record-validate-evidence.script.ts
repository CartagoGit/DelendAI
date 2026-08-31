#!/usr/bin/env bun
/**
 * Run the repository validation chain and journal its outcome.
 *
 * `close_slice` and `proposal_transition` both refuse to act without
 * *fresh validate evidence* (`resolveRecentValidateEvidence` in
 * `plugins/proposals/src/lib/tools/proposal-transition.tool.ts`). That
 * resolver reads `.cache/mcp-vertex/results/logs/validate.jsonl` — a
 * journal that, until this script existed, **nothing ever wrote**. The
 * gate was therefore only satisfiable by an agent hand-crafting a
 * `validateEvidence` argument, which is exactly the shape of evidence a
 * gate is supposed to make unnecessary: unverifiable, and trivially
 * wrong when `bun run validate` is actually red.
 *
 * Wrapping the chain closes that loop honestly:
 *
 *   bun run validate  →  bun run validate:run  →  journal the exit code
 *
 * A passing run writes `result: "pass"`, so the next `close_slice` /
 * `proposal_transition` finds real evidence with no extra arguments. A
 * failing run writes `result: "fail"`, which the reader ignores, so a
 * red tree keeps the proposal-closing tools blocked — the intended
 * behaviour, now driven by a recorded fact instead of an assertion.
 *
 * The script is transparent: stdio is inherited and the child's exit
 * code is propagated verbatim, so `bun run validate` behaves exactly as
 * it did before for every existing caller (CI, lefthook, humans).
 */
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

import {
	SafeWorkspaceReader,
	withFileMutex,
	writeFileAtomic,
} from '@mcp-vertex/core/public';

/**
 * Kept byte-identical to `VALIDATE_LOG_RELATIVE_PATH` in
 * `plugins/proposals/src/lib/contracts/constants/proposal-paths.constant.ts`.
 * `record-validate-evidence.script.spec.ts` asserts the two agree, so a
 * move of the reader's constant fails the suite instead of silently
 * orphaning the writer again.
 */
export const VALIDATE_JOURNAL_RELATIVE_PATH = join(
	'.cache',
	'mcp-vertex',
	'results',
	'logs',
	'validate.jsonl',
);

/** The chain this wrapper delegates to. */
export const VALIDATE_RUN_SCRIPT = 'validate:run';

export interface IValidateJournalEntry {
	readonly result: 'pass' | 'fail';
	readonly timestamp: string;
	readonly exitCode: number;
	readonly logPath: string;
	readonly command: string;
}

export interface IValidateJournalDeps {
	readonly ensureDir: (path: string) => Promise<void>;
	readonly readText: (path: string) => Promise<string>;
	readonly writeText: (path: string, text: string) => Promise<void>;
	readonly withLock?: <T>(path: string, work: () => Promise<T>) => Promise<T>;
}

/**
 * Derive the journal entry for a finished run. Pure, so the spec can
 * assert the exit-code → `result` mapping without touching the disk.
 */
export const buildValidateJournalEntry = (input: {
	readonly exitCode: number;
	readonly timestamp: string;
	readonly logPath: string;
	readonly command?: string;
}): IValidateJournalEntry => ({
	result: input.exitCode === 0 ? 'pass' : 'fail',
	timestamp: input.timestamp,
	exitCode: input.exitCode,
	logPath: input.logPath,
	command: input.command ?? `bun run ${VALIDATE_RUN_SCRIPT}`,
});

const createDeps = (): IValidateJournalDeps => ({
	ensureDir: async (path) => {
		await mkdir(path, { recursive: true });
	},
	readText: async (path) =>
		new SafeWorkspaceReader(dirname(path))
			.readText(basename(path))
			.then((value) => value.content)
			.catch((error: unknown) => {
				if (
					error &&
					typeof error === 'object' &&
					'code' in error &&
					error.code === 'ENOENT'
				) {
					return '';
				}
				throw error;
			}),
	writeText: async (path, text) => {
		await writeFileAtomic(path, text);
	},
	withLock: async (path, work) => withFileMutex(path, work),
});

/**
 * Append one entry to the journal. Read-modify-write under the same file
 * mutex the proposals plugin uses, so a concurrent agent's run cannot
 * truncate another's line.
 */
export const appendValidateJournalEntry = async (input: {
	readonly workspaceRoot: string;
	readonly entry: IValidateJournalEntry;
	readonly deps?: IValidateJournalDeps;
}): Promise<string> => {
	const deps = input.deps ?? createDeps();
	const path = join(input.workspaceRoot, VALIDATE_JOURNAL_RELATIVE_PATH);
	const write = async () => {
		const existing = await deps.readText(path);
		const prefix =
			existing === '' || existing.endsWith('\n')
				? existing
				: `${existing}\n`;
		await deps.writeText(path, `${prefix}${JSON.stringify(input.entry)}\n`);
	};
	await deps.ensureDir(dirname(path));
	if (deps.withLock !== undefined) {
		await deps.withLock(path, write);
	} else {
		await write();
	}
	return path;
};

export interface IValidateStepResult {
	readonly step: string;
	readonly exitCode: number;
	readonly durationMs: number;
}

/**
 * The steps `validate:run` chains together, in order.
 *
 * The `&&`-chain in package.json stays the single declaration of what
 * validate is; this just reads it as a list so the runner can execute
 * every step instead of stopping at the first failure. Anything that is
 * not a plain `bun run <script>` is kept verbatim and executed through
 * the shell.
 */
export const parseValidateSteps = (chain: string): readonly string[] =>
	chain
		.split('&&')
		.map((step) => step.trim())
		.filter((step) => step.length > 0);

export const readValidateSteps = async (
	workspaceRoot: string,
): Promise<readonly string[]> => {
	const raw = await new SafeWorkspaceReader(workspaceRoot)
		.readText('package.json')
		.then((value) => value.content);
	const manifest = JSON.parse(raw) as {
		scripts?: Record<string, string>;
	};
	const chain = manifest.scripts?.[VALIDATE_RUN_SCRIPT];
	if (typeof chain !== 'string' || chain.trim() === '') {
		throw new Error(
			`package.json has no "${VALIDATE_RUN_SCRIPT}" script to run`,
		);
	}
	return parseValidateSteps(chain);
};

const runShellStep = async (step: string): Promise<number> =>
	new Promise((resolve) => {
		const child = spawn(step, {
			stdio: 'inherit',
			shell: true,
			// The steps are package scripts; run them from the repo root so
			// nested `bun run` calls resolve the same manifest.
			cwd: process.cwd(),
		});
		child.on('error', () => resolve(1));
		child.on('close', (code, signal) => {
			// A signalled child has no exit code. Treat it as a failure so
			// an interrupted run never journals a `pass`.
			resolve(signal !== null ? 1 : (code ?? 1));
		});
	});

/**
 * Run every step and collect the failures.
 *
 * The chain used to be executed as one `&&` expression, so a run
 * reported exactly ONE broken thing and you had to spend another full
 * pass (~10 minutes here) to discover the next one. Twelve passes to
 * clear twelve independent breakages is not a gate, it is a queue. Every
 * step is independent — they are all checks — so running all of them
 * turns that queue into a single report.
 *
 * `--fail-fast` restores the old stop-at-first-failure behaviour for
 * callers that want the quickest possible red (CI smoke jobs, say).
 */
export const runValidateSteps = async (
	steps: readonly string[],
	options: { readonly failFast?: boolean } = {},
): Promise<readonly IValidateStepResult[]> => {
	const results: IValidateStepResult[] = [];
	for (const step of steps) {
		const startedAt = Date.now();
		const exitCode = await runShellStep(step);
		results.push({ step, exitCode, durationMs: Date.now() - startedAt });
		if (exitCode !== 0 && options.failFast === true) break;
	}
	return results;
};

export const formatValidateSummary = (
	results: readonly IValidateStepResult[],
): string => {
	const failures = results.filter((entry) => entry.exitCode !== 0);
	if (failures.length === 0) {
		return `[validate] ${results.length}/${results.length} steps passed.`;
	}
	return [
		`[validate] ${failures.length} of ${results.length} steps FAILED:`,
		...failures.map(
			(entry) => `  ✗ ${entry.step} (exit ${entry.exitCode})`,
		),
		'',
		'Fix these together — the runner no longer stops at the first one,',
		'so this list is the complete set of blockers for this snapshot.',
	].join('\n');
};

export const main = async (
	argv: readonly string[] = process.argv.slice(2),
): Promise<number> => {
	const workspaceRoot = process.cwd();
	const failFast =
		argv.includes('--fail-fast') ||
		process.env.MCP_VERTEX_VALIDATE_FAIL_FAST === '1';
	const steps = await readValidateSteps(workspaceRoot);
	const results = await runValidateSteps(steps, { failFast });
	const exitCode = results.some((entry) => entry.exitCode !== 0) ? 1 : 0;
	console.log(formatValidateSummary(results));
	const path = await appendValidateJournalEntry({
		workspaceRoot,
		entry: buildValidateJournalEntry({
			exitCode,
			timestamp: new Date().toISOString(),
			logPath: join(workspaceRoot, VALIDATE_JOURNAL_RELATIVE_PATH),
		}),
	});
	console.log(
		exitCode === 0
			? `[validate] pass — evidence journalled to ${path}`
			: `[validate] fail (exit ${exitCode}) — recorded to ${path}; proposal_transition and close_slice stay blocked until validate is green`,
	);
	return exitCode;
};

if (import.meta.main) {
	process.exit(await main());
}
