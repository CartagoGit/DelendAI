/**
 * scan-scope.helper.spec.ts — the paths a scan never reads, and the shape
 * its ranked findings are reported in.
 */
import { describe, expect, it } from 'vitest';

import {
	findingsReport,
	isOutsideScanScope,
} from '../../../../src/lib/shared/scan-scope.helper';

describe('isOutsideScanScope', () => {
	it('leaves out dependencies, build output, caches and VCS data, anywhere', () => {
		for (const path of [
			'node_modules/a/index.js',
			'packages/x/dist/a.js',
			'.git/config',
			'apps/web/.astro/types.d.ts',
			'coverage/lcov.info',
		])
			expect(isOutsideScanScope(path), path).toBe(true);
		expect(isOutsideScanScope('src/distance.ts')).toBe(false);
		expect(isOutsideScanScope('docs/build-notes.md')).toBe(false);
	});
});

describe('findingsReport', () => {
	it('cuts the list at the cap, keeping the true total and the worst severity', () => {
		const findings = [
			{ ruleId: 'a', severity: 'high' as const, message: 'a' },
			{ ruleId: 'b', severity: 'low' as const, message: 'b' },
		];
		const report = findingsReport(findings, 1);
		expect(report).toMatchObject({
			total: 2,
			truncated: true,
			worst: 'high',
		});
		expect(report.findings).toHaveLength(1);
		expect(report.summary.high).toBe(1);
		expect(findingsReport([], 5)).toMatchObject({
			total: 0,
			truncated: false,
			worst: 'none',
		});
	});
});
