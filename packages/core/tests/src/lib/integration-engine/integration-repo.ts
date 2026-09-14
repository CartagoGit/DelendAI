/**
 * integration-repo.ts — a REAL agent clone and a REAL server repository
 * for the integration-engine specs.
 *
 * These tests are worth nothing against a mocked git. The engine's claims
 * are claims about refs — that a candidate was pushed, that a stale one
 * was replayed onto the head that actually moved, that a merged ref is
 * gone and an unmerged one is still there — and a fake runner would
 * happily "prove" all of them while the real plumbing did the opposite.
 * So every spec builds two actual repositories and inspects both.
 *
 * The "server" is a normal repository whose HEAD points at an unborn
 * branch nobody pushes to. That is deliberate rather than a bare repo:
 * the fake forge has to perform a REAL merge (three-way `read-tree` into
 * a temporary index, then `commit-tree`), and `read-tree -m` requires a
 * work tree. Pushing into it is safe because the branch it has checked
 * out is never a push target.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { createTestWorkspace, removeTestWorkspace } from '../test-workspace';

/** The branch the specs integrate into — the policy's, not the forge's. */
export const INTEGRATION_BRANCH = 'develop';
/** The remote the agent clone pushes through. */
export const REMOTE = 'origin';

/** Run git somewhere with a fixed identity and no user hooks. */
const gitIn =
	(cwd: string) =>
	(...args: readonly string[]): string =>
		execFileSync('git', [...args], {
			cwd,
			encoding: 'utf8',
			env: {
				...process.env,
				GIT_AUTHOR_NAME: 'Test',
				GIT_AUTHOR_EMAIL: 'test@example.com',
				GIT_COMMITTER_NAME: 'Test',
				GIT_COMMITTER_EMAIL: 'test@example.com',
			},
		}).trim();

/** An agent clone plus the server it pushes to. */
export interface IIntegrationTestRepo {
	/** The agent's working clone — where the WIP engine operates. */
	readonly dir: string;
	/** The server repository the forge reads and merges in. */
	readonly serverDir: string;
	readonly git: (...args: readonly string[]) => string;
	readonly server: (...args: readonly string[]) => string;
	readonly write: (path: string, content: string) => void;
	/** Stage + commit everything in the clone; returns the sha. */
	readonly commitAll: (message: string) => string;
	/** Tip of a server branch, or `''` when it does not exist. */
	readonly serverHead: (branch?: string) => string;
	/** Local sha of a fully-qualified ref, or `''` when absent. */
	readonly localRef: (ref: string) => string;
	/** HEAD's commit and branch — asserted untouched by every spec. */
	readonly headState: () => {
		readonly commit: string;
		readonly branch: string;
	};
	readonly cleanup: () => void;
}

const configure = (git: (...args: readonly string[]) => string): void => {
	git('config', 'user.name', 'Test');
	git('config', 'user.email', 'test@example.com');
	git('config', 'commit.gpgsign', 'false');
};

export const createIntegrationTestRepo = (): IIntegrationTestRepo => {
	const serverDir = createTestWorkspace('delendai-integration-server-');
	const dir = createTestWorkspace('delendai-integration-clone-');
	const server = gitIn(serverDir);
	const git = gitIn(dir);

	server('init', '--quiet', '--initial-branch', '__server__', '.');
	configure(server);
	server('config', 'receive.denyCurrentBranch', 'ignore');

	git('init', '--quiet', '--initial-branch', INTEGRATION_BRANCH);
	configure(git);
	git('config', 'core.hooksPath', join(dir, '.no-hooks'));
	git('remote', 'add', REMOTE, serverDir);

	const write = (path: string, content: string): void => {
		mkdirSync(dirname(join(dir, path)), { recursive: true });
		writeFileSync(join(dir, path), content, 'utf8');
	};
	const commitAll = (message: string): string => {
		git('add', '-A');
		git('commit', '--quiet', '--no-verify', '-m', message);
		return git('rev-parse', 'HEAD');
	};

	write('README.md', '# base\n');
	commitAll('base');
	git('push', '--quiet', REMOTE, INTEGRATION_BRANCH);

	const revision = (
		run: (...args: readonly string[]) => string,
		ref: string,
	): string => {
		try {
			return run('rev-parse', '--verify', `${ref}^{commit}`);
		} catch {
			return '';
		}
	};

	return {
		dir,
		serverDir,
		git,
		server,
		write,
		commitAll,
		serverHead: (branch = INTEGRATION_BRANCH) =>
			revision(server, `refs/heads/${branch}`),
		localRef: (ref) => revision(git, ref),
		headState: () => ({
			commit: git('rev-parse', 'HEAD'),
			branch: git('rev-parse', '--abbrev-ref', 'HEAD'),
		}),
		cleanup: () => {
			removeTestWorkspace(dir);
			removeTestWorkspace(serverDir);
		},
	};
};

/** Paths a commit's tree contains, sorted. */
export const serverTreePaths = (
	repo: IIntegrationTestRepo,
	revision: string,
): readonly string[] =>
	repo
		.server('ls-tree', '-r', '--name-only', revision)
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.length > 0)
		.sort();

/**
 * Advance the integration branch behind the engine's back, the way
 * another agent's merge would. Used by the strict-latest and
 * compare-and-swap specs, where the whole question is what happens when
 * the head moves under a candidate that was already validated.
 */
export const advanceIntegration = (
	repo: IIntegrationTestRepo,
	message = 'someone else landed work',
): string => {
	const head = repo.serverHead();
	const tree = repo.server('rev-parse', `${head}^{tree}`);
	const commit = repo.server('commit-tree', tree, '-p', head, '-m', message);
	repo.server('update-ref', `refs/heads/${INTEGRATION_BRANCH}`, commit, head);
	return commit;
};
