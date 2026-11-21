import { describe, expect, it } from 'vitest';

import { aggregateScans } from '../../../../src/lib/external-tool/aggregate-scans';
import { toScanResult } from '../../../../src/lib/external-tool/render-findings';
import type { IFinding } from '../../../../src/lib/contracts/interfaces/finding.interface';

const f = (severity: IFinding['severity'], file: string): IFinding => ({
	ruleId: `${severity}-${file}`,
	severity,
	message: `${severity} in ${file}`,
	location: { file },
});

describe('aggregateScans', () => {
	it('merges findings across scans, most-severe first', () => {
		const agg = aggregateScans([
			toScanResult('secrets', [f('low', 'a.ts'), f('critical', 'b.ts')]),
			toScanResult('deps', [f('high', 'c.ts')]),
		]);
		expect(agg.tools).toEqual(['secrets', 'deps']);
		expect(agg.findings.map((x) => x.severity)).toEqual([
			'critical',
			'high',
			'low',
		]);
		expect(agg.worst).toBe('critical');
		expect(agg.summary).toMatchObject({ critical: 1, high: 1, low: 1 });
	});

	it('separates skipped scans and excludes them from the totals', () => {
		const agg = aggregateScans([
			toScanResult('secrets', [f('medium', 'a.ts')]),
			toScanResult('deps', [], { skipped: true, note: 'bun missing' }),
		]);
		expect(agg.tools).toEqual(['secrets']);
		expect(agg.skipped).toEqual([{ tool: 'deps', note: 'bun missing' }]);
		expect(agg.findings).toHaveLength(1);
	});

	it('reports worst=none for an all-clean run', () => {
		const agg = aggregateScans([toScanResult('secrets', [])]);
		expect(agg.worst).toBe('none');
		expect(agg.findings).toEqual([]);
	});
});
