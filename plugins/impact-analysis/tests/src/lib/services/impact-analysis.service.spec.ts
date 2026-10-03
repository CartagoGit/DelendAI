import { describe, expect, it } from 'vitest';

import {
	buildCoverageFocus,
	inferRisk,
	selectSkipSample,
} from '../../../../src/lib/services/impact-analysis.service';

describe('impact-analysis.service', () => {
	it('unit > inferRisk > returns high when packages/core is affected', () => {
		const risk = inferRisk(['packages/core', 'plugins/demo'], []);

		expect(risk).toBe('high');
	});

	it('unit > selectSkipSample > excludes scheduled tests and caps the sample', () => {
		const skip = selectSkipSample(
			[
				'a.spec.ts',
				'b.spec.ts',
				'c.spec.ts',
				'd.spec.ts',
				'e.spec.ts',
				'f.spec.ts',
				'g.spec.ts',
			],
			['b.spec.ts', 'e.spec.ts'],
		);

		expect(skip).not.toContain('b.spec.ts');
		expect(skip).not.toContain('e.spec.ts');
		expect(skip.length).toBeLessThanOrEqual(6);
		expect(skip).toEqual([
			'a.spec.ts',
			'c.spec.ts',
			'd.spec.ts',
			'f.spec.ts',
			'g.spec.ts',
		]);
	});

	it('unit > buildCoverageFocus > prefers affected packages, then falls back to run package scopes', () => {
		expect(
			buildCoverageFocus(
				['plugins/demo', 'packages/core'],
				['tools/tests/a.spec.ts'],
			),
		).toEqual(['plugins/demo', 'packages/core']);
		expect(
			buildCoverageFocus(
				[],
				[
					'packages/core/tests/src/foo.spec.ts',
					'plugins/demo/tests/src/demo.spec.ts',
					'tools/tests/a.spec.ts',
				],
			),
		).toEqual(['packages/core', 'plugins/demo', 'tools']);
	});
});
