import { describe, expect, it } from 'vitest';

import { summarizeQualityReport } from './run-quality.script';

describe('run-quality.script', () => {
	it('returns severity ok when every scope passes', () => {
		const report = summarizeQualityReport({
			results: [
				{ scope: 'lint', errors: [] },
				{ scope: 'test', errors: [] },
			],
			summary: { ok: true, scopes: 2 },
		});
		expect(report).toEqual({
			ok: true,
			severity: 'ok',
			findings: [],
			summary: { ok: true, scopes: 2 },
		});
	});

	it('returns severity error and prefixes findings with the scope', () => {
		const report = summarizeQualityReport({
			results: [
				{ scope: 'lint', errors: [] },
				{ scope: 'test', errors: ['vitest run: boom'] },
			],
			summary: { ok: false, scopes: 2 },
		});
		expect(report).toEqual({
			ok: false,
			severity: 'error',
			findings: ['test: vitest run: boom'],
			summary: { ok: false, scopes: 2 },
		});
	});
});
