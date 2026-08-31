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

const runValidateChain = async (): Promise<number> =>
	new Promise((resolve) => {
		const child = spawn('bun', ['run', VALIDATE_RUN_SCRIPT], {
			stdio: 'inherit',
			// The chain is a package script; run it from the repo root so
			// nested `bun run` steps resolve the same manifest.
			cwd: process.cwd(),
		});
		child.on('error', () => resolve(1));
		child.on('close', (code, signal) => {
			// A signalled child has no exit code. Treat it as a failure so
			// an interrupted run never journals a `pass`.
			resolve(signal !== null ? 1 : (code ?? 1));
		});
	});

export const main = async (): Promise<number> => {
	const workspaceRoot = process.cwd();
	const exitCode = await runValidateChain();
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
