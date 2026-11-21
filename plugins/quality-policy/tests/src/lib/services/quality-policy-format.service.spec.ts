import { describe, expect, it } from 'vitest';

import { finalizeQualityPolicyOutput } from '../../../../src/lib/services/quality-policy-format.service';
import type { IQualityPolicyOutput } from '../../../../src/lib/contracts/interfaces/quality-policy.interface';

const buildRawOutput = (): Omit<
	IQualityPolicyOutput,
	'bytes' | 'truncated' | 'originalBytes'
> => ({
	tests: {
		summary: 'tests summary',
		mode: 'tests-after',
		source: 'config',
		guidance: ['one', 'two', 'three'],
		runner: 'vitest',
		mockApi: 'vi',
		evidence: 'cheap',
	},
	conventions: {
		summary: 'conventions summary',
		sampledPaths: [
			{ path: 'a.ts', role: 'source' },
			{ path: 'b.ts', role: 'source' },
			{ path: 'c.ts', role: 'test' },
			{ path: 'd.ts', role: 'test' },
			{ path: 'e.ts', role: 'config' },
		],
		roleCounts: { source: 2, test: 2, config: 1 },
	},
	lint: {
		summary: 'lint summary',
		scopes: ['root', 'apps/web', 'packages/core'],
		presets: [
			{ area: 'root', presetId: 'typescript', reason: 'root config' },
			{ area: 'apps/web', presetId: 'astro', reason: 'astro config' },
			{
				area: 'packages/core',
				presetId: 'typescript',
				reason: 'tsconfig',
			},
		],
	},
	types: {
		summary: 'types summary',
		strict: true,
		exactOptionalPropertyTypes: true,
		noUncheckedIndexedAccess: true,
		noImplicitOverride: true,
		tsconfigChain: ['tsconfig.json', 'tsconfig.base.json'],
	},
	coverage: {
		summary: 'coverage summary',
		runner: 'vitest',
		coverageThreshold: {
			lines: 90,
			functions: 90,
			branches: 85,
			statements: 90,
		},
		static: true,
	},
	dependsOn: ['a', 'b', 'c'],
});

describe('quality-policy-format.service', () => {
	it('unit > finalizeQualityPolicyOutput > preserves the rich payload when under budget', () => {
		const output = finalizeQualityPolicyOutput(buildRawOutput(), 10_000);

		expect(output.truncated).toBe(false);
		expect(output.originalBytes).toBeUndefined();
		expect(output.tests?.guidance).toEqual(['one', 'two', 'three']);
		expect(output.conventions?.sampledPaths).toHaveLength(5);
		expect(output.lint?.presets).toHaveLength(3);
	});

	it('unit > finalizeQualityPolicyOutput > compacts arrays before dropping summaries', () => {
		const output = finalizeQualityPolicyOutput(buildRawOutput(), 600);

		expect(output.truncated).toBe(true);
		expect(output.originalBytes).toBeTypeOf('number');
		expect((output.tests?.guidance?.length ?? 0) <= 2).toBe(true);
		expect((output.conventions?.sampledPaths?.length ?? 0) <= 4).toBe(true);
		expect((output.lint?.presets?.length ?? 0) <= 2).toBe(true);
		expect(output.dependsOn).toEqual(['a', 'b', 'c']);
	});

	it('unit > finalizeQualityPolicyOutput > falls back to dependsOn plus tests summary at tiny budgets', () => {
		const output = finalizeQualityPolicyOutput(buildRawOutput(), 120);

		expect(output.truncated).toBe(true);
		expect(output.dependsOn).toEqual(['a', 'b', 'c']);
		expect(output.tests).toEqual({ summary: 'tests summary' });
		expect(output.conventions).toBeUndefined();
		expect(output.lint).toBeUndefined();
		expect(output.types).toBeUndefined();
		expect(output.coverage).toBeUndefined();
	});
});
