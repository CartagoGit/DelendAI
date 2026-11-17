import { execFile, execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { createWriteGitRunner } from '@delendai/core/public';
import { createSharedGitFixture } from '@delendai/test-kit';
import type { IGitRunner } from '@delendai/core/contracts';

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

/** One seeded repository per distinct seed, built once per worker. */
const fixtures = new Map<string, { readonly copy: () => string }>();

const fixtureFor = (seed: {
	readonly branch: string;
	readonly userName: string;
	readonly userEmail: string;
	readonly seedFile: string;
	readonly seedContents: string;
	readonly seedCommitMessage: string;
}): { readonly copy: () => string } => {
	const key = JSON.stringify(seed);
	const known = fixtures.get(key);
	if (known !== undefined) return known;
	const made = createSharedGitFixture((cwd) => {
		const git = (...args: string[]): void => {
			execFileSync('git', args, { cwd, stdio: 'ignore' });
		};
		git('init', '-q', '-b', seed.branch);
		git('config', 'user.email', seed.userEmail);
		git('config', 'user.name', seed.userName);
		writeFileSync(join(cwd, seed.seedFile), seed.seedContents, 'utf8');
		git('add', '--', seed.seedFile);
		git('commit', '-q', '-m', seed.seedCommitMessage);
	});
	fixtures.set(key, made);
	return made;
};

/**
 * A seeded repository, copied from one built once per worker for the same
 * seed: built per call it was five git processes. `prefix` no longer names
 * the directory; it is kept so callers need not change.
 */
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
	} = options;
	const cwd = fixtureFor({
		branch,
		userName,
		userEmail,
		seedFile,
		seedContents,
		seedCommitMessage,
	}).copy();

	try {
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
