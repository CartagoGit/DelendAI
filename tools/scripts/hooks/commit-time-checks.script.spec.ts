import { describe, expect, it } from 'vitest';

import { checksFor, sharedWith } from './commit-time-checks.script';

const names = (paths: readonly string[]): string =>
	checksFor(paths)
		.map((command) => command.join(' '))
		.join('\n');

describe('checksFor', () => {
	it('asks nothing of a commit with no code', () => {
		expect(checksFor(['docs/a.md'])).toEqual([]);
	});

	it('runs the lints on any code', () => {
		const asked = names(['packages/a/src/b.ts']);
		expect(asked).toContain('lint:test-unsafe-casts');
		expect(asked).not.toContain('budget');
	});

	it('adds the budget and the site when a tool can have changed', () => {
		const asked = names(['plugins/a/src/lib/tools/b.tool.ts']);
		expect(asked).toContain('run-actual-preset-budget');
		expect(asked).toContain('gen-capabilities');
	});
});

describe('sharedWith', () => {
	it('names each other unit that changes a staged file, and not this one', () => {
		const units = [
			{
				ref: 'delendai/wip/a/implement/x1-S1-g1/t',
				agent: 'a',
				paths: ['src/a.ts'],
			},
			{
				ref: 'delendai/wip/b/implement/x2-S1-g1/t',
				agent: 'b',
				paths: ['src/a.ts', 'src/z.ts'],
			},
			{
				ref: 'delendai/wip/c/implement/x3-S1-g1/t',
				agent: 'c',
				paths: ['src/y.ts'],
			},
		];
		expect(
			sharedWith(
				['src/a.ts', 'src/q.ts'],
				'delendai/wip/a/implement/x1-S1-g1/t',
				units,
			),
		).toEqual([
			"[delendai] b's delendai/wip/b/implement/x2-S1-g1/t also changes: src/a.ts",
		]);
	});
});
