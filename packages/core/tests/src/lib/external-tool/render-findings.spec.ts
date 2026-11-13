import { describe, expect, it } from 'vitest';

import {
	renderFindingSummary,
	sortFindings,
	summarizeFindings,
	toScanResult,
	worstSeverity,
} from '../../../../src/lib/external-tool/render-findings';
import type { IFinding } from '../../../../src/lib/contracts/interfaces/finding.interface';

const f = (
	severity: IFinding['severity'],
	file?: string,
	line?: number,
): IFinding => ({
	ruleId: `${severity}-${file ?? 'x'}-${line ?? 0}`,
	severity,
	message: `${severity} issue`,
	...(file !== undefined
		? { location: { file, ...(line !== undefined ? { line } : {}) } }
		: {}),
});

describe('summarizeFindings', () => {
	it('counts per severity band, zero-filled', () => {
		const counts = summarizeFindings([f('critical'), f('low'), f('low')]);
		expect(counts).toEqual({
			critical: 1,
			high: 0,
			medium: 0,
			low: 2,
			info: 0,
		});
	});
});

describe('worstSeverity', () => {
	it('returns the most severe band present', () => {
		expect(worstSeverity([f('low'), f('critical'), f('medium')])).toBe(
			'critical',
		);
	});

	it('returns undefined for no findings', () => {
		expect(worstSeverity([])).toBeUndefined();
	});
});

describe('sortFindings', () => {
	it('orders by severity, then file, then line', () => {
		const sorted = sortFindings([
			f('low', 'b.ts', 1),
			f('critical', 'z.ts', 9),
			f('critical', 'a.ts', 5),
			f('critical', 'a.ts', 2),
		]);
		expect(
			sorted.map(
				(x) => `${x.severity}:${x.location?.file}:${x.location?.line}`,
			),
		).toEqual([
			'critical:a.ts:2',
			'critical:a.ts:5',
			'critical:z.ts:9',
			'low:b.ts:1',
		]);
	});

	it('does not mutate the input', () => {
		const input = [f('low'), f('critical')];
		sortFindings(input);
		expect(input[0]?.severity).toBe('low');
	});
});

describe('toScanResult', () => {
	it('derives the summary and a timestamp', () => {
		const result = toScanResult('deps', [f('high')], {
			ranAt: '2026-07-23T00:00:00.000Z',
		});
		expect(result.tool).toBe('deps');
		expect(result.summary.high).toBe(1);
		expect(result.ranAt).toBe('2026-07-23T00:00:00.000Z');
		expect(result.skipped).toBeUndefined();
	});

	it('carries skipped + note when provided', () => {
		const result = toScanResult('deps', [], {
			skipped: true,
			note: 'install bun',
		});
		expect(result.skipped).toBe(true);
		expect(result.note).toBe('install bun');
	});
});

describe('renderFindingSummary', () => {
	it('renders a skipped scan with its note', () => {
		const result = toScanResult('gitleaks', [], {
			skipped: true,
			note: 'brew install gitleaks',
		});
		expect(renderFindingSummary(result)).toBe(
			'gitleaks: skipped (brew install gitleaks)',
		);
	});

	it('renders "no findings" for a clean scan', () => {
		expect(renderFindingSummary(toScanResult('deps', []))).toBe(
			'deps: no findings',
		);
	});

	it('renders counts most-severe first', () => {
		const result = toScanResult('deps', [
			f('medium'),
			f('medium'),
			f('critical'),
		]);
		expect(renderFindingSummary(result)).toBe(
			'deps: 3 findings — 1 critical, 2 medium',
		);
	});
});
