import { describe, expect, it } from 'vitest';

import type { IScanResult } from '@mcp-vertex/core/public';

import { runSecurityAudit } from '../../../src/lib/audit/run-audit';

const depsResult = (over: Partial<IScanResult>): IScanResult => ({
	tool: 'bun-audit',
	findings: [],
	summary: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
	ranAt: 'now',
	...over,
});

describe('runSecurityAudit', () => {
	it('aggregates secret + dependency findings into one ranked backlog', async () => {
		const { aggregate, scanned } = await runSecurityAudit(
			async () => ({
				scanned: 5,
				findings: [
					{
						ruleId: 'aws',
						severity: 'critical',
						message: 'leaked key',
					},
				],
			}),
			async () =>
				depsResult({
					findings: [
						{ ruleId: 'cve', severity: 'high', message: 'vuln' },
					],
					summary: {
						critical: 0,
						high: 1,
						medium: 0,
						low: 0,
						info: 0,
					},
				}),
		);
		expect(scanned).toBe(5);
		expect(aggregate.tools).toEqual(['secrets', 'bun-audit']);
		expect(aggregate.worst).toBe('critical');
		expect(aggregate.findings.map((f) => f.severity)).toEqual([
			'critical',
			'high',
		]);
	});

	it('carries a skipped dependency scan through without failing', async () => {
		const { aggregate } = await runSecurityAudit(
			async () => ({ scanned: 1, findings: [] }),
			async () => depsResult({ skipped: true, note: 'bun missing' }),
		);
		expect(aggregate.tools).toEqual(['secrets']);
		expect(aggregate.skipped).toEqual([
			{ tool: 'bun-audit', note: 'bun missing' },
		]);
		expect(aggregate.worst).toBe('none');
	});
});
