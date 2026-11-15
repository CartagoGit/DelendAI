/**
 * integration-rehearsal-setup.helper.ts — runs the policy's rehearsal setup
 * command in a temporary worktree of the commit under test, with the
 * rehearsal's files written over it, and returns every file the command
 * changed, so the setup commit carries them.
 */
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';

import type {
	IRehearsalFileChange,
	IRehearsalSetupMaterialiser,
} from '@delendai/integration/public';

import type { IProgramRunner } from '../contracts/interfaces/program-runner.interface';

const execFileAsync = promisify(execFile);
const MAX_OUTPUT_BYTES = 16 * 1024 * 1024;
const SHELL = '/bin/bash';
const NUL = '\0';

const runProgram: IProgramRunner = async (program, args, cwd) =>
	(
		await execFileAsync(program, [...args], {
			cwd,
			maxBuffer: MAX_OUTPUT_BYTES,
		})
	).stdout;

const failureText = (error: unknown): string => {
	const printed = error as { stderr?: unknown; stdout?: unknown };
	const text = [printed.stderr, printed.stdout]
		.filter((part): part is string => typeof part === 'string')
		.join('')
		.trim();
	return text === ''
		? error instanceof Error
			? error.message
			: String(error)
		: text;
};

const lines = (output: string): readonly string[] =>
	output.split(NUL).filter((entry) => entry !== '');

/** What the command changed after `git add -A`: modified or deleted tracked files, and files it created. */
const changedPaths = async (
	run: IProgramRunner,
	dir: string,
): Promise<readonly string[]> => [
	...new Set([
		...lines(await run('git', ['diff', '--name-only', '-z'], dir)),
		...lines(
			await run(
				'git',
				['ls-files', '--others', '--exclude-standard', '-z'],
				dir,
			),
		),
	]),
];

const contentAt = async (
	dir: string,
	path: string,
): Promise<IRehearsalFileChange> => {
	try {
		return { path, content: await readFile(join(dir, path), 'utf8') };
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT')
			return { path, content: null };
		throw error;
	}
};

/** The materialiser over a checkout's repository and the commit under test; `run` is the one seam. */
export const createSetupMaterialiser =
	(
		cwd: string,
		baseCommit: string,
		run: IProgramRunner = runProgram,
	): IRehearsalSetupMaterialiser =>
	async (command, files) => {
		const dir = await mkdtemp(join(tmpdir(), 'rehearsal-setup-'));
		let attached = false;
		try {
			await run(
				'git',
				['worktree', 'add', '--detach', dir, baseCommit],
				cwd,
			);
			attached = true;
			for (const file of files) {
				const target = join(dir, file.path);
				if (file.content === null) await rm(target, { force: true });
				else {
					await mkdir(dirname(target), { recursive: true });
					await writeFile(target, file.content);
				}
			}
			// What the rehearsal wrote is the starting point; only the command's own changes are reported.
			await run('git', ['add', '-A'], dir);
			try {
				await run(SHELL, ['-c', command], dir);
			} catch (error) {
				throw new Error(
					`the rehearsal setup command \`${command}\` failed: ${failureText(error)}`,
				);
			}
			return await Promise.all(
				(await changedPaths(run, dir)).map((path) =>
					contentAt(dir, path),
				),
			);
		} finally {
			if (attached)
				await run(
					'git',
					['worktree', 'remove', '--force', dir],
					cwd,
				).catch(() => undefined);
			await rm(dir, { recursive: true, force: true });
		}
	};
