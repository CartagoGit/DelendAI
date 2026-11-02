import { describe, expect, it } from 'vitest';

import { checksFor } from './commit-time-checks.script';

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
