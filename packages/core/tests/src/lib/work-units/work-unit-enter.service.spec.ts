/**
 * work-unit-enter.service.spec.ts — what `work enter` derives for a
 * review, on a real repository (x01032). Two entries, kept fast.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { fakePartial } from '@delendai/test-kit';

import type { IWorkUnitContext } from '@delendai/core/lib/contracts/interfaces/work-unit-context.interface';
import { runWorkUnit } from '@delendai/core/lib/work-units/work-unit.service';

const roots: string[] = [];
const git = (root: string, ...args: string[]): string =>
	execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();

const repo = (): string => {
	const root = mkdtempSync(join(tmpdir(), 'work-enter-'));
	roots.push(root);
	git(root, 'init', '-q', '-b', 'develop');
	git(root, 'config', 'user.email', 'work@example.com');
	git(root, 'config', 'user.name', 'Work');
	git(root, 'config', 'commit.gpgsign', 'false');
	writeFileSync(join(root, 'README.md'), '# repo\n');
	writeFileSync(
		join(root, 'delendai.config.json'),
		JSON.stringify({
			development: {
				profile: 'shared-checkout-pr',
				branches: { namespacePrefix: 'delendai' },
			},
		}),
	);
	writeFileSync(join(root, '.gitignore'), '.cache/\n');
	const dir = join(root, 'docs/delendai/proposals/review');
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, 'x00900-waiting.md'), '# x00900\n');
	git(root, 'add', '-A');
	git(root, 'commit', '-q', '-m', 'base');
	return root;
};

const enter = (root: string, ...args: string[]) =>
	runWorkUnit(
		['enter', '--slice=all', '--agent=gpt-5.3-codex', ...args],
		fakePartial<IWorkUnitContext, 'cwd' | 'globals'>({
			cwd: root,
			globals: fakePartial<
				IWorkUnitContext['globals'],
				'workspace' | 'json'
			>({ workspace: root, json: true }),
		}),
	);

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

describe('work enter derives the review kind (x01032)', () => {
	it('enters the batch as a review unit, and refuses another kind on it', async () => {
		const root = repo();
		const contradicted = await enter(
			root,
			'--proposal=batch',
			'--kind=implement',
		);
		expect(contradicted.code).not.toBe(0);
		expect(JSON.stringify(contradicted)).toContain('review next');

		const entered = await enter(root, '--proposal=batch');
		expect(entered.code).toBe(0);
		const ref = (entered.data as { ref?: string }).ref ?? '';
		expect(ref).toContain('/review/batch-all');
		expect(ref).toContain('/verdicts');
	});

	it("enters a proposal waiting in review/ as the reviewer's batch unit", async () => {
		const root = repo();
		const entered = await enter(root, '--proposal=x00900');
		expect(entered.code).toBe(0);
		expect((entered.data as { ref?: string }).ref).toContain(
			'/review/batch-all',
		);
	});
});
