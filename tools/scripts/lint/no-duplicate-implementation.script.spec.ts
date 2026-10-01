/**
 * no-duplicate-implementation.script.spec.ts — one name, one
 * implementation per package (q00014 S7).
 *
 * The defect this gate exists for: `commit-policy` shipped two definitions
 * of one exported name, one shadowing the other, and each copy's tests
 * only covered its own. These pin that the shadow is found.
 */
import { describe, expect, it } from 'vitest';

import {
	ALLOWED_DUPLICATES,
	findShadowedExports,
	findTopLevelDefinitions,
} from './no-duplicate-implementation.script';

describe('findTopLevelDefinitions', () => {
	it('reads column-0 value declarations, exported or not, and skips types', () => {
		const found = findTopLevelDefinitions(
			'a.ts',
			[
				'export const one = 1;',
				'function two() {}',
				'export async function three() {}',
				'export interface IFour {}',
				'  const nested = 5;',
			].join('\n'),
		);
		expect(found.map((d) => [d.name, d.exported, d.line])).toEqual([
			['one', true, 1],
			['two', false, 2],
			['three', true, 3],
		]);
	});
});

describe('findShadowedExports', () => {
	it('flags a second definition of an exported name in another file of the package', () => {
		const violations = findShadowedExports('plugins/commit-policy', [
			{
				file: 'plugins/commit-policy/src/a.ts',
				body: 'export const resolveCommit = () => 1;\n',
			},
			{
				file: 'plugins/commit-policy/src/b.ts',
				body: 'const x = 0;\nconst resolveCommit = () => 2;\n',
			},
		]);
		expect(violations).toHaveLength(1);
		expect(violations[0]).toMatchObject({
			rule: 'shadowed-export',
			file: 'plugins/commit-policy/src/b.ts',
			line: 2,
		});
		expect(violations[0]?.detail).toContain(
			'plugins/commit-policy/src/a.ts:1',
		);
	});

	it('leaves a name defined once, or only privately in several files', () => {
		expect(
			findShadowedExports('pkg', [
				{ file: 'pkg/a.ts', body: 'export const only = 1;\n' },
				{ file: 'pkg/b.ts', body: 'const helper = 1;\n' },
				{ file: 'pkg/c.ts', body: 'const helper = 2;\n' },
			]),
		).toEqual([]);
	});
});

describe('ALLOWED_DUPLICATES', () => {
	it('gives every accepted duplicate a reason', () => {
		for (const entry of ALLOWED_DUPLICATES) {
			expect(entry.reason.trim()).not.toBe('');
		}
	});
});
