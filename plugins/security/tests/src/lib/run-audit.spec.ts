import { describe, expect, it } from 'vitest';

import type { IScanResult } from '@mcp-vertex/core/public';

import { runSecurityAudit } from '../../../src/lib/audit/run-audit';

const result = (tool: string, over: Partial<IScanResult>): IScanResult => ({
	tool,
	findings: [],
	summary: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
	ranAt: 'now',
	...over,
});

describe('runSecurityAudit', () => {
	it('runs every scanner and aggregates into one ranked backlog', async () => {
		const aggregate = await runSecurityAudit([
			async () =>
				result('secrets', {
					findings: [
						{ ruleId: 'aws', severity: 'critical', message: 'key' },
					],
				}),
			async () =>
				result('bun-audit', {
					findings: [
						{ ruleId: 'cve', severity: 'high', message: 'vuln' },
					],
				}),
			async () =>
				result('licenses', {
					findings: [
						{ ruleId: 'lic', severity: 'medium', message: 'gpl' },
					],
				}),
		]);
		expect(aggregate.tools).toEqual(['secrets', 'bun-audit', 'licenses']);
		expect(aggregate.worst).toBe('critical');
		expect(aggregate.findings.map((f) => f.severity)).toEqual([
			'critical',
			'high',
			'medium',
		]);
	});

	it('carries a skipped scanner through without failing', async () => {
		const aggregate = await runSecurityAudit([
			async () => result('secrets', {}),
			async () =>
				result('bun-audit', { skipped: true, note: 'bun missing' }),
		]);
		expect(aggregate.tools).toEqual(['secrets']);
		expect(aggregate.skipped).toEqual([
			{ tool: 'bun-audit', note: 'bun missing' },
		]);
		expect(aggregate.worst).toBe('none');
	});
});
