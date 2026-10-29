/**
 * declared-slice.service.spec.ts — a new unit works on a slice its
 * proposal declares; one already worked on is left alone.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/public';
import {
	declaredSlices,
	undeclaredSlice,
} from '@delendai/core/lib/work-units/declared-slice.service';

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

const policy = resolveDevelopmentPolicy({
	development: {
		profile: 'shared-checkout-pr',
		branches: { namespacePrefix: 'delendai' },
	},
});

const repo = (): string => {
	const root = mkdtempSync(join(tmpdir(), 'declared-slice-'));
	roots.push(root);
	const git = (...args: string[]) =>
		execFileSync('git', args, { cwd: root, encoding: 'utf8' });
	git('init', '-q', '-b', 'develop');
	git('config', 'user.email', 'p@example.com');
	git('config', 'user.name', 'P');
	git('config', 'commit.gpgsign', 'false');
	mkdirSync(join(root, 'docs/delendai/proposals/in-progress'), {
		recursive: true,
	});
	writeFileSync(
		join(root, 'docs/delendai/proposals/in-progress/a00001-audit.md'),
		'---\nid: a00001\n---\n\n## slices\n\n### S1 — one\n\n### S2 — two\n\n### S10a — three\n',
	);
	git('add', '-A');
	git('commit', '-q', '-m', 'docs: a00001');
	return root;
};

describe('declaredSlices', () => {
	it('reads the slice headings of the proposal', () => {
		const root = repo();
		expect(declaredSlices(root, 'a00001', 'develop')).toEqual([
			'S1',
			'S2',
			'S10a',
		]);
		expect(declaredSlices(root, 'x00009', 'develop')).toBeUndefined();
	});
});

describe('undeclaredSlice', () => {
	it('refuses a new unit on a slice the proposal does not declare, naming those it does', () => {
		const result = undeclaredSlice(
			repo(),
			policy,
			'a00001',
			'S11S12S13S14',
		);
		expect(result?.code).toBe(4);
		expect(result?.error).toContain('S1, S2, S10a');
		expect(result?.error).toContain('--slice=all');
	});

	it('lets through a declared slice, the whole proposal, the review batch and an unwritten proposal', () => {
		const root = repo();
		for (const slice of ['S1', 'all', 'batch'])
			expect(
				undeclaredSlice(root, policy, 'a00001', slice),
			).toBeUndefined();
		expect(undeclaredSlice(root, policy, 'f00999', 'S7')).toBeUndefined();
	});

	it('leaves a slice someone already works on to its units', () => {
		const root = repo();
		execFileSync(
			'git',
			[
				'update-ref',
				'refs/heads/delendai/wip/minimax-m3/audit/a00001-S12-g1/pass',
				'HEAD',
			],
			{ cwd: root },
		);
		expect(undeclaredSlice(root, policy, 'a00001', 'S12')).toBeUndefined();
	});
});
