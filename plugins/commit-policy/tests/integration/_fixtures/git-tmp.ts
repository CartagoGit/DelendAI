import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { createWriteGitRunner, type IGitRunner } from '@delendai/core/public';

const execFileAsync = promisify(execFile);

export interface ITempGitRepo {
	readonly cwd: string;
	readonly runner: IGitRunner;
	readonly git: (...args: readonly string[]) => Promise<string>;
	readonly cleanup: () => Promise<void>;
	readonly readHead: () => Promise<string>;
	readonly logCount: () => Promise<number>;
	readonly stagedSet: () => Promise<string[]>;
}

export interface ICreateTempGitRepoOptions {
	readonly branch?: string;
	readonly userName?: string;
	readonly userEmail?: string;
	readonly seedFile?: string;
	readonly seedContents?: string;
	readonly seedCommitMessage?: string;
	readonly prefix?: string;
}

const runGit = async (
	cwd: string,
	args: readonly string[],
): Promise<string> => {
	const { stdout } = await execFileAsync('git', [...args], {
		cwd,
		encoding: 'utf8',
	});
	return stdout.trim();
};

export const createTempGitRepo = async (
	options: ICreateTempGitRepoOptions = {},
): Promise<ITempGitRepo> => {
	const {
		branch = 'develop',
		userName = 'CI',
		userEmail = 'ci@delendai',
		seedFile = 'README.md',
		seedContents = '# init\n',
		seedCommitMessage = 'chore: init',
		prefix = 'commit-policy-real-git-',
	} = options;
	const cwd = await mkdtemp(join(tmpdir(), prefix));

	try {
		await runGit(cwd, ['init', '-q', '-b', branch]);
		await runGit(cwd, ['config', 'user.email', userEmail]);
		await runGit(cwd, ['config', 'user.name', userName]);
		await writeFile(join(cwd, seedFile), seedContents, 'utf8');
		await runGit(cwd, ['add', '--', seedFile]);
		await runGit(cwd, ['commit', '-q', '-m', seedCommitMessage]);

		return {
			cwd,
			runner: createWriteGitRunner(cwd),
			git: (...args: readonly string[]) => runGit(cwd, args),
			cleanup: () => rm(cwd, { recursive: true, force: true }),
			readHead: () => runGit(cwd, ['rev-parse', 'HEAD']),
			logCount: async () => {
				const count = await runGit(cwd, [
					'rev-list',
					'--count',
					'HEAD',
				]);
				return Number.parseInt(count, 10);
			},
			stagedSet: async () => {
				const output = await runGit(cwd, [
					'diff',
					'--cached',
					'--name-only',
				]);
				return output
					.split('\n')
					.map((line) => line.trim())
					.filter((line) => line.length > 0);
			},
		};
	} catch (error) {
		await rm(cwd, { recursive: true, force: true });
		throw error;
	}
};
