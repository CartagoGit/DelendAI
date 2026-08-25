import { describe, expect, it } from 'vitest';

import {
	buildTruncatedContextOutput,
	formatTestPolicySummary,
	limitContextPreview,
} from '../../../../src/lib/services/context-for-change-format.service';

describe('context-for-change-format.service', () => {
	it('unit > limitContextPreview > adds an ellipsis when the preview exceeds the budget', () => {
		const preview = limitContextPreview('abcdefghij', 6);

		expect(preview).toBe('abcde…');
	});

	it('unit > formatTestPolicySummary > resolves the configured mode with its first guidance rule', () => {
		const summary = formatTestPolicySummary('tests-after');

		expect(summary).toContain('tests-after');
		expect(summary).toContain('config');
		expect(summary.length).toBeGreaterThan('tests-after (config): '.length);
	});

	it('unit > buildTruncatedContextOutput > returns a bounded git section with metadata', () => {
		const output = buildTruncatedContextOutput(
			{
				value: {
					__truncated: true,
					head: { preview: 'symbol summary', refs: ['a.ts', 'b.ts'] },
				},
				finalBytes: 180,
				originalBytes: 640,
			},
			['src/lib/foo.ts'],
		);

		expect(output.truncated).toBe(true);
		expect(output.bytes).toBe(180);
		expect(output.originalBytes).toBe(640);
		expect(output.files).toEqual(['src/lib/foo.ts']);
		expect(output.sections).toHaveLength(1);
		expect(output.sections[0]).toMatchObject({ source: 'git' });
		expect(output.sections[0]?.summary).toContain('Output truncated');
		expect(output.sections[0]?.summary).toContain('symbol summary');
	});
});
