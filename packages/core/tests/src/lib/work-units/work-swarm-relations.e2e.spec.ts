/**
 * work-swarm-relations.e2e.spec.ts — what the swarm says its units have to
 * sort out: published work, stacks, duplicates, landed refs and overlaps.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/public';

import { readSwarm } from '@delendai/core/lib/work-units/work-swarm.service';
const roots: string[] = [];
const policy = resolveDevelopmentPolicy({
	development: {
		profile: 'shared-checkout-pr',
		branches: { namespacePrefix: 'delendai' },
	},
});

const git = (cwd: string, ...args: string[]): string =>
	execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

/** Commit `files` on top of `base` and point `ref` at the result. */
const commitOnto = (
	root: string,
	base: string,
	ref: string,
	files: Record<string, string>,
): string => {
	git(root, 'checkout', '-q', '--detach', base);
	for (const [name, body] of Object.entries(files)) {
		writeFileSync(join(root, name), body);
	}
	git(root, 'add', '-A');
	git(root, 'commit', '-q', '-m', `feat: ${ref}`);
	const tip = git(root, 'rev-parse', 'HEAD');
	git(root, 'update-ref', ref, tip);
	git(root, 'checkout', '-q', 'develop');
	return tip;
};

describe('reading published work from git', () => {
	it('[<700ms] reads publications as units, leaves derived files out, and finds a stack', () => {
		const root = mkdtempSync(join(tmpdir(), 'swarm-rel-'));
		roots.push(root);
		git(root, 'init', '-q', '-b', 'develop');
		git(root, 'config', 'user.email', 'swarm@example.com');
		git(root, 'config', 'user.name', 'Swarm');
		git(root, 'config', 'commit.gpgsign', 'false');
		writeFileSync(
			join(root, '.gitattributes'),
			'catalog.json linguist-generated\nindex.md merge=delendai-generated\nlock.json linguist-generated=true\n',
		);
		writeFileSync(join(root, 'base.ts'), 'export const base = 0;\n');
		git(root, 'add', '-A');
		git(root, 'commit', '-q', '-m', 'base');
		const develop = git(root, 'rev-parse', 'HEAD');

		const remote = 'refs/remotes/origin/delendai/pr/sonnet/implement';
		const lower = commitOnto(root, develop, `${remote}/x10-S1-g1/base`, {
			'policy.ts': 'export const policy = 1;\n',
			'catalog.json': '{"a":1}\n',
			'index.md': '# a\n',
		});
		commitOnto(root, lower, `${remote}/x11-S1-g1/on-top`, {
			'release.ts': 'export const release = 1;\n',
			'catalog.json': '{"b":1}\n',
			'lock.json': '{}\n',
		});
		// Already merged: its tip is develop itself.
		git(root, 'update-ref', `${remote}/x12-S1-g1/done`, develop);

		const view = readSwarm({ root, policy });
		expect(view.units).toEqual([]);
		expect(view.publications).toHaveLength(3);
		const base = view.published.find((entry) =>
			entry.ref.endsWith('x10-S1-g1/base'),
		);
		expect(base?.agent).toBe('sonnet');
		expect(base?.paths).toEqual(['policy.ts']);
		expect(view.relations.map((relation) => relation.kind).sort()).toEqual([
			'landed',
			'stacked',
		]);
		// The derived catalog both of them touch is not an overlap.
		expect(view.overlaps.map((overlap) => overlap.path)).toEqual([
			'policy.ts',
		]);
	});
});
