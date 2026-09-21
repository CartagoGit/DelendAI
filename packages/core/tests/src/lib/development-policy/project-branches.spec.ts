/**
 * project-branches.spec.ts — `develop` is this repository's habit, and
 * habits are not defaults.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import {
	currentBranch,
	projectBranches,
} from '@delendai/core/lib/development-policy/project-branches';

const roots: string[] = [];
afterAll(() => {
	for (const root of roots) rmSync(root, { recursive: true, force: true });
});

const repoOn = (branch: string, config?: string): string => {
	const root = mkdtempSync(join(tmpdir(), 'branches-'));
	roots.push(root);
	const git = (...args: string[]) =>
		execFileSync('git', args, { cwd: root, encoding: 'utf8' });
	git('init', '-q', '-b', branch);
	git('config', 'user.email', 't@example.invalid');
	git('config', 'user.name', 'T');
	if (config !== undefined) {
		writeFileSync(join(root, 'delendai.config.json'), config);
	}
	writeFileSync(join(root, 'a.txt'), 'a\n');
	git('add', '-A');
	git('commit', '-q', '-m', 'base');
	return root;
};

describe('projectBranches (x00589)', () => {
	it('uses the branch the workspace is on when nothing is declared', async () => {
		// The chain used to end in `'develop'` — a fact about ONE
		// repository. A project on `trunk` got a default naming a branch
		// that does not exist, and the branch garbage collector is one of
		// the callers, so the guess had teeth.
		expect((await projectBranches(repoOn('trunk'))).integration).toBe(
			'trunk',
		);
		expect((await projectBranches(repoOn('main'))).integration).toBe(
			'main',
		);
		expect(
			(await projectBranches(repoOn('release/2026.4'))).integration,
		).toBe('release/2026.4');
	});

	it('prefers what the project declared over where it happens to be', async () => {
		const root = repoOn(
			'some-feature',
			JSON.stringify({
				development: { branches: { integration: 'trunk' } },
			}),
		);
		expect((await projectBranches(root)).integration).toBe('trunk');
	});

	it('reads the work-ref prefix from the policy, not a literal', async () => {
		const root = repoOn(
			'main',
			JSON.stringify({
				development: {
					profile: 'shared-checkout-pr',
					branches: { namespacePrefix: 'acme' },
				},
			}),
		);
		// Never `agent/`, which was the old spelling in one tool.
		expect((await projectBranches(root)).workRefPrefix).toBe('acme/wip/');
	});

	it('answers for a detached checkout without inventing a branch', async () => {
		const root = repoOn('main');
		const sha = execFileSync('git', ['rev-parse', 'HEAD'], {
			cwd: root,
			encoding: 'utf8',
		}).trim();
		execFileSync('git', ['checkout', '-q', '--detach', sha], { cwd: root });
		expect(currentBranch(root)).toBeUndefined();
		// Falls back to the policy default rather than throwing.
		expect(
			(await projectBranches(root)).integration.length,
		).toBeGreaterThan(0);
	});

	it('says nothing surprising about a directory that is not a repository', async () => {
		const root = mkdtempSync(join(tmpdir(), 'not-a-repo-'));
		roots.push(root);
		expect(currentBranch(root)).toBeUndefined();
		expect(
			(await projectBranches(root)).integration.length,
		).toBeGreaterThan(0);
	});
});
