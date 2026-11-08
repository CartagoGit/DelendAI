/**
 * work-unit-enter.service.spec.ts — what `work enter` derives for a
 * review, on a real repository (x01032). Two entries, kept fast.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createGitRepoTemplate, fakePartial } from '@delendai/test-kit';

import type { IWorkUnitContext } from '@delendai/core/lib/contracts/interfaces/work-unit-context.interface';
import { runWorkUnit } from '@delendai/core/lib/work-units/work-unit.service';

const template = createGitRepoTemplate({
	trunk: 'develop',
	files: {
		'delendai.config.json': JSON.stringify({
			development: {
				profile: 'shared-checkout-pr',
				branches: { namespacePrefix: 'delendai' },
			},
		}),
		'.gitignore': '.cache/\n',
	},
});

const repo = (): string => {
	const { root, git } = template.copy();
	const dir = join(root, 'docs/delendai/proposals/review');
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, 'x00900-waiting.md'), '# x00900\n');
	git('add', '-A');
	git('commit', '-q', '-m', 'a proposal in review');
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
