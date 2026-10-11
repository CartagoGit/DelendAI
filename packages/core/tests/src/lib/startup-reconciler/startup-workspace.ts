/**
 * startup-workspace.ts — real git for the startup-reconciler specs.
 *
 * The reconciler's central claim is about GIT and about STATE: that a
 * machine which has never seen this workspace can rebuild its work model
 * out of refs it fetches, and that a machine which has seen it does not
 * redo the work. Neither claim can be tested against a mocked runner —
 * a fake `for-each-ref` would happily "prove" a rebuild that the real
 * plumbing never performed.
 *
 * So these helpers build an actual bare origin, actual clones, and actual
 * `wip/*` refs written by the SHIPPED WIP engine (not by hand), which is
 * also how the specs stay honest about the ref shape the engine really
 * produces.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import {
	createWipEngine,
	UNANCHORED,
} from '@delendai/core/lib/wip-engine/index';
import { createStartupGitSeam } from '@delendai/core/lib/startup-reconciler/index';
import type {
	IGitRunner,
	IGitRunResult,
} from '@delendai/core/lib/contracts/interfaces/git-runner.interface';

import { createTestWorkspace, removeTestWorkspace } from '../test-workspace';

/** The branch every startup spec treats as the integration branch. */
export const INTEGRATION_BRANCH = 'develop';

const GIT_ENV = {
	GIT_AUTHOR_NAME: 'Test',
	GIT_AUTHOR_EMAIL: 'test@example.com',
	GIT_COMMITTER_NAME: 'Test',
	GIT_COMMITTER_EMAIL: 'test@example.com',
	GIT_CONFIG_GLOBAL: '/dev/null',
	GIT_CONFIG_SYSTEM: '/dev/null',
} as const;

/** Run git in a directory; throws on failure (specs want the stack). */
export const git = (cwd: string, ...args: readonly string[]): string =>
	execFileSync('git', [...args], {
		cwd,
		encoding: 'utf8',
		env: { ...process.env, ...GIT_ENV },
	}).trim();

/** A real `IGitRunner` bound to a directory — never throws. */
export const runnerFor =
	(cwd: string): IGitRunner =>
	async (args: readonly string[]): Promise<IGitRunResult> => {
		try {
			return {
				ok: true,
				output: execFileSync('git', [...args], {
					cwd,
					encoding: 'utf8',
					env: { ...process.env, ...GIT_ENV },
					stdio: ['ignore', 'pipe', 'pipe'],
				}),
			};
		} catch (error) {
			return {
				ok: false,
				output: '',
				reason: error instanceof Error ? error.message : 'git failed',
			};
		}
	};

/** A clone plus the helpers a spec needs against it. */
export interface IStartupClone {
	readonly dir: string;
	readonly git: (...args: readonly string[]) => string;
	readonly seam: ReturnType<typeof createStartupGitSeam>;
	readonly write: (path: string, content: string) => void;
	/** Write a work ref through the real WIP engine. Returns its SHA. */
	readonly checkpoint: (request: {
		readonly ref: string;
		readonly paths: readonly string[];
		readonly message: string;
	}) => Promise<string>;
	readonly push: (...refspecs: readonly string[]) => string;
}

/** An origin plus every clone made from it, cleaned up together. */
export interface IStartupOrigin {
	readonly dir: string;
	readonly clone: (name: string) => IStartupClone;
	readonly cleanup: () => void;
}

const writeFile = (dir: string, path: string, content: string): void => {
	mkdirSync(dirname(join(dir, path)), { recursive: true });
	writeFileSync(join(dir, path), content, 'utf8');
};

const configure = (dir: string): void => {
	git(dir, 'config', 'user.name', 'Test');
	git(dir, 'config', 'user.email', 'test@example.com');
	git(dir, 'config', 'commit.gpgsign', 'false');
	git(dir, 'config', 'core.hooksPath', join(dir, '.no-hooks'));
};

/**
 * A bare origin with one commit on the integration branch — the shared
 * remote both "machines" in the laptop/office scenario talk to.
 */
export const createStartupOrigin = (): IStartupOrigin => {
	const root = createTestWorkspace('delendai-startup-');
	const originDir = join(root, 'origin.git');
	const seedDir = join(root, 'seed');
	mkdirSync(originDir, { recursive: true });
	mkdirSync(seedDir, { recursive: true });
	git(
		originDir,
		'init',
		'--quiet',
		'--bare',
		'--initial-branch',
		INTEGRATION_BRANCH,
	);
	git(seedDir, 'init', '--quiet', '--initial-branch', INTEGRATION_BRANCH);
	configure(seedDir);
	writeFile(seedDir, 'src/alpha.ts', 'export const alpha = 1;\n');
	writeFile(seedDir, 'src/beta.ts', 'export const beta = 1;\n');
	git(seedDir, 'add', '-A');
	git(seedDir, 'commit', '--quiet', '--no-verify', '-m', 'base');
	git(seedDir, 'remote', 'add', 'origin', originDir);
	git(seedDir, 'push', '--quiet', 'origin', INTEGRATION_BRANCH);

	const clone = (name: string): IStartupClone => {
		const dir = join(root, name);
		git(root, 'clone', '--quiet', originDir, dir);
		configure(dir);
		const seam = createStartupGitSeam(runnerFor(dir));
		return {
			dir,
			git: (...args: readonly string[]) => git(dir, ...args),
			seam,
			write: (path: string, content: string) =>
				writeFile(dir, path, content),
			checkpoint: async (request): Promise<string> => {
				// This helper drives arbitrary temp repositories, so it states the
				// anchor as "not required" deliberately rather than by omission.
				const engine = await createWipEngine(dir, UNANCHORED);
				if (engine === undefined) throw new Error('no wip engine');
				const base = git(dir, 'rev-parse', 'HEAD');
				const result = await engine.createOrUpdateWipRef({
					baseSha: base,
					paths: request.paths,
					ref: request.ref,
					message: request.message,
					author: { name: 'Agent', email: 'agent@example.com' },
				});
				if (result.status === 'failed') {
					throw new Error(result.reason ?? 'checkpoint failed');
				}
				return result.commit;
			},
			push: (...refspecs: readonly string[]) =>
				git(dir, 'push', '--quiet', 'origin', ...refspecs),
		};
	};

	return {
		dir: originDir,
		clone,
		cleanup: () => removeTestWorkspace(root),
	};
};
