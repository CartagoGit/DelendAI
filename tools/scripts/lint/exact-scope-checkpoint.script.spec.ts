/**
 * exact-scope-checkpoint.script.spec.ts
 *
 * A guard nobody has seen fail is a guard nobody knows works, so each
 * rule is exercised against a source that violates it as well as one
 * that does not.
 */
import { describe, expect, it } from 'vitest';

import { findExactScopeViolations } from './exact-scope-checkpoint.script';

const runner = (text: string) => ({
	file: 'packages/core/src/lib/wip-engine/git-command.ts',
	text,
});

const HEALTHY_RUNNER = runner(
	'export const withIndexFile = (run, indexFile) => (args) => run(args, { GIT_INDEX_FILE: indexFile });',
);

describe('findExactScopeViolations', () => {
	it('passes an engine that stages named paths through a private index', () => {
		expect(
			findExactScopeViolations([
				HEALTHY_RUNNER,
				{
					file: 'packages/core/src/lib/wip-engine/checkpoint.ts',
					text: "await indexRun(['update-index', '--add', '--remove', '--', ...scope]);",
				},
			]),
		).toEqual([]);
	});

	it('catches every spelling of "stage whatever is there"', () => {
		for (const argument of ['-A', '--all', '.', ':/']) {
			const violations = findExactScopeViolations([
				HEALTHY_RUNNER,
				{
					file: 'packages/core/src/lib/wip-engine/checkpoint.ts',
					text: `await indexRun(['add', '${argument}']);`,
				},
			]);
			expect(violations).toHaveLength(1);
			expect(violations[0]?.reason).toContain('claimed paths');
		}
	});

	it('catches a shelled-out `git add -A` in a comment-free line', () => {
		const violations = findExactScopeViolations([
			HEALTHY_RUNNER,
			{
				file: 'packages/core/src/lib/wip-engine/checkpoint.ts',
				text: 'const command = `git add -A`;',
			},
		]);
		expect(violations).toHaveLength(1);
	});

	it('does not trip on prose explaining why global staging is banned', () => {
		// The engine's own header says `git add .` is banned. A guard
		// that fired on its own rationale would be unusable.
		expect(
			findExactScopeViolations([
				HEALTHY_RUNNER,
				{
					file: 'packages/core/src/lib/wip-engine/scope.ts',
					text: '/**\n * Two problems live here, and both are why `git add .` is banned.\n */\n// never `git add -A`\nconst x = 1;',
				},
			]),
		).toEqual([]);
	});

	it('fails when the private index is abandoned', () => {
		// Without GIT_INDEX_FILE the engine writes the index the operator
		// and every other agent share.
		const violations = findExactScopeViolations([
			runner(
				'export const withIndexFile = (run) => (args) => run(args);',
			),
		]);
		expect(violations).toHaveLength(1);
		expect(violations[0]?.reason).toContain('share');
	});

	it('fails when the engine git runner disappears entirely', () => {
		const violations = findExactScopeViolations([
			{
				file: 'packages/core/src/lib/wip-engine/checkpoint.ts',
				text: 'const x = 1;',
			},
		]);
		expect(violations).toHaveLength(1);
		expect(violations[0]?.reason).toContain('cannot be verified');
	});
});
