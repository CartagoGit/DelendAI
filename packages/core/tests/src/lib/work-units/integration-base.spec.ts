/**
 * integration-base.spec.ts — where a unit of work starts from when the
 * local integration branch and the forge's disagree.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/public';

import { integrationBase } from '@delendai/core/lib/work-units/work-unit-shared.service';

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

const git = (cwd: string, ...args: string[]): string =>
	execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

const commit = (root: string, name: string): string => {
	writeFileSync(join(root, name), `${name}\n`);
	git(root, 'add', '-A');
	git(root, 'commit', '-q', '-m', `add ${name}`);
	return git(root, 'rev-parse', 'HEAD');
};

/** A clone whose forge copy of develop is one commit ahead of `base`. */
const repo = (): { root: string; base: string; forge: string } => {
	const root = mkdtempSync(join(tmpdir(), 'integration-base-'));
	roots.push(root);
	git(root, 'init', '-q', '-b', 'develop');
	git(root, 'config', 'user.email', 'work@example.com');
	git(root, 'config', 'user.name', 'Work');
	git(root, 'config', 'commit.gpgsign', 'false');
	const base = commit(root, 'base.ts');
	const forge = commit(root, 'landed.ts');
	git(root, 'update-ref', 'refs/remotes/origin/develop', forge);
	git(root, 'remote', 'add', 'origin', 'https://example.invalid/repo.git');
	return { root, base, forge };
};

const pullRequests = resolveDevelopmentPolicy({
	development: {
		profile: 'shared-checkout-pr',
		branches: { namespacePrefix: 'delendai' },
	},
});
const localMerge = resolveDevelopmentPolicy({
	development: {
		profile: 'shared-checkout-merge',
		branches: { namespacePrefix: 'delendai' },
	},
});

describe('integrationBase', () => {
	it('starts from the forge when the local branch carries commits it lacks', () => {
		const { root, forge } = repo();
		commit(root, 'committed-straight-onto-develop.ts');
		expect(integrationBase(root, pullRequests)).toBe(forge);
	});

	it('keeps the local branch when it only follows the forge', () => {
		const { root, base } = repo();
		git(root, 'reset', '-q', '--hard', base);
		expect(integrationBase(root, pullRequests)).toBe(base);
	});

	it('keeps the local branch under a model that lands work by merging locally', () => {
		const { root } = repo();
		const landedHere = commit(root, 'landed-by-merge.ts');
		expect(integrationBase(root, localMerge)).toBe(landedHere);
	});

	it('answers with whichever copy exists when there is only one', () => {
		const { root, forge } = repo();
		git(root, 'checkout', '-q', '--detach');
		git(root, 'branch', '-q', '-D', 'develop');
		expect(integrationBase(root, pullRequests)).toBe(forge);
		git(root, 'update-ref', '-d', 'refs/remotes/origin/develop');
		expect(integrationBase(root, pullRequests)).toBeUndefined();
	});
});
