/**
 * effective-policy.spec.ts — one resolution path for the model a project
 * works under, declared or adopted.
 *
 * `delendai work`, the git guard and the served instructions all read
 * this policy. Before it was shared, two of them treated a project with
 * no `development` block as having no policy while the instructions
 * described one to follow.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { resolveEffectivePolicy } from '@delendai/core/lib/development-policy/effective-policy';
import { servedWorkModelLines } from '@delendai/core/lib/development-policy/served-work-model';
import { readWorkspacePolicy } from '@delendai/core/lib/work-units/development-policy.service';

const roots: string[] = [];

/** A repository whose only branch is `trunk`, with the given config. */
const projectOn = (trunk: string, config: string | undefined): string => {
	const root = mkdtempSync(join(tmpdir(), 'effective-policy-'));
	roots.push(root);
	execFileSync('git', ['init', '-q', '-b', trunk], { cwd: root });
	if (config !== undefined) {
		writeFileSync(join(root, 'delendai.config.json'), config);
	}
	writeFileSync(join(root, 'README.md'), '# project\n');
	execFileSync('git', ['add', '-A'], { cwd: root });
	execFileSync(
		'git',
		[
			'-c',
			'user.email=t@example.com',
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

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

describe('a project that declares nothing', () => {
	it('is adopted into the default model, on its own single branch', async () => {
		const root = projectOn('trunk', undefined);

		const policy = await readWorkspacePolicy(root);

		expect(policy.source).toBe('default');
		expect(policy.profile).toBe('shared-checkout-merge');
		expect(policy.branches.integration).toBe('trunk');
		expect(policy.branches.release).toBe('trunk');
	});

	it('reads the same answer from a config file with no development block', async () => {
		const bare = await readWorkspacePolicy(projectOn('main', undefined));
		const empty = await readWorkspacePolicy(projectOn('main', '{}'));

		expect(empty).toEqual(bare);
	});

	it('keeps a legacy model the project wrote, and calls it adopted', async () => {
		const root = projectOn('main', '{ "agentWorktree": false }');

		const policy = await readWorkspacePolicy(root);

		expect(policy.source).toBe('legacy-compat');
		expect(policy.profile).toBe('shared-direct');
	});

	it('resolves the same policy the server does for the same inputs', async () => {
		const root = projectOn('main', undefined);

		expect(await readWorkspacePolicy(root)).toEqual(
			resolveEffectivePolicy({ legacy: {}, workspaceRoot: root }),
		);
	});
});

describe('a project that declares its branches', () => {
	it('is not overridden by the branch the checkout happens to have', async () => {
		const root = projectOn(
			'main',
			'{ "development": { "profile": "shared-checkout-merge", "branches": { "integration": "develop", "release": "stable" } } }',
		);

		const policy = await readWorkspacePolicy(root);

		expect(policy.source).toBe('profile');
		expect(policy.branches.integration).toBe('develop');
		expect(policy.branches.release).toBe('stable');
	});

	it('keeps a declared release branch when only the integration is discovered', async () => {
		const root = projectOn(
			'trunk',
			'{ "development": { "profile": "shared-checkout-merge", "branches": { "release": "stable" } } }',
		);

		const policy = await readWorkspacePolicy(root);

		expect(policy.branches.integration).toBe('trunk');
		expect(policy.branches.release).toBe('stable');
	});
});

describe('the instructions served to an agent', () => {
	it('say the model was adopted when the project declared none', async () => {
		const policy = await readWorkspacePolicy(projectOn('main', undefined));

		const header = servedWorkModelLines(policy)[0] ?? '';

		expect(header).toContain('`shared-checkout-merge`');
		expect(header).toContain('adopted');
		expect(header).toContain('declares no `development` block');
		expect(header).toContain(
			'main is both the integration and the release branch',
		);
	});

	it('say the model was resolved from configuration when the project wrote it', async () => {
		const policy = await readWorkspacePolicy(
			projectOn(
				'main',
				'{ "development": { "profile": "shared-checkout-merge", "branches": { "integration": "develop", "release": "main" } } }',
			),
		);

		const header = servedWorkModelLines(policy)[0] ?? '';

		expect(header).not.toContain('adopted');
		expect(header).toContain("resolved from this project's configuration");
		expect(header).toContain(
			'integration branch develop, release branch main',
		);
	});
});
