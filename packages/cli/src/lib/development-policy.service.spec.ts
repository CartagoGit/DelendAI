/**
 * `develop` is this repository's habit, and a habit is not a default.
 *
 * `resolveDevelopmentPolicy` is pure — it cannot look at a checkout — so
 * a project that declares no `branches.integration` used to get
 * `develop`, and every consumer of the policy believed it. The guard
 * then refused every commit in a project whose trunk is `main` and told
 * its owner to `git switch develop`, a branch their repository does not
 * have. Adoption was impossible for anyone not already shaped like us.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { readWorkspacePolicy } from './development-policy.service';

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

const project = (branch: string, config: string): string => {
	const root = mkdtempSync(join(tmpdir(), 'policy-branch-'));
	roots.push(root);
	execFileSync('git', ['init', '-q', '-b', branch], { cwd: root });
	writeFileSync(join(root, 'delendai.config.json'), config);
	writeFileSync(join(root, 'a.ts'), 'export const a = 1;\n');
	execFileSync('git', ['add', '-A'], { cwd: root });
	execFileSync(
		'git',
		[
			'-c',
			'user.email=t@t',
			'-c',
			'user.name=t',
			'commit',
			'-q',
			'-m',
			'base',
		],
		{ cwd: root },
	);
	return root;
};

describe('readWorkspacePolicy resolves the integration branch agnostically', () => {
	it('discovers the trunk when the project declares none', async () => {
		const root = project(
			'main',
			'{ "development": { "profile": "shared-checkout-merge" } }',
		);
		const policy = await readWorkspacePolicy(root);
		expect(policy?.branches.integration).toBe('main');
	});

	it('discovers `master` the same way', async () => {
		const root = project(
			'master',
			'{ "development": { "profile": "shared-checkout-merge" } }',
		);
		const policy = await readWorkspacePolicy(root);
		expect(policy?.branches.integration).toBe('master');
	});

	it('follows the forge, when there is one', async () => {
		// `refs/remotes/origin/HEAD` is the default branch the forge
		// itself publishes, and it outranks every local guess.
		const root = project(
			'main',
			'{ "development": { "profile": "shared-checkout-merge" } }',
		);
		execFileSync('git', ['branch', 'release/2026-09'], { cwd: root });
		execFileSync(
			'git',
			[
				'update-ref',
				'refs/remotes/origin/release/2026-09',
				'refs/heads/release/2026-09',
			],
			{ cwd: root },
		);
		execFileSync(
			'git',
			[
				'symbolic-ref',
				'refs/remotes/origin/HEAD',
				'refs/remotes/origin/release/2026-09',
			],
			{ cwd: root },
		);
		const policy = await readWorkspacePolicy(root);
		expect(policy?.branches.integration).toBe('release/2026-09');
	});

	it('honours a declared branch over the one checked out', async () => {
		// Declaring is the stronger statement: a project that says
		// `trunk` while sitting on `main` has wandered, and wants to be
		// told so.
		const root = project(
			'main',
			'{ "development": { "profile": "shared-checkout-merge", "branches": { "integration": "trunk" } } }',
		);
		const policy = await readWorkspacePolicy(root);
		expect(policy?.branches.integration).toBe('trunk');
	});

	it('does not guess an unconventional trunk with nothing stable to read', async () => {
		// No remote, no `init.defaultBranch`, and a branch name no
		// convention covers. Nothing here is a stable statement about the
		// project, and the alternative — reading whichever branch HEAD is
		// on — is what makes every check depending on the integration
		// branch vacuous. So it does not guess, and the project is
		// expected to declare.
		const root = project(
			'release/2026-09',
			'{ "development": { "profile": "shared-checkout-merge" } }',
		);
		const policy = await readWorkspacePolicy(root);
		expect(policy?.branches.integration).not.toBe('release/2026-09');
	});

	it('follows git\u2019s configured default branch before guessing', async () => {
		// `init.defaultBranch` is a statement somebody made, and it
		// outranks the conventional-name list below it.
		const root = project(
			'main',
			'{ "development": { "profile": "shared-checkout-merge" } }',
		);
		execFileSync('git', ['branch', 'master'], { cwd: root });
		execFileSync(
			'git',
			['config', '--local', 'init.defaultBranch', 'master'],
			{
				cwd: root,
			},
		);
		const policy = await readWorkspacePolicy(root);
		expect(policy?.branches.integration).toBe('master');
	});

	it('refuses to choose between two conventional trunks', async () => {
		// A repository holding both `main` and `master` has made a choice
		// this list cannot read, and guessing between them is how a tool
		// tells somebody to switch to a branch that means something else
		// in their project. With nothing stable left to read it declines,
		// and the caller is left with the policy's own value.
		const root = project(
			'main',
			'{ "development": { "profile": "shared-checkout-merge" } }',
		);
		execFileSync('git', ['branch', 'master'], { cwd: root });
		execFileSync('git', ['config', '--local', 'init.defaultBranch', ''], {
			cwd: root,
		});
		const policy = await readWorkspacePolicy(root);
		expect(policy?.branches.integration).not.toBe('main');
		expect(policy?.branches.integration).not.toBe('master');
	});

	it('keeps every other field of the resolved policy', async () => {
		const root = project(
			'main',
			'{ "development": { "profile": "shared-checkout-merge" } }',
		);
		const policy = await readWorkspacePolicy(root);
		expect(policy?.profile).toBe('shared-checkout-merge');
		expect(policy?.workspace.pinnedCheckout).toBe(true);
		expect(policy?.branches.workRefPrefix.length).toBeGreaterThan(0);
	});

	it('still answers nothing for a project that declares no policy', async () => {
		const root = project('main', '{ "plugins": {} }');
		expect(await readWorkspacePolicy(root)).toBeUndefined();
	});
});
