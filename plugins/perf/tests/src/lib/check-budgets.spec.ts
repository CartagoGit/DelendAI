import { describe, expect, it } from 'vitest';

import {
	checkBudgets,
	formatBytes,
	totalBytes,
} from '../../../src/lib/perf/check-budgets';
import type { IFileSize } from '../../../src/lib/contracts/interfaces/perf.interface';

const files: IFileSize[] = [
	{ path: 'dist/a.js', bytes: 1000 },
	{ path: 'dist/big.js', bytes: 5000 },
];

describe('formatBytes', () => {
	it('renders bytes, KB and MB', () => {
		expect(formatBytes(512)).toBe('512 B');
		expect(formatBytes(2048)).toBe('2.0 KB');
		expect(formatBytes(2 * 1024 * 1024)).toBe('2.00 MB');
	});
});

describe('totalBytes', () => {
	it('sums the file sizes', () => {
		expect(totalBytes(files)).toBe(6000);
	});
});

describe('checkBudgets', () => {
	it('is clean with no budgets', () => {
		expect(checkBudgets(files, {})).toEqual([]);
	});

	it('flags a file over the per-file budget', () => {
		const findings = checkBudgets(files, { maxFileBytes: 2000 });
		expect(findings).toHaveLength(1);
		expect(findings[0]?.ruleId).toBe('file-over-budget');
		expect(findings[0]?.message).toContain('dist/big.js');
	});

	it('escalates to high when a file is more than 2x over budget', () => {
		const findings = checkBudgets(files, { maxFileBytes: 2000 });
		// big.js is 5000 > 2*2000 → high; a.js (1000) is under budget.
		expect(findings[0]?.severity).toBe('high');
	});

	it('uses medium when a file is over but within 2x', () => {
		const findings = checkBudgets(files, { maxFileBytes: 4000 });
		expect(findings[0]?.severity).toBe('medium');
	});

	it('flags the total over the total budget', () => {
		const findings = checkBudgets(files, { maxTotalBytes: 4000 });
		expect(findings.some((f) => f.ruleId === 'total-over-budget')).toBe(
			true,
		);
	});

	it('is clean when everything is within budget', () => {
		expect(
			checkBudgets(files, { maxFileBytes: 9000, maxTotalBytes: 9000 }),
		).toEqual([]);
	});
});
