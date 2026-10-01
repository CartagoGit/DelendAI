/**
 * work-unit-land.service.spec.ts — under a profile that integrates by
 * merge, `work publish` lands the unit, and only a certified one.
 *
 * Driven through `runWorkUnit`, the engine behind both the CLI's `work`
 * command and the MCP `work` tool, against a real repository and a real
 * bare remote: the claims are about which commit the remote integration
 * branch ends up on, and nothing short of real git can show that.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { fakePartial } from '@delendai/test-kit';

import type {
	IWorkUnitContext,
	IWorkUnitResult,
} from '@delendai/core/lib/contracts/interfaces/work-unit-context.interface';
import { runWorkUnit } from '@delendai/core/lib/work-units/work-unit.service';
import { briefWorkModel } from '@delendai/core/lib/development-policy/declare-workflow';
import { deriveCapabilities } from '@delendai/core/lib/development-policy/derive';
import { expandProfile } from '@delendai/core/lib/development-policy/profiles';

const roots: string[] = [];

/** The gate: the candidate tree must say `green` in state.txt. */
const GATE = {
	validationMatrix: {
		scopes: {
			state: [{ command: 'grep -q green state.txt', expect: 'exit0' }],
		},
	},
};

const MERGE = {
	development: {
		profile: 'shared-checkout-merge',
		branches: { namespacePrefix: 'delendai' },
	},
};

const PULL_REQUEST = {
	development: {
		profile: 'shared-checkout-pr',
		branches: { namespacePrefix: 'delendai' },
	},
};

const git = (cwd: string, ...args: string[]): string =>
	execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

const tempDir = (prefix: string): string => {
	const dir = mkdtempSync(join(tmpdir(), prefix));
	roots.push(dir);
	return dir;
};

/** A shared checkout on `trunk`, tracking a bare remote that has it. */
const projectWith = (
	config: object,
	trunk = 'develop',
): { root: string; remote: string } => {
	const root = tempDir('land-');
	const remote = tempDir('land-remote-');
	git(remote, 'init', '-q', '--bare', '-b', trunk);
	git(root, 'init', '-q', '-b', trunk);
	git(root, 'config', 'user.email', 'land@example.com');
	git(root, 'config', 'user.name', 'Land');
	git(root, 'config', 'commit.gpgsign', 'false');
	writeFileSync(join(root, 'README.md'), '# repo\n');
	writeFileSync(join(root, 'state.txt'), 'red\n');
	writeFileSync(join(root, 'delendai.config.json'), JSON.stringify(config));
	git(root, 'add', '-A');
	git(root, 'commit', '-q', '-m', 'base');
	git(root, 'remote', 'add', 'origin', remote);
	git(root, 'push', '-q', '-u', 'origin', trunk);
	return { root, remote };
};

const contextFor = (root: string): IWorkUnitContext =>
	fakePartial<IWorkUnitContext, 'cwd' | 'globals'>({
		cwd: root,
		globals: fakePartial<IWorkUnitContext['globals'], 'workspace' | 'json'>(
			{ workspace: root, json: true },
		),
	});

const UNIT = [
	'--proposal=x00553',
	'--slice=S1',
	'--agent=claude-opus-5',
	'--topic=probe',
];
const WORK_REF =
	'refs/heads/delendai/wip/claude-opus-5/implement/x00553-S1-g1/probe';

/** Checkpoint `files` to the unit's work ref from the shared checkout. */
const checkpoint = async (
	root: string,
	files: Readonly<Record<string, string>>,
): Promise<void> => {
	for (const [path, content] of Object.entries(files)) {
		writeFileSync(join(root, path), content);
	}
	const result = await runWorkUnit(
		[
			'checkpoint',
			...UNIT,
			`--paths=${Object.keys(files).join(',')}`,
			'--message=feat: the unit',
		],
		contextFor(root),
	);
	expect(result.code).toBe(0);
	// The shared checkout carries nothing of the unit: only its ref does.
	git(root, 'checkout', '--', ...Object.keys(files));
};

const publish = (
	root: string,
	extra: readonly string[] = [],
): Promise<IWorkUnitResult> =>
	runWorkUnit(['publish', ...UNIT, ...extra], contextFor(root));

const remoteDevelop = (remote: string, trunk = 'develop'): string =>
	git(remote, 'rev-parse', `refs/heads/${trunk}`);

const workRefExists = (root: string): boolean => {
	try {
		git(root, 'rev-parse', '-q', '--verify', WORK_REF);
		return true;
	} catch {
		return false;
	}
};

afterEach(() => {
	for (const dir of roots.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

describe('work publish under shared-checkout-merge', () => {
	it('is the route the served work model tells an agent to take', () => {
		// What an agent is told and what these cases drive are the same
		// command: `publish` is the subcommand every case below runs.
		const told = briefWorkModel(
			deriveCapabilities(expandProfile('shared-checkout-merge')),
		).land;
		expect(told).toContain('`delendai work publish --proposal=<id>');
		expect(told).toContain('opens no pull request');
	});

	it('lands nothing when the gate fails, and keeps the work', async () => {
		const { root, remote } = projectWith({ ...MERGE, ...GATE });
		const before = remoteDevelop(remote);
		await checkpoint(root, { 'state.txt': 'still red\n' });

		const result = await publish(root);

		expect(result.code).not.toBe(0);
		expect(result.error).toContain('validation gate failed');
		expect(result.error).toContain('grep -q green state.txt');
		expect(result.error).toContain('publish again');
		expect(result.data).toMatchObject({
			landed: false,
			landing: { status: 'blocked' },
			certification: { declared: true, passed: false },
		});
		expect(remoteDevelop(remote)).toBe(before);
		expect(workRefExists(root)).toBe(true);
	});

	it('merges into the integration branch when the gate passes, and ends the work ref', async () => {
		const { root, remote } = projectWith({ ...MERGE, ...GATE });
		const before = remoteDevelop(remote);
		const localBefore = git(root, 'rev-parse', 'develop');
		await checkpoint(root, { 'state.txt': 'green\n' });
		const workTip = git(root, 'rev-parse', WORK_REF);

		const result = await publish(root);

		expect(result.error).toBeUndefined();
		expect(result.code).toBe(0);
		expect(result.data).toMatchObject({
			landed: true,
			landing: { status: 'merged' },
			certification: { declared: true, passed: true },
			workRefRemoved: true,
		});
		const after = remoteDevelop(remote);
		expect(after).not.toBe(before);
		// A merge commit: first parent the old head, second the work.
		expect(git(remote, 'rev-parse', `${after}^1`)).toBe(before);
		expect(git(remote, 'rev-parse', `${after}^2`)).toBe(workTip);
		expect(git(remote, 'show', `${after}:state.txt`)).toBe('green');
		// The shared checkout never moved and never learned of the merge.
		expect(git(root, 'symbolic-ref', '--short', 'HEAD')).toBe('develop');
		expect(git(root, 'rev-parse', 'develop')).toBe(localBefore);
		expect(git(root, 'status', '--porcelain')).toBe('');
		expect(workRefExists(root)).toBe(false);
		// The certification's worktree is gone with it.
		expect(git(root, 'worktree', 'list', '--porcelain')).not.toContain(
			'delendai-certify',
		);
	});

	it('lands nothing when the project declares no gate', async () => {
		const { root, remote } = projectWith(MERGE);
		const before = remoteDevelop(remote);
		await checkpoint(root, { 'state.txt': 'green\n' });

		const result = await publish(root);

		expect(result.code).not.toBe(0);
		expect(result.error).toContain('declares no validation gate');
		expect(result.data).toMatchObject({
			landed: false,
			landing: { status: 'blocked' },
			certification: { declared: false },
		});
		expect(remoteDevelop(remote)).toBe(before);
		expect(workRefExists(root)).toBe(true);
	});

	it('runs the gate the integration branch declares, not the one the unit carries', async () => {
		const { root, remote } = projectWith({ ...MERGE, ...GATE });
		const before = remoteDevelop(remote);
		// The unit rewrites the gate into one that always passes.
		await checkpoint(root, {
			'state.txt': 'still red\n',
			'delendai.config.json': JSON.stringify({
				...MERGE,
				validationMatrix: {
					scopes: { state: [{ command: 'true', expect: 'exit0' }] },
				},
			}),
		});

		const result = await publish(root);

		expect(result.code).not.toBe(0);
		expect(result.error).toContain('grep -q green state.txt');
		expect(remoteDevelop(remote)).toBe(before);
	});

	it('refuses a unit not built on the current head, naming how to refresh it', async () => {
		const { root, remote } = projectWith({ ...MERGE, ...GATE });
		await checkpoint(root, { 'state.txt': 'green\n' });
		// Somebody else lands first.
		const other = tempDir('land-other-');
		git(other, 'clone', '-q', remote, '.');
		git(other, 'config', 'user.email', 'other@example.com');
		git(other, 'config', 'user.name', 'Other');
		writeFileSync(join(other, 'other.txt'), 'theirs\n');
		git(other, 'add', 'other.txt');
		git(other, 'commit', '-q', '-m', 'theirs');
		git(other, 'push', '-q', 'origin', 'develop');
		const moved = remoteDevelop(remote);

		const result = await publish(root);

		expect(result.code).not.toBe(0);
		expect(result.data).toMatchObject({
			landed: false,
			landing: { status: 'revalidating' },
		});
		expect(result.error).toContain('git merge origin/develop');
		expect(remoteDevelop(remote)).toBe(moved);
		expect(workRefExists(root)).toBe(true);
	});
});

describe('work publish under a pull-request profile is unchanged', () => {
	it('pushes the publication ref, runs no gate and never touches the integration branch', async () => {
		// The gate would fail; a pull-request profile never runs it here.
		const { root, remote } = projectWith({ ...PULL_REQUEST, ...GATE });
		const before = remoteDevelop(remote);
		await checkpoint(root, { 'state.txt': 'still red\n' });

		const result = await publish(root, ['--no-pull-request']);

		expect(result.code).toBe(0);
		expect(result.data).toMatchObject({
			published: true,
			workRefRemoved: true,
		});
		expect(result.data).not.toHaveProperty('landed');
		expect(remoteDevelop(remote)).toBe(before);
		expect(
			git(root, 'ls-remote', 'origin', 'refs/heads/delendai/pr/**'),
		).toContain(
			'refs/heads/delendai/pr/claude-opus-5/implement/x00553-S1-g1/probe',
		);
	});
});

describe('work publish in a project whose only branch is main', () => {
	const landsOnMain = async (
		config: object,
		workRef: string,
	): Promise<void> => {
		const { root, remote } = projectWith({ ...config, ...GATE }, 'main');
		const before = remoteDevelop(remote, 'main');
		const localBefore = git(root, 'rev-parse', 'main');
		await checkpoint(root, { 'state.txt': 'green\n' });
		const workTip = git(root, 'rev-parse', workRef);

		const result = await publish(root);

		expect(result.error).toBeUndefined();
		expect(result.data).toMatchObject({
			landed: true,
			landing: { status: 'merged' },
			certification: { declared: true, passed: true },
		});
		const after = remoteDevelop(remote, 'main');
		expect(git(remote, 'rev-parse', `${after}^1`)).toBe(before);
		expect(git(remote, 'rev-parse', `${after}^2`)).toBe(workTip);
		expect(git(remote, 'show', `${after}:state.txt`)).toBe('green');
		// Nothing was invented: the remote still has only the one branch.
		expect(git(remote, 'for-each-ref', '--format=%(refname)')).toBe(
			'refs/heads/main',
		);
		expect(git(root, 'symbolic-ref', '--short', 'HEAD')).toBe('main');
		expect(git(root, 'rev-parse', 'main')).toBe(localBefore);
	};

	it('lands on main after the gate when the release branch is omitted', async () => {
		await landsOnMain(
			{
				development: {
					profile: 'shared-checkout-merge',
					branches: {
						integration: 'main',
						namespacePrefix: 'delendai',
					},
				},
			},
			WORK_REF,
		);
	});

	it('lands on main after the gate when integration and release are both main', async () => {
		await landsOnMain(
			{
				development: {
					profile: 'shared-checkout-merge',
					branches: {
						integration: 'main',
						release: 'main',
						namespacePrefix: 'delendai',
					},
				},
			},
			WORK_REF,
		);
	});

	it('lands on main after the gate when the project declares no policy at all', async () => {
		await landsOnMain(
			{},
			'refs/heads/wip/claude-opus-5/implement/x00553-S1-g1/probe',
		);
	});

	it('still refuses a failing gate on main and keeps the work', async () => {
		const { root, remote } = projectWith(
			{
				development: {
					profile: 'shared-checkout-merge',
					branches: {
						integration: 'main',
						namespacePrefix: 'delendai',
					},
				},
				...GATE,
			},
			'main',
		);
		const before = remoteDevelop(remote, 'main');
		await checkpoint(root, { 'state.txt': 'still red\n' });

		const result = await publish(root);

		expect(result.code).not.toBe(0);
		expect(result.error).toContain('validation gate failed');
		expect(remoteDevelop(remote, 'main')).toBe(before);
		expect(workRefExists(root)).toBe(true);
	});
});
